/**
 * Agent SDK Backend
 *
 * Wraps @anthropic-ai/claude-agent-sdk query() for Claude-native execution.
 * Use with EXECUTION_BACKEND=agent-sdk (requires Claude Agent SDK).
 */

import type { ExecutionBackend, ExecutionMessage, ExecutionOptions } from "../execution-backend.js";

export class AgentSdkBackend implements ExecutionBackend {
  readonly name = "agent-sdk";

  async *execute(prompt: string, options: ExecutionOptions): AsyncIterable<ExecutionMessage> {
    // Dynamic import so the SDK is only required when this backend is used
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    const queryOptions: Record<string, unknown> = {
      allowedTools: options.allowedTools,
      permissionMode: options.permissionMode,
    };

    for await (const message of query({ prompt, options: queryOptions })) {
      if ("tool_use" in message) {
        yield { type: "tool_use", content: (message as any).tool_use };
      } else if ("tool_result" in message) {
        yield { type: "tool_result", content: (message as any).tool_result };
      } else if ("result" in message) {
        yield { type: "result", content: (message as any).result };
      } else if ("error" in message) {
        yield { type: "error", content: (message as any).error };
      }
    }
  }
}
