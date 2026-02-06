/**
 * Execution Backend Factory
 *
 * Reads config/env and returns the appropriate backend.
 * Default: langchain (provider-agnostic)
 */

import type { ExecutionBackend } from "../execution-backend.js";
import { AgentSdkBackend } from "./agent-sdk-backend.js";
import { LangChainBackend } from "./langchain-backend.js";

export type BackendType = "agent-sdk" | "langchain";

export interface BackendConfig {
  backend?: BackendType;
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export function createExecutionBackend(config?: BackendConfig): ExecutionBackend {
  const backendType: BackendType =
    config?.backend
    ?? (process.env.EXECUTION_BACKEND as BackendType | undefined)
    ?? "langchain";

  switch (backendType) {
    case "agent-sdk":
      return new AgentSdkBackend();
    case "langchain":
      return new LangChainBackend({
        provider: config?.provider ?? process.env.LLM_PROVIDER ?? "anthropic",
        model: config?.model ?? process.env.AGENT_MODEL,
        apiKey: config?.apiKey,
        baseUrl: config?.baseUrl,
      });
    default:
      throw new Error(`Unknown execution backend: ${backendType}`);
  }
}

export { AgentSdkBackend } from "./agent-sdk-backend.js";
export { LangChainBackend } from "./langchain-backend.js";
