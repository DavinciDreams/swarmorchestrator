/**
 * Execution Backend Interface
 *
 * Defines the contract for pluggable execution backends.
 * Backends can be Agent SDK (Claude-native) or LangChain (any provider).
 */

export interface ExecutionMessage {
  type: "tool_use" | "tool_result" | "result" | "error" | "metadata";
  content: unknown;
}

/**
 * Metadata emitted by backends at the end of execution.
 * Backends should yield an ExecutionMessage with type "metadata" and
 * content set to this interface.  Fields are optional — backends report
 * what they can and the logger estimates the rest.
 */
export interface ExecutionMetadata {
  /** Model identifier used for this execution (e.g. "claude-sonnet-4-5-20250929") */
  model?: string;
  /** Provider name (e.g. "anthropic", "openai", "google") */
  provider?: string;
  /** Input tokens consumed */
  inputTokens?: number;
  /** Output tokens generated */
  outputTokens?: number;
  /** Total tokens (input + output) — backends may supply this directly */
  totalTokens?: number;
  /** Cache-read tokens (Anthropic prompt caching) */
  cacheReadTokens?: number;
  /** Cache-creation tokens */
  cacheCreationTokens?: number;
  /** Estimated cost in USD (backend can pre-compute or leave for the logger) */
  costUsd?: number;
  /** Number of retries the backend performed (rate-limit, transient errors) */
  retries?: number;
  /** Context window size of the model used */
  contextWindow?: number;
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
