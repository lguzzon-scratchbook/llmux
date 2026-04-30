import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MemoryCache, createCache, generateCacheKey, CacheManager } from "../cache/index.js";
import type { ChatCompletionRequest, ChatCompletionResponse, CacheConfig } from "../types.js";

// Suppress logger output during tests
const mod = await import("../utils/logger.js");
mod.createLogger({ level: "error", pretty: false });

describe("MemoryCache", () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(100, 60); // max 100 items, 60s TTL
  });

  afterEach(async () => {
    await cache.clear();
    await cache.disconnect();
  });

  describe("get/set operations", () => {
    test("returns null for non-existent key", async () => {
      const result = await cache.get("non-existent-key");
      expect(result).toBeNull();
    });

    test("stores and retrieves response", async () => {
      const key = "test-key-123";
      const response: ChatCompletionResponse = {
        id: "resp_123",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello!" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      await cache.set(key, response);
      const result = await cache.get(key);

      expect(result).not.toBeNull();
      expect(result?.id).toBe("resp_123");
      expect(result?.cached).toBe(true);
      expect(result?.choices[0].message.content).toBe("Hello!");
    });

    test("cached flag is added on retrieval", async () => {
      const response: ChatCompletionResponse = {
        id: "resp_456",
        object: "chat.completion",
        created: 1000,
        model: "gpt-3.5",
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        cached: false, // explicitly false in stored value
      };

      await cache.set("key1", response);
      const result = await cache.get("key1");

      expect(result?.cached).toBe(true);
    });

    test("overwrites existing entry", async () => {
      const key = "overwrite-key";
      const response1: ChatCompletionResponse = {
        id: "resp_v1",
        object: "chat.completion",
        created: 1000,
        model: "model-v1",
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
      const response2: ChatCompletionResponse = {
        id: "resp_v2",
        object: "chat.completion",
        created: 2000,
        model: "model-v2",
        choices: [],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
      };

      await cache.set(key, response1);
      await cache.set(key, response2);

      const result = await cache.get(key);
      expect(result?.id).toBe("resp_v2");
      expect(result?.model).toBe("model-v2");
    });
  });

  describe("delete operations", () => {
    test("deletes stored response", async () => {
      const response: ChatCompletionResponse = {
        id: "resp_del",
        object: "chat.completion",
        created: 1000,
        model: "test",
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };

      await cache.set("del-key", response);
      expect(await cache.get("del-key")).not.toBeNull();

      await cache.delete("del-key");
      expect(await cache.get("del-key")).toBeNull();
    });
  });

  describe("clear operations", () => {
    test("clears all entries", async () => {
      const response: ChatCompletionResponse = {
        id: "resp",
        object: "chat.completion",
        created: 1000,
        model: "test",
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };

      await cache.set("key1", response);
      await cache.set("key2", response);
      expect(cache.getStats().size).toBe(2);

      await cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe("stats", () => {
    test("returns correct size and maxSize", () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(100);
    });
  });

  describe("disconnect", () => {
    test("is no-op for memory cache", async () => {
      await expect(cache.disconnect()).resolves.toBeUndefined();
    });
  });
});

describe("generateCacheKey", () => {
  test("generates consistent hash for same request", () => {
    const request: ChatCompletionRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.7,
    };

    const key1 = generateCacheKey(request);
    const key2 = generateCacheKey(request);

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[a-f0-9]{15,16}$/); // xxHash64 hex
  });

  test("generates different keys for different requests", () => {
    const req1: ChatCompletionRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };
    const req2: ChatCompletionRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hi there" }],
    };

    const key1 = generateCacheKey(req1);
    const key2 = generateCacheKey(req2);

    expect(key1).not.toBe(key2);
  });

  test("includes all relevant fields in key", () => {
    const base: ChatCompletionRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Test" }],
    };

    const withTemp: ChatCompletionRequest = {
      ...base,
      temperature: 0.5,
    };
    const withTopP: ChatCompletionRequest = {
      ...base,
      top_p: 0.9,
    };
    const withMaxTokens: ChatCompletionRequest = {
      ...base,
      max_tokens: 100,
    };
    const withStop: ChatCompletionRequest = {
      ...base,
      stop: ["END"],
    };
    const withPresence: ChatCompletionRequest = {
      ...base,
      presence_penalty: 0.5,
    };
    const withFrequency: ChatCompletionRequest = {
      ...base,
      frequency_penalty: 0.5,
    };

    expect(generateCacheKey(base)).not.toBe(generateCacheKey(withTemp));
    expect(generateCacheKey(base)).not.toBe(generateCacheKey(withTopP));
    expect(generateCacheKey(base)).not.toBe(generateCacheKey(withMaxTokens));
    expect(generateCacheKey(base)).not.toBe(generateCacheKey(withStop));
    expect(generateCacheKey(base)).not.toBe(generateCacheKey(withPresence));
    expect(generateCacheKey(base)).not.toBe(generateCacheKey(withFrequency));
  });

  test("ignores non-cache-affecting fields", () => {
    const base: ChatCompletionRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Test" }],
    };

    // These should NOT affect cache key (verified below)
    const withStream: ChatCompletionRequest = { ...base, stream: true };
    const withUser: ChatCompletionRequest = { ...base, user: "user123" };

    const baseKey = generateCacheKey(base);

    // stream and user are NOT in keyData, so these should match
    expect(generateCacheKey(withStream)).toBe(baseKey);
    expect(generateCacheKey(withUser)).toBe(baseKey);
  });
});

