import { describe, test, expect } from "bun:test";
import {
  truncateKeyForLogging,
  sanitizeProviderRequest,
  SSE_DONE_SENTINEL,
} from "../utils/cache-utils.js";
import type { ChatCompletionRequest } from "../types.js";

describe("cache-utils", () => {
  describe("truncateKeyForLogging", () => {
    test("truncates long keys to 32 chars + ellipsis", () => {
      const longKey = "a".repeat(100);
      const result = truncateKeyForLogging(longKey);

      expect(result).toBe("a".repeat(32) + "...");
      expect(result.length).toBe(35);
    });

    test("handles short keys without change", () => {
      const shortKey = "short-key";
      const result = truncateKeyForLogging(shortKey);

      expect(result).toBe("short-key...");
    });

    test("handles exact 32-char keys", () => {
      const exactKey = "a".repeat(32);
      const result = truncateKeyForLogging(exactKey);

      expect(result).toBe(exactKey + "...");
    });

    test("handles empty string", () => {
      const result = truncateKeyForLogging("");
      expect(result).toBe("...");
    });
  });

  describe("sanitizeProviderRequest", () => {
    test("removes provider field from request", () => {
      const request: ChatCompletionRequest = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        provider: "groq",
      };

      const sanitized = sanitizeProviderRequest(request);

      expect(sanitized).not.toHaveProperty("provider");
      expect(sanitized.model).toBe("gpt-4");
      expect(sanitized.messages).toHaveLength(1);
    });

    test("removes cache field from request", () => {
      const request: ChatCompletionRequest = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        cache: false,
      };

      const sanitized = sanitizeProviderRequest(request);

      expect(sanitized).not.toHaveProperty("cache");
      expect(sanitized.model).toBe("gpt-4");
    });

    test("removes both provider and cache fields", () => {
      const request: ChatCompletionRequest = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        provider: "groq",
        cache: true,
        temperature: 0.7,
      };

      const sanitized = sanitizeProviderRequest(request);

      expect(sanitized).not.toHaveProperty("provider");
      expect(sanitized).not.toHaveProperty("cache");
      expect(sanitized.temperature).toBe(0.7);
      expect(sanitized.model).toBe("gpt-4");
    });

    test("preserves all other fields", () => {
      const request: ChatCompletionRequest = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "System message" },
          { role: "user", content: "User message" },
        ],
        temperature: 0.5,
        top_p: 0.9,
        max_tokens: 100,
        stream: true,
        stop: ["END"],
        presence_penalty: 0.2,
        frequency_penalty: 0.3,
        user: "user123",
      };

      const sanitized = sanitizeProviderRequest(request);

      expect(sanitized.temperature).toBe(0.5);
      expect(sanitized.top_p).toBe(0.9);
      expect(sanitized.max_tokens).toBe(100);
      expect(sanitized.stream).toBe(true);
      expect(sanitized.stop).toEqual(["END"]);
      expect(sanitized.presence_penalty).toBe(0.2);
      expect(sanitized.frequency_penalty).toBe(0.3);
      expect(sanitized.user).toBe("user123");
      expect(sanitized.messages).toHaveLength(2);
    });
  });

  describe("SSE_DONE_SENTINEL", () => {
    test("has correct value", () => {
      expect(SSE_DONE_SENTINEL).toBe("data: [DONE]");
    });
  });
});
