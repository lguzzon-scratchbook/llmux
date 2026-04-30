import type { ChatCompletionRequest } from "../types.js";

export function truncateKeyForLogging(key: string): string {
  return `${key.slice(0, 32)}...`;
}

export function sanitizeProviderRequest(
  req: ChatCompletionRequest,
): Omit<ChatCompletionRequest, "provider" | "cache"> {
  const { provider: _, cache: __, ...rest } = req;
  return rest;
}

export const SSE_DONE_SENTINEL = "data: [DONE]";
