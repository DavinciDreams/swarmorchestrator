/**
 * Library export — use the orchestrator programmatically.
 *
 * @example
 * ```ts
 * import { createOrchestrator } from "swarm-orchestrato";
 * import { HumanMessage } from "@langchain/core/messages";
 *
 * const { agent, recursionLimit } = createOrchestrator();
 *
 * const result = await agent.invoke(
 *   { messages: [new HumanMessage("Build a REST API with auth")] },
 *   { recursionLimit, configurable: { thread_id: "my-session" } },
 * );
 * ```
 */

export { createOrchestrator } from "./orchestrator.js";
export type { OrchestratorConfig, Provider } from "./orchestrator.js";
export { allTools } from "./tools/index.js";
export { allSubagents } from "./subagents/index.js";
export { getClient, callMcpTool, disconnect } from "./mcp/client.js";
