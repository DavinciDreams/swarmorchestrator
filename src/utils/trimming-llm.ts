/**
 * Trimming LLM Wrapper
 *
 * Wraps a LangChain chat model to automatically trim conversation history
 * when approaching context limits, preventing "prompt too long" errors.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { ChatResult } from "@langchain/core/outputs";
import { ContextManager, estimateTokens, type ContextManagerConfig } from "./context-manager.js";

export interface TrimmingLLMConfig extends ContextManagerConfig {
  /** Log when trimming occurs */
  verbose?: boolean;
  /** Estimated tokens in system prompt (for budget calculation) */
  systemPromptTokens?: number;
}

/**
 * Create a proxy that wraps an LLM to automatically trim messages
 */
export function createTrimmingLLM<T extends BaseChatModel>(
  llm: T,
  config: TrimmingLLMConfig = {}
): T {
  const manager = new ContextManager(config);
  const verbose = config.verbose ?? false;
  const systemPromptTokens = config.systemPromptTokens ?? 0;

  // Create a proxy to intercept the _generate method
  return new Proxy(llm, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Intercept _generate to trim messages
      if (prop === "_generate" && typeof value === "function") {
        return async function (
          messages: BaseMessage[],
          options?: any,
          runManager?: CallbackManagerForLLMRun
        ): Promise<ChatResult> {
          let processedMessages = messages;

          if (manager.needsTrimming(messages, systemPromptTokens)) {
            const stats = manager.getStats(messages, systemPromptTokens);
            if (verbose) {
              console.warn(
                `[trimming-llm] Context at ${stats.utilizationPercent}% ` +
                `(${stats.estimatedTokens}/${stats.maxTokens} tokens, ${stats.messageCount} messages). Trimming...`
              );
            }
            processedMessages = manager.trimMessages(messages, systemPromptTokens);
            if (verbose) {
              const newStats = manager.getStats(processedMessages, systemPromptTokens);
              console.warn(
                `[trimming-llm] After trim: ${newStats.utilizationPercent}% ` +
                `(${newStats.messageCount} messages)`
              );
            }
          }

          // Call the original _generate with trimmed messages
          return value.call(target, processedMessages, options, runManager);
        };
      }

      // Intercept invoke/call methods too (they eventually call _generate)
      if ((prop === "invoke" || prop === "call") && typeof value === "function") {
        return async function (...args: any[]) {
          // These methods have different signatures, but messages are usually first
          // We rely on _generate interception for the actual trimming
          return value.apply(target, args);
        };
      }

      return value;
    },
  });
}

/**
 * Estimate system prompt tokens from the prompt string
 */
export function estimateSystemPromptTokens(systemPrompt: string): number {
  return estimateTokens(systemPrompt);
}
