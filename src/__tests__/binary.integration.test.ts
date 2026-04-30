import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync, readdirSync } from "node:fs";
import { tmpdir, platform, arch } from "node:os";
import { join } from "node:path";

// Get binary path for current platform (matching scripts/build.ts logic)
async function getBinaryPath(): Promise<string> {
  const pkgContent = await Bun.file("package.json").text();
  const pkg = JSON.parse(pkgContent);
  const version = pkg.version || "0.0.0";

  const plat = platform();
  const architecture = arch();

  const platformMap: Record<string, string> = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  };

  const archMap: Record<string, string> = {
    x64: "x64",
    arm64: "arm64",
  };

  const mappedPlatform = platformMap[plat];
  const mappedArch = archMap[architecture];

  if (!mappedPlatform || !mappedArch) {
    throw new Error(`Unsupported platform/architecture: ${plat}-${architecture}`);
  }

  const extension = plat === "win32" ? ".exe" : "";
  return `dist/llmux-v${version}-${mappedPlatform}-${mappedArch}${extension}`;
}

// Check if binary exists and is newer than all source files
function isBinaryUpToDate(binaryPath: string): boolean {
  if (!existsSync(binaryPath)) {
    return false;
  }

  const binaryMtime = statSync(binaryPath).mtimeMs;

  // Check if any source file is newer than binary
  function checkDir(dir: string): boolean {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!checkDir(fullPath)) return false;
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        if (statSync(fullPath).mtimeMs > binaryMtime) {
          return false; // Source file is newer
        }
      }
    }
    return true;
  }

  return checkDir("src");
}

describe("Binary Build Integration", () => {
  let tempDir: string;
  let configPath: string;
  let binaryPath: string;
  let server: ChildProcess;
  let baseUrl: string;
  const apiKey = "test-binary-key";
  const port = 19002; // Use non-standard port to avoid conflicts

  let buildTime: number;
  let startupTime: number;

  beforeAll(async () => {
    const totalStart = performance.now();

    // Get binary path first to check if caching is possible
    binaryPath = await getBinaryPath();

    // Build binary for current platform (with caching)
    if (isBinaryUpToDate(binaryPath)) {
      console.log(`Using cached binary: ${binaryPath}`);
      buildTime = 0;
    } else {
      console.log("Building binary...");
      const buildStart = performance.now();
      const buildResult = await Bun.$`bun run build:binary`.quiet();
      if (buildResult.exitCode !== 0) {
        throw new Error(`Binary build failed with exit code ${buildResult.exitCode}`);
      }
      buildTime = performance.now() - buildStart;
      console.log(`Binary built in ${buildTime.toFixed(0)}ms`);
    }

    console.log(`Binary path: ${binaryPath}`);

    // Verify binary exists
    if (!existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`);
    }

    // Create temp directory for test config
    tempDir = mkdtempSync(join(tmpdir(), "llmux-binary-test-"));
    configPath = join(tempDir, "config.yaml");

    // Write test config with mock provider (for health test only, not real LLM calls)
    const config = `server:
  port: ${port}
  host: "127.0.0.1"

auth:
  api_key: ${apiKey}

providers:
  groq:
    enabled: true
    api_key: mock-key-for-health-test-only
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 1

routing:
  default_strategy: round-robin
  fallback_chain:
    - groq
  model_aliases:
    fast:
      groq: llama-3.1-8b-instant

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

    // Start server using built binary
    baseUrl = `http://127.0.0.1:${port}`;

    server = spawn(binaryPath, [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LLMUX_CONFIG_PATH: configPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Wait for server to be ready
    const startupStart = performance.now();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Server failed to start within 30s"));
      }, 30000);

      const checkReady = async () => {
        try {
          const res = await fetch(`${baseUrl}/health`, {
            headers: { Authorization: `Bearer ${apiKey}` },
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
    startupTime = performance.now() - startupStart;

    const totalTime = performance.now() - totalStart;
    console.log(
      `Setup complete: build=${buildTime.toFixed(0)}ms, startup=${startupTime.toFixed(0)}ms, total=${totalTime.toFixed(0)}ms`,
    );
  }, 60000); // 60s timeout for build + startup

  afterAll(() => {
    if (server && !server.killed) {
      server.kill("SIGTERM");
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    // Clean up built binary
    if (binaryPath && existsSync(binaryPath)) {
      rmSync(binaryPath);
    }
  });

  test("GET /health returns 200", async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("status", "ok");
  }, 10000);

  test("GET /health/providers returns provider status", async () => {
    const response = await fetch(`${baseUrl}/health/providers`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("providers");
    expect(typeof data.providers).toBe("object");
    expect(data.providers).toHaveProperty("groq");
    expect(data.providers.groq).toHaveProperty("healthy");
  }, 10000);
});
