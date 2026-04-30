import { describe, test, expect, beforeEach } from "bun:test";
import { ResponseStore } from "../response-store.js";
import type { Response, InputItem } from "../open-responses-types.js";

describe("ResponseStore", () => {
  let store: ResponseStore;

  beforeEach(() => {
    store = new ResponseStore(100, 60000); // small size, 1min TTL for tests
  });

  describe("get/set operations", () => {
    test("returns null for non-existent id", async () => {
      const result = await store.get("non-existent-id");
      expect(result).toBeNull();
    });

    test("stores and retrieves response", async () => {
      const id = "resp_test123";
      const response: Response = {
        id,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: "test-model",
        output: [],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };
      const input: InputItem[] = [{ type: "message", role: "user", content: "Hello" }];

      await store.set(id, response, input);
      const result = await store.get(id);

      expect(result).not.toBeNull();
      expect(result?.response).toEqual(response);
      expect(result?.input).toEqual(input);
    });

    test("overwrites existing entry", async () => {
      const id = "resp_test456";
      const response1: Response = {
        id,
        object: "response",
        created_at: 1000,
        status: "completed",
        model: "model-v1",
        output: [],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      };
      const response2: Response = {
        id,
        object: "response",
        created_at: 2000,
        status: "completed",
        model: "model-v2",
        output: [],
        usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 },
      };

      await store.set(id, response1, []);
      await store.set(id, response2, [{ type: "message", role: "user", content: "Updated" }]);

      const result = await store.get(id);
      expect(result?.response.model).toBe("model-v2");
      expect((result?.input[0] as { content: string }).content).toBe("Updated");
    });
  });

  describe("delete operations", () => {
    test("deletes stored response", async () => {
      const id = "resp_delete_test";
      const response: Response = {
        id,
        object: "response",
        created_at: 1000,
        status: "completed",
        model: "test-model",
        output: [],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      };

      await store.set(id, response, []);
      expect(await store.get(id)).not.toBeNull();

      await store.delete(id);
      expect(await store.get(id)).toBeNull();
    });

    test("deleting non-existent id does not throw", async () => {
      await expect(store.delete("non-existent")).resolves.toBeUndefined();
    });
  });

  describe("clear operations", () => {
    test("clears all stored responses", async () => {
      const response: Response = {
        id: "resp1",
        object: "response",
        created_at: 1000,
        status: "completed",
        model: "test",
        output: [],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      };

      await store.set("resp1", response, []);
      await store.set("resp2", { ...response, id: "resp2" }, []);
      expect(store.size()).toBe(2);

      await store.clear();
      expect(store.size()).toBe(0);
      expect(await store.get("resp1")).toBeNull();
      expect(await store.get("resp2")).toBeNull();
    });
  });

  describe("size tracking", () => {
    test("returns correct size", async () => {
      const response: Response = {
        id: "test",
        object: "response",
        created_at: 1000,
        status: "completed",
        model: "test",
        output: [],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      };

      expect(store.size()).toBe(0);

      await store.set("resp1", response, []);
      expect(store.size()).toBe(1);

      await store.set("resp2", response, []);
      expect(store.size()).toBe(2);

      await store.delete("resp1");
      expect(store.size()).toBe(1);
    });
  });
});
