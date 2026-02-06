/**
 * LangChain Backend
 *
 * Provider-agnostic execution using LangChain ChatModel + ReAct agent.
 * Works with any LangChain-supported provider (Anthropic, OpenAI, OpenRouter, etc.).
 * Use with EXECUTION_BACKEND=langchain (default).
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import type { ExecutionBackend, ExecutionMessage, ExecutionOptions } from "../execution-backend.js";
import { resolveProvider, buildLlmFromSpec, type Provider } from "../../utils/provider.js";
import { createBackendTools } from "./tools/index.js";

export interface LangChainBackendConfig {
  provider: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export class LangChainBackend implements ExecutionBackend {
  readonly name = "langchain";
  private config: LangChainBackendConfig;

  constructor(config: LangChainBackendConfig) {
    this.config = config;
  }

  private buildModel(): BaseChatModel {
    const provider = this.config.provider as Provider;
    const spec = resolveProvider(provider, {
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
    });
    return buildLlmFromSpec(spec, provider);
  }

  async *execute(prompt: string, options: ExecutionOptions): AsyncIterable<ExecutionMessage> {
    const model = this.buildModel();
    const tools = createBackendTools();

    const agent = createReactAgent({
      llm: model,
      tools,
    });

    try {
      const result = await agent.invoke({
        messages: [new HumanMessage(prompt)],
      });

      // Extract tool calls and results from the message history
      const messages = result.messages ?? [];

      for (const msg of messages) {
        if (msg._getType() === "ai") {
          const aiMsg = msg as any;
          // Yield tool use messages
          if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
            for (const toolCall of aiMsg.tool_calls) {
              yield { type: "tool_use", content: { name: toolCall.name, input: toolCall.args } };
            }
          }
        } else if (msg._getType() === "tool") {
          yield { type: "tool_result", content: msg.content };
        }
      }

      // Extract the final AI response
      const lastAiMessage = messages.filter((m: any) => m._getType() === "ai").pop();
      if (lastAiMessage) {
        const content = typeof lastAiMessage.content === "string"
          ? lastAiMessage.content
          : JSON.stringify(lastAiMessage.content);
        yield { type: "result", content };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield { type: "error", content: errorMessage };
    }
  }
}
