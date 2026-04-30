import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatCompletionResponse } from "../types.js";

// Skip test if FIREWORKS_API_KEY not set
const hasApiKey = process.env.FIREWORKS_API_KEY !== undefined;
const describeIf = hasApiKey ? describe : describe.skip;

describeIf("Fireworks Provider Integration", () => {
  let tempDir: string;
  let configPath: string;
  let server: ChildProcess;
  let baseUrl: string;
  const apiKey = "test-fireworks-key";
  const port = 19001; // Use non-standard port to avoid conflicts

  beforeAll(async () => {
    // Create temp directory for test config
    tempDir = mkdtempSync(join(tmpdir(), "llmux-fireworks-test-"));
    configPath = join(tempDir, "config.yaml");

    // Write test config with Fireworks provider and model alias
    const config = `server:
  port: ${port}
  host: "127.0.0.1"

auth:
  api_key: ${apiKey}

providers:
  fireworks:
    enabled: true
    api_key: \${FIREWORKS_API_KEY}
    base_url: https://api.fireworks.ai/inference/v1
    models:
      - accounts/fireworks/routers/kimi-k2p5-turbo
    timeout: 60000
    max_retries: 2

routing:
  default_strategy: round-robin
  fallback_chain:
    - fireworks
  model_aliases:
    claude-sonnet:
      fireworks: accounts/fireworks/routers/kimi-k2p5-turbo

cache:
  enabled: true
  backend: memory
  memory:
    max_items: 100
    ttl: 60

logging:
  level: warn
  pretty: false
`;
    writeFileSync(configPath, config);

    // Start server as separate process
    baseUrl = `http://127.0.0.1:${port}`;

    server = spawn(
      "bun",
      ["run", "src/index.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          LLMUX_CONFIG_PATH: configPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Server failed to start within 30s"));
      }, 30000);

      const checkReady = async () => {
        try {
          const res = await fetch(`${baseUrl}/health`, {
            headers: { "Authorization": `Bearer ${apiKey}` },
          });
          if (res.status === 200) {
            clearTimeout(timeout);
            resolve();
            return;
          }
        } catch {
          // Not ready yet
        }
        setTimeout(checkReady, 100);
      };

      // Start checking after short delay for process startup
      setTimeout(checkReady, 500);
    });
  }, 35000);

  afterAll(() => {
    if (server && !server.killed) {
      server.kill("SIGTERM");
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("POST /v1/chat/completions with claude-sonnet alias returns yEs", async () => {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "claude-sonnet",
        messages: [
          { role: "user", content: "Say to me 'yEs'" },
        ],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    // Validate HTTP 200
    expect(response.status).toBe(200);

    const data = await response.json() as ChatCompletionResponse;

    // Validate response structure
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("object", "chat.completion");
    expect(data).toHaveProperty("created");
    expect(data).toHaveProperty("model");
    expect(data).toHaveProperty("choices");
    expect(Array.isArray(data.choices)).toBe(true);
    expect(data.choices.length).toBeGreaterThan(0);

    const firstChoice = data.choices[0];
    expect(firstChoice).toHaveProperty("message");
    expect(firstChoice.message).toHaveProperty("role", "assistant");
    expect(firstChoice.message).toHaveProperty("content");

    // Validate provider info
    expect(data).toHaveProperty("provider", "fireworks");

    // Extract and validate response contains 'yEs'
    const content = firstChoice.message.content;
    expect(content).toContain("yEs");
  }, 30000);
});