describe("createCache", () => {
  test("returns null when cache disabled", () => {
    const config: CacheConfig = {
      enabled: false,
      backend: "memory",
      memory: { max_items: 100, ttl: 3600 },
      redis: { url: "redis://localhost", ttl: 3600, key_prefix: "" },
    };

    const cache = createCache(config);
    expect(cache).toBeNull();
  });

  test("creates MemoryCache for memory backend", () => {
    const config: CacheConfig = {
      enabled: true,
      backend: "memory",
      memory: { max_items: 500, ttl: 1800 },
      redis: { url: "", ttl: 3600, key_prefix: "" },
    };

    const cache = createCache(config);
    expect(cache).toBeInstanceOf(MemoryCache);
  });

  test("defaults to MemoryCache for unknown backend", () => {
    const config: CacheConfig = {
      enabled: true,
      backend: "unknown" as any,
      memory: { max_items: 100, ttl: 3600 },
      redis: { url: "", ttl: 3600, key_prefix: "" },
    };

    const cache = createCache(config);
    expect(cache).toBeInstanceOf(MemoryCache);
  });
});

describe("CacheManager", () => {
  describe("isEnabled", () => {
    test("returns false when cache is disabled", () => {
      const manager = new CacheManager({
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      });

      expect(manager.isEnabled()).toBe(false);
    });

    test("returns true when cache is enabled", () => {
      const manager = new CacheManager({
        enabled: true,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      });

      expect(manager.isEnabled()).toBe(true);
    });
  });

  describe("get with cache disabled", () => {
    test("always returns null", async () => {
      const manager = new CacheManager({
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      });

      const request: ChatCompletionRequest = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
      };

      const result = await manager.get(request);
      expect(result).toBeNull();
    });
  });

  describe("get with cache override", () => {
    test("returns null when request.cache is false", async () => {
      const manager = new CacheManager({
        enabled: true,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      });

      const request: ChatCompletionRequest = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        cache: false,
      };

      // First store something
      const response: ChatCompletionResponse = {
        id: "resp",
        object: "chat.completion",
        created: 1000,
        model: "gpt-4",
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
      await manager.set(request, response);

      // Should still return null due to cache: false
      const result = await manager.get(request);
      expect(result).toBeNull();
    });
  });

  describe("set with streaming request", () => {
    test("does not cache streaming responses", async () => {
      const manager = new CacheManager({
        enabled: true,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      });

      const request: ChatCompletionRequest = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      };

      const response: ChatCompletionResponse = {
        id: "resp",
        object: "chat.completion",
        created: 1000,
        model: "gpt-4",
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };

      await manager.set(request, response);

      // Should not be cached
      const result = await manager.get({ ...request, stream: false });
      expect(result).toBeNull();
    });
  });

  describe("clear and disconnect", () => {
    test("clear works with disabled cache", async () => {
      const manager = new CacheManager({
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      });

      await expect(manager.clear()).resolves.toBeUndefined();
    });

    test("disconnect works with disabled cache", async () => {
      const manager = new CacheManager({
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      });

      await expect(manager.disconnect()).resolves.toBeUndefined();
    });
  });
});
