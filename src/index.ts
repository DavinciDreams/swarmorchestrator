/**
 * Swarm Orchestrato — Entrypoint
 *
 * Starts the orchestrator deep agent in an interactive loop,
 * accepting goals and coordinating swarms until the mission is complete.
 */

import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { createOrchestrator, type Provider } from "./orchestrator.js";
import { initializeTaskQueueManager } from "./utils/task-queue-manager.js";
import * as readline from "node:readline";
import * as path from "node:path";

/**
 * Check if an error is a "prompt too long" error
 */
function isPromptTooLongError(err: any): boolean {
  const msg = String(err?.cause?.message ?? err?.message ?? err).toLowerCase();
  return (
    msg.includes("prompt too long") ||
    msg.includes("context_length_exceeded") ||
    msg.includes("maximum context length") ||
    msg.includes("token limit") ||
    (msg.includes("400") && msg.includes("too long"))
  );
}

async function main() {
  const executionBackend = process.env.EXECUTION_BACKEND ?? "langchain";

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║        SWARM ORCHESTRATO v1.0.0              ║");
  console.log("║   DeepAgent Swarm Orchestrator               ║");
  console.log("║   Powered by DeepAgents.js                   ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log();
  console.log(`Execution backend: ${executionBackend}`);

  // Initialize task queue manager and clean up stale tasks
  console.log("Initializing task queue manager...");
  try {
    await initializeTaskQueueManager({
      maxTaskAgeHours: 24, // Cancel tasks older than 24 hours
      maxPendingTasks: 50, // Warn if queue exceeds 50 tasks
      autoCleanupOnStartup: true,
    });
  } catch (err) {
    console.warn("Task queue cleanup failed (continuing):", err);
  }

  // Project root is REQUIRED — defaults to current working directory
  // Set ORCHESTRATOR_PROJECT_ROOT to override
  const projectRoot = path.resolve(process.env.ORCHESTRATOR_PROJECT_ROOT ?? process.cwd());

  // Provider defaults: Anthropic primary, z.ai fallback
  const provider = (process.env.LLM_PROVIDER as Provider | undefined);
  const fallback = (process.env.LLM_FALLBACK_PROVIDER as Provider | undefined);
  const { agent, recursionLimit, providerName, projectRoot: resolvedRoot } = await createOrchestrator({
    projectRoot,
    provider,
    fallbackProvider: fallback,
    workDir: process.env.ORCHESTRATOR_WORKDIR ?? "./orchestrator-workspace",
  });

  let threadId = `orchestrator-${Date.now()}`;
  let messageCount = 0;

  console.log(`Provider: ${providerName}`);
  console.log(`Project: ${resolvedRoot}`);
  console.log(`Session: ${threadId}`);
  console.log('Commands: "exit" to quit, "reset" to start fresh session\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });

  let running = true;

  // Handle readline close gracefully
  rl.on("close", () => {
    running = false;
  });

  const prompt = (question: string): Promise<string | null> => {
    if (!running) return Promise.resolve(null);
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer));
    });
  };

  while (running) {
    const input = await prompt("mission> ");

    // Handle EOF or closed readline
    if (input === null) {
      console.log("\nInput closed, shutting down...");
      break;
    }

    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "exit") {
      console.log("\nShutting down orchestrator...");
      break;
    }
    if (trimmed.toLowerCase() === "reset") {
      threadId = `orchestrator-${Date.now()}`;
      messageCount = 0;
      console.log(`\nSession reset. New session: ${threadId}\n`);
      continue;
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

      messageCount++;

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
    } catch (err: any) {
      // Extract meaningful error message
      const errorMsg = err?.cause?.message ?? err?.message ?? String(err);
      console.error("\nOrchestrator error:", errorMsg);

      // Check for common issues
      if (errorMsg.includes("authentication") || errorMsg.includes("api-key") || errorMsg.includes("401")) {
        console.error("Hint: Check your ANTHROPIC_API_KEY or LLM_PROVIDER setting in .env");
      } else if (isPromptTooLongError(err)) {
        console.error("\n╔══════════════════════════════════════════════════════════════╗");
        console.error("║  CONTEXT LIMIT EXCEEDED                                      ║");
        console.error("╠══════════════════════════════════════════════════════════════╣");
        console.error("║  The conversation history has grown too large for the model. ║");
        console.error("║                                                              ║");
        console.error("║  Options:                                                    ║");
        console.error("║    1. Type 'reset' to start a fresh session                  ║");
        console.error("║    2. Reduce complexity of your requests                     ║");
        console.error("║    3. Use a model with larger context (200K Claude, etc.)    ║");
        console.error("╚══════════════════════════════════════════════════════════════╝");
        console.error(`\nCurrent session has ~${messageCount} interactions.`);
      }

      console.log("Continuing...\n");
    }
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
