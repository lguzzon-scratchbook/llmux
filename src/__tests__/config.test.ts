import { describe, test, expect } from "bun:test";
import { loadConfig } from "../utils/config.js";

describe("loadConfig", () => {
  test("throws error when config file not found", () => {
    expect(() => loadConfig("/nonexistent/config.yaml")).toThrow();
  });
});
