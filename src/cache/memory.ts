import { LRUCache } from "lru-cache";
import type { Cache, ChatCompletionResponse } from "../types.js";
import { getLogger } from "../utils/logger.js";
import { truncateKeyForLogging } from "../utils/cache-utils.js";

export class MemoryCache implements Cache {
  private cache: LRUCache<string, ChatCompletionResponse>;

  constructor(maxItems: number = 1000, ttlSeconds: number = 3600) {
    this.cache = new LRUCache<string, ChatCompletionResponse>({
      max: maxItems,
      ttl: ttlSeconds * 1000,
    });

    getLogger().info({ maxItems, ttlSeconds }, "Memory cache initialized");
  }

  async get(key: string): Promise<ChatCompletionResponse | null> {
    const value = this.cache.get(key);
    if (value) {
      getLogger().debug({ key: truncateKeyForLogging(key) }, "Cache hit");
      return { ...value, cached: true };
    }
    getLogger().debug({ key: truncateKeyForLogging(key) }, "Cache miss");
    return null;
  }

  async set(key: string, value: ChatCompletionResponse): Promise<void> {
    this.cache.set(key, value);
    getLogger().debug({ key: truncateKeyForLogging(key) }, "Cache set");
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    getLogger().info("Memory cache cleared");
  }

  async disconnect(): Promise<void> {
    // No-op for in-memory cache
  }

  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }
}
