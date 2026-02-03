/**
 * Swarm Orchestrato — Entrypoint
 *
 * Starts the orchestrator deep agent in an interactive loop,
 * accepting goals and coordinating swarms until the mission is complete.
 */

import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { createOrchestrator, type Provider } from "./orchestrator.js";
import { disconnect } from "./mcp/client.js";
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║        SWARM ORCHESTRATO v1.0.0              ║");
  console.log("║   DeepAgent Swarm Orchestrator               ║");
  console.log("║   Powered by DeepAgents.js + Claude Flow MCP ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log();

  const provider = (process.env.LLM_PROVIDER as Provider | undefined) ?? "anthropic";
  const fallback = (process.env.LLM_FALLBACK_PROVIDER as Provider | undefined);
  const { agent, recursionLimit, providerName } = await createOrchestrator({
    provider,
    fallbackProvider: fallback,
    workDir: process.env.ORCHESTRATOR_WORKDIR ?? "./orchestrator-workspace",
  });

  const threadId = `orchestrator-${Date.now()}`;
  console.log(`Provider: ${providerName}`);
  console.log(`Session: ${threadId}`);
  console.log('Type your goal or mission. Type "exit" to quit.\n');

  while (true) {
    const input = await prompt("mission> ");
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "exit") {
      console.log("\nShutting down orchestrator...");
      break;
    }

    try {
      console.log("\n--- Orchestrator processing ---\n");

      const result: Record<string, any> = await agent.invoke(
        { messages: [new HumanMessage(trimmed)] },
        {
          recursionLimit,
          configurable: { thread_id: threadId },
        },
      );

      // Print the assistant's final response
      const messages = result.messages ?? [];
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && "content" in lastMessage) {
        const content =
          typeof lastMessage.content === "string"
            ? lastMessage.content
            : JSON.stringify(lastMessage.content, null, 2);
        console.log("\n" + content);
      }

      // Print current todos if any
      if (result.todos && result.todos.length > 0) {
        console.log("\n--- Active Todos ---");
        for (const todo of result.todos) {
          const icon =
            todo.status === "completed"
              ? "[x]"
              : todo.status === "in_progress"
                ? "[~]"
                : "[ ]";
          console.log(`  ${icon} ${todo.content}`);
        }
      }

      console.log();
    } catch (err) {
      console.error("Orchestrator error:", err);
      console.log("Continuing...\n");
    }
  }

  await disconnect();
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
