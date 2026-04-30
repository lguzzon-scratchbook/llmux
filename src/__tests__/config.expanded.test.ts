import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, getEnabledProviders } from "../utils/config.js";
import type { Config } from "../types.js";

describe("loadConfig - expanded", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "llmux-config-test-"));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    // Clean up env vars
    delete process.env.TEST_VAR;
    delete process.env.TEST_WITH_DEFAULT;
    delete process.env.LLMUX_CONFIG_PATH;
  });

  describe("environment variable interpolation", () => {
    test("interpolates ${VAR} syntax", () => {
      process.env.TEST_VAR = "my-secret-key";

      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: "\${TEST_VAR}"
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      const config = loadConfig(configPath);
      expect(config.auth.api_key).toBe("my-secret-key");
    });

    test("interpolates ${VAR:-default} with default value", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: "\${UNDEFINED_VAR:-fallback-key}"
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      const config = loadConfig(configPath);
      expect(config.auth.api_key).toBe("fallback-key");
    });

    test("prefers env var over default", () => {
      process.env.TEST_WITH_DEFAULT = "real-value";

      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: "\${TEST_WITH_DEFAULT:-default-value}"
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      const config = loadConfig(configPath);
      expect(config.auth.api_key).toBe("real-value");
    });

    test("interpolates env vars in nested objects", () => {
      process.env.REDIS_URL = "redis://custom-host:6379";

      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: test-key
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq]
  model_aliases: {}
cache:
  enabled: true
  backend: redis
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: "\${REDIS_URL}"
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      const config = loadConfig(configPath);
      expect(config.cache.redis.url).toBe("redis://custom-host:6379");
    });

    test("interpolates in arrays", () => {
      process.env.MODEL_NAME = "custom-model";

      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: test-key
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - "\${MODEL_NAME}"
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      const config = loadConfig(configPath);
      expect(config.providers.groq.models).toContain("custom-model");
    });

    test("replaces undefined var with empty string", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: "prefix-\${TOTALLY_UNDEFINED}-suffix"
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      const config = loadConfig(configPath);
      expect(config.auth.api_key).toBe("prefix--suffix");
    });
  });

  describe("config validation", () => {
    test("throws when server.port is missing", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  host: "0.0.0.0"
auth:
  api_key: test-key
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      expect(() => loadConfig(configPath)).toThrow("server.port");
    });

    test("throws when no providers configured", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: test-key
providers: {}
routing:
  default_strategy: round-robin
  fallback_chain: []
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      expect(() => loadConfig(configPath)).toThrow("at least one provider");
    });

    test("throws when no enabled providers have API keys", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: test-key
providers:
  groq:
    enabled: true
    api_key: ""
    base_url: https://api.groq.com/openai/v1
    models: []
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      expect(() => loadConfig(configPath)).toThrow("No providers are enabled");
    });

    test("throws when fallback chain references unknown provider", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: test-key
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [unknown_provider]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      expect(() => loadConfig(configPath)).toThrow("unknown provider");
    });

    test("accepts valid fallback chain", () => {
      const configPath = join(tempDir, "config.yaml");
      writeFileSync(
        configPath,
        `
server:
  port: 3000
  host: "0.0.0.0"
auth:
  api_key: test-key
providers:
  groq:
    enabled: true
    api_key: test-key
    base_url: https://api.groq.com/openai/v1
    models:
      - llama-3.1-8b-instant
    timeout: 30000
    max_retries: 3
  together:
    enabled: true
    api_key: test-key-2
    base_url: https://api.together.xyz/v1
    models:
      - llama-2-70b
    timeout: 30000
    max_retries: 3
routing:
  default_strategy: round-robin
  fallback_chain: [groq, together]
  model_aliases: {}
cache:
  enabled: false
  backend: memory
  memory:
    max_items: 100
    ttl: 3600
  redis:
    url: redis://localhost
    ttl: 3600
    key_prefix: ""
logging:
  level: info
  pretty: false
`,
      );

      const config = loadConfig(configPath);
      expect(config.routing.fallback_chain).toEqual(["groq", "together"]);
    });
  });

  describe("getEnabledProviders", () => {
    const baseConfig: Config = {
      server: { port: 3000, host: "0.0.0.0" },
      auth: { api_key: "test" },
      providers: {
        groq: {
          enabled: true,
          api_key: "key1",
          base_url: "https://api.groq.com",
          models: [],
          timeout: 30000,
          max_retries: 3,
        },
        together: {
          enabled: false,
          api_key: "key2",
          base_url: "https://api.together.xyz",
          models: [],
          timeout: 30000,
          max_retries: 3,
        },
        cerebras: {
          enabled: true,
          api_key: "",
          base_url: "https://api.cerebras.ai",
          models: [],
          timeout: 30000,
          max_retries: 3,
        },
        sambanova: {
          enabled: true,
          api_key: "key3",
          base_url: "https://api.sambanova.ai",
          models: [],
          timeout: 30000,
          max_retries: 3,
        },
      },
      routing: { default_strategy: "round-robin", fallback_chain: [], model_aliases: {} },
      cache: {
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      },
      logging: { level: "info", pretty: false },
    };

    test("returns only enabled providers with valid API keys", () => {
      const enabled = getEnabledProviders(baseConfig);
      expect(enabled).toContain("groq");
      expect(enabled).toContain("sambanova");
      expect(enabled).not.toContain("together"); // disabled
      expect(enabled).not.toContain("cerebras"); // no api_key
      expect(enabled).toHaveLength(2);
    });

    test("returns empty array when no providers enabled", () => {
      const config: Config = {
        ...baseConfig,
        providers: {
          disabled: {
            enabled: false,
            api_key: "key",
            base_url: "https://test.com",
            models: [],
            timeout: 30000,
            max_retries: 3,
          },
        },
      };

      expect(getEnabledProviders(config)).toEqual([]);
    });
  });
});
