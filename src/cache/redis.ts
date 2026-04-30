import Redis from "ioredis";
import type { Cache, ChatCompletionResponse } from "../types.js";
import { getLogger } from "../utils/logger.js";
import { truncateKeyForLogging } from "../utils/cache-utils.js";

export class RedisCache implements Cache {
  private client: Redis.default;
  private ttl: number;
  private keyPrefix: string;

  constructor(url: string, ttlSeconds: number = 3600, keyPrefix: string = "llmux:") {
    this.client = new Redis.default(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    this.ttl = ttlSeconds;
    this.keyPrefix = keyPrefix;

    this.client.on("error", (err: Error) => {
      getLogger().error({ error: err.message }, "Redis connection error");
    });

    this.client.on("connect", () => {
      getLogger().info("Redis cache connected");
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  private prefixedKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<ChatCompletionResponse | null> {
    try {
      const value = await this.client.get(this.prefixedKey(key));
      if (!value) {
        getLogger().debug({ key: truncateKeyForLogging(key) }, "Redis cache miss");
        return null;
      }

      try {
        const parsed = JSON.parse(value) as ChatCompletionResponse;
        getLogger().debug({ key: truncateKeyForLogging(key) }, "Redis cache hit");
        return { ...parsed, cached: true };
      } catch (parseError) {
        getLogger().warn(
          { key: truncateKeyForLogging(key), error: (parseError as Error).message },
          "Failed to parse cached value",
        );
        return null;
      }
    } catch (error) {
      getLogger().warn({ error: (error as Error).message }, "Redis get error");
      return null;
    }
  }

  async set(key: string, value: ChatCompletionResponse): Promise<void> {
    try {
      await this.client.setex(this.prefixedKey(key), this.ttl, JSON.stringify(value));
      getLogger().debug({ key: truncateKeyForLogging(key) }, "Redis cache set");
    } catch (error) {
      getLogger().warn({ error: (error as Error).message }, "Redis set error");
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.prefixedKey(key));
    } catch (error) {
      getLogger().warn({ error: (error as Error).message }, "Redis delete error");
    }
  }

  async clear(): Promise<void> {
    try {
      const batchSize = 1000;
      const batch: string[] = [];
      const cursor = this.client.scanStream({
        match: `${this.keyPrefix}*`,
        count: 100,
      });
      for await (const key of cursor) {
        batch.push(key);
        if (batch.length >= batchSize) {
          await this.client.del(...batch);
          batch.length = 0;
        }
      }
      if (batch.length > 0) {
        await this.client.del(...batch);
      }
      getLogger().info("Redis cache cleared");
    } catch (error) {
      getLogger().warn({ error: (error as Error).message }, "Redis clear error");
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
