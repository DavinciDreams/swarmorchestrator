/**
 * Context Window Manager
 *
 * Manages conversation history to prevent "prompt too long" errors.
 * Estimates token counts and trims older messages when approaching limits.
 */

import type { BaseMessage } from "@langchain/core/messages";

/** Approximate tokens per character (conservative estimate) */
const CHARS_PER_TOKEN = 3.5;

/** Default context limits by model family */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-opus-4": 200000,
  "claude-sonnet-4": 200000,
  "claude-3": 200000,
  "gpt-4o": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "glm-4": 128000,
  default: 100000,
};

export interface ContextManagerConfig {
  /** Maximum tokens to use (defaults based on model) */
  maxTokens?: number;
  /** Percentage of max tokens to trigger trimming (default: 0.85) */
  trimThreshold?: number;
  /** Minimum messages to keep after trimming (default: 4) */
  minMessages?: number;
  /** Model name for auto-detecting limits */
  model?: string;
}

/**
 * Estimate token count for a string
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate token count for a message
 */
export function estimateMessageTokens(message: BaseMessage): number {
  const content = typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

  // Add overhead for message structure (~20 tokens)
  return estimateTokens(content) + 20;
}

/**
 * Get context limit for a model
 */
export function getModelContextLimit(model: string): number {
  const modelLower = model.toLowerCase();

  for (const [pattern, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (pattern !== "default" && modelLower.includes(pattern)) {
      return limit;
    }
  }

  return MODEL_CONTEXT_LIMITS.default;
}

/**
 * Context Manager for handling conversation history
 */
export class ContextManager {
  private maxTokens: number;
  private trimThreshold: number;
  private minMessages: number;

  constructor(config: ContextManagerConfig = {}) {
    const modelLimit = config.model
      ? getModelContextLimit(config.model)
      : MODEL_CONTEXT_LIMITS.default;

    this.maxTokens = config.maxTokens ?? modelLimit;
    this.trimThreshold = config.trimThreshold ?? 0.85;
    this.minMessages = config.minMessages ?? 4;
  }

  /**
   * Calculate total tokens for a list of messages
   */
  calculateTotalTokens(messages: BaseMessage[], systemPromptTokens = 0): number {
    const messageTokens = messages.reduce(
      (sum, msg) => sum + estimateMessageTokens(msg),
      0
    );
    return systemPromptTokens + messageTokens;
  }

  /**
   * Check if messages need trimming
   */
  needsTrimming(messages: BaseMessage[], systemPromptTokens = 0): boolean {
    const total = this.calculateTotalTokens(messages, systemPromptTokens);
    const threshold = this.maxTokens * this.trimThreshold;
    return total > threshold;
  }

  /**
   * Trim messages to fit within context window.
   * Keeps the most recent messages and removes older ones from the middle.
   * Always preserves the first message (usually contains initial context).
   */
  trimMessages(messages: BaseMessage[], systemPromptTokens = 0): BaseMessage[] {
    if (messages.length <= this.minMessages) {
      return messages;
    }

    const targetTokens = this.maxTokens * this.trimThreshold;
    let currentTokens = this.calculateTotalTokens(messages, systemPromptTokens);

    if (currentTokens <= targetTokens) {
      return messages;
    }

    // Create a mutable copy
    const trimmed = [...messages];

    // Remove messages from the middle (index 1 to len-minMessages)
    // Keep first message and last minMessages
    while (
      currentTokens > targetTokens &&
      trimmed.length > this.minMessages
    ) {
      // Remove the second message (after the first, before recent ones)
      const removeIndex = 1;
      const removed = trimmed.splice(removeIndex, 1)[0];
      currentTokens -= estimateMessageTokens(removed);
    }

    return trimmed;
  }

  /**
   * Get trimming stats
   */
  getStats(messages: BaseMessage[], systemPromptTokens = 0): {
    messageCount: number;
    estimatedTokens: number;
    maxTokens: number;
    utilizationPercent: number;
    needsTrimming: boolean;
  } {
    const estimatedTokens = this.calculateTotalTokens(messages, systemPromptTokens);
    return {
      messageCount: messages.length,
      estimatedTokens,
      maxTokens: this.maxTokens,
      utilizationPercent: Math.round((estimatedTokens / this.maxTokens) * 100),
      needsTrimming: this.needsTrimming(messages, systemPromptTokens),
    };
  }
}

/**
 * Create a middleware function that trims messages before each invocation
 */
export function createContextMiddleware(config: ContextManagerConfig = {}) {
  const manager = new ContextManager(config);

  return {
    manager,
    /**
     * Process messages before sending to LLM
     */
    process(messages: BaseMessage[], systemPromptTokens = 0): BaseMessage[] {
      if (manager.needsTrimming(messages, systemPromptTokens)) {
        console.warn(
          `[context-manager] Trimming conversation history ` +
          `(${messages.length} messages, ~${manager.calculateTotalTokens(messages, systemPromptTokens)} tokens)`
        );
        return manager.trimMessages(messages, systemPromptTokens);
      }
      return messages;
    },
  };
}
