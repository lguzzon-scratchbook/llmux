import { describe, test, expect } from "bun:test";
import type { FastifyRequest, FastifyReply } from "fastify";
import { createAuthMiddleware } from "../middleware/auth.js";
import type { Config } from "../types.js";

// Mock logger to suppress output during tests
const mod = await import("../utils/logger.js");
mod.createLogger({ level: "error", pretty: false });

describe("createAuthMiddleware", () => {
  const createMockRequest = (authHeader?: string): Partial<FastifyRequest> => ({
    headers: authHeader ? { authorization: authHeader } : {},
  });

  const createMockReply = (): Partial<FastifyReply> & {
    statusCode?: number;
    payload?: unknown;
  } => {
    const reply: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
        return this;
      },
    };
    return reply;
  };

  describe("with no auth configured", () => {
    const config: Config = {
      server: { port: 3000, host: "0.0.0.0" },
      auth: {},
      providers: {},
      routing: { default_strategy: "round-robin", fallback_chain: [], model_aliases: {} },
      cache: {
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      },
      logging: { level: "info", pretty: false },
    };

    test("allows request without auth header", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(200);
    });

    test("allows request with any auth header", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("Bearer invalid-key") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(200);
    });
  });

  describe("with single api_key configured", () => {
    const config: Config = {
      server: { port: 3000, host: "0.0.0.0" },
      auth: { api_key: "secret-key-123" },
      providers: {},
      routing: { default_strategy: "round-robin", fallback_chain: [], model_aliases: {} },
      cache: {
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      },
      logging: { level: "info", pretty: false },
    };

    test("rejects request without auth header", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply as any).payload).toEqual({
        error: {
          message: "Missing Authorization header",
          type: "authentication_error",
          code: "missing_api_key",
        },
      });
    });

    test("rejects invalid api key", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("Bearer wrong-key") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply as any).payload).toEqual({
        error: {
          message: "Invalid API key",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      });
    });

    test("accepts valid Bearer token", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("Bearer secret-key-123") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(req.clientLabel).toBe("default");
    });

    test("accepts raw key without Bearer prefix", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("secret-key-123") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(req.clientLabel).toBe("default");
    });
  });

  describe("with multiple api_keys configured", () => {
    const config: Config = {
      server: { port: 3000, host: "0.0.0.0" },
      auth: {
        api_keys: {
          client1: "key-for-client1",
          client2: "key-for-client2",
        },
      },
      providers: {},
      routing: { default_strategy: "round-robin", fallback_chain: [], model_aliases: {} },
      cache: {
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      },
      logging: { level: "info", pretty: false },
    };

    test("accepts first client key and attaches correct label", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("Bearer key-for-client1") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(req.clientLabel).toBe("client1");
    });

    test("accepts second client key and attaches correct label", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("Bearer key-for-client2") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(200);
      expect(req.clientLabel).toBe("client2");
    });

    test("rejects key not in api_keys map", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("Bearer unknown-key") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(401);
    });

    test("combines api_key and api_keys (both valid)", async () => {
      const configWithBoth: Config = {
        ...config,
        auth: {
          api_key: "legacy-key",
          api_keys: {
            client1: "key-for-client1",
          },
        },
      };

      const middleware = createAuthMiddleware(configWithBoth);

      // Legacy key works
      const req1 = createMockRequest("Bearer legacy-key") as FastifyRequest;
      const reply1 = createMockReply() as FastifyReply;
      await middleware(req1, reply1);
      expect(reply1.statusCode).toBe(200);
      expect(req1.clientLabel).toBe("default");

      // api_keys entry also works
      const req2 = createMockRequest("Bearer key-for-client1") as FastifyRequest;
      const reply2 = createMockReply() as FastifyReply;
      await middleware(req2, reply2);
      expect(reply2.statusCode).toBe(200);
      expect(req2.clientLabel).toBe("client1");
    });
  });

  describe("edge cases", () => {
    const config: Config = {
      server: { port: 3000, host: "0.0.0.0" },
      auth: { api_key: "test-key" },
      providers: {},
      routing: { default_strategy: "round-robin", fallback_chain: [], model_aliases: {} },
      cache: {
        enabled: false,
        backend: "memory",
        memory: { max_items: 100, ttl: 3600 },
        redis: { url: "", ttl: 3600, key_prefix: "" },
      },
      logging: { level: "info", pretty: false },
    };

    test("handles empty auth header", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(401);
    });

    test("handles Bearer with empty key", async () => {
      const middleware = createAuthMiddleware(config);
      const req = createMockRequest("Bearer ") as FastifyRequest;
      const reply = createMockReply() as FastifyReply;

      await middleware(req, reply);

      expect(reply.statusCode).toBe(401);
    });
  });
});
