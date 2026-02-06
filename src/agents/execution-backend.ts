/**
 * Execution Backend Interface
 *
 * Defines the contract for pluggable execution backends.
 * Backends can be Agent SDK (Claude-native) or LangChain (any provider).
 */

export interface ExecutionMessage {
  type: "tool_use" | "tool_result" | "result" | "error";
  content: unknown;
}

export interface ExecutionOptions {
  allowedTools?: string[];
  permissionMode?: "ask" | "bypassPermissions";
  model?: "haiku" | "sonnet" | "opus";
  maxTokens?: number;
  [key: string]: unknown;
}

export interface ExecutionBackend {
  readonly name: string;
  execute(prompt: string, options: ExecutionOptions): AsyncIterable<ExecutionMessage>;
}
