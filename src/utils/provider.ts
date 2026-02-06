/**
 * Shared Provider Resolution
 *
 * Extracted from orchestrator.ts for use by both the orchestrator
 * and the LangChain execution backend.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type Provider = "anthropic" | "zai" | "openrouter" | "openai";

export interface ProviderSpec {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  name: string;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export function resolveProvider(provider: Provider, config: ProviderConfig): ProviderSpec {
  switch (provider) {
    case "zai":
      return {
        name: "z.ai",
        apiKey: config.apiKey ?? process.env.ZAI_API_KEY,
        baseUrl: config.baseUrl ?? process.env.ZAI_BASE_URL ?? "https://api.z.ai/v1",
        model: config.model ?? process.env.ZAI_MODEL ?? "glm-4.7",
      };
    case "openrouter":
      return {
        name: "OpenRouter",
        apiKey: config.apiKey ?? process.env.OPENROUTER_API_KEY,
        baseUrl: config.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
        model: config.model ?? process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4",
      };
    case "openai":
      return {
        name: "OpenAI",
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
        baseUrl: config.baseUrl ?? process.env.OPENAI_BASE_URL,
        model: config.model ?? "gpt-4o",
      };
    case "anthropic":
      return {
        name: "Anthropic",
        apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.CLAUDE_CODE_OAUTH_TOKEN,
        baseUrl: undefined,
        model: config.model ?? "claude-opus-4-5-20251101",
      };
  }
}

export function buildLlmFromSpec(spec: ProviderSpec, provider: Provider): BaseChatModel {
  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? spec.apiKey;

    return new ChatAnthropic({
      model: spec.model,
      temperature: 0,
      maxTokens: 16384,
      ...(apiKey ? { anthropicApiKey: apiKey } : {}),
    });
  }

  // All others are OpenAI-compatible
  const headers: Record<string, string> = {};

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/swarm-orchestrato";
    headers["X-Title"] = "Swarm Orchestrato";
  }

  return new ChatOpenAI({
    model: spec.model,
    temperature: 0,
    maxTokens: 16384,
    apiKey: spec.apiKey,
    ...(spec.baseUrl ? { configuration: { baseURL: spec.baseUrl, defaultHeaders: headers } } : {}),
  });
}
