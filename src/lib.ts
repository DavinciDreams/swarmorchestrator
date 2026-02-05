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

// Agent SDK exports (mirrors SunBurpBot architecture)
export {
  BaseAgent,
  SwarmAgent,
  TaskAgent,
  MemoryAgent,
  WorkerAgent,
  EvaluatorAgent,
  AgentCoordinator,
} from "./agents/index.js";

export type {
  AgentConfig,
  QueryOptions,
  AgentMessage,
  AgentResult,
  SwarmConfig,
  SwarmResult,
  TaskConfig,
  TaskResult,
  TaskDecomposition,
  MemoryNamespace,
  MemoryEntry,
  MemorySearchResult,
  PatternEntry,
  WorkerType,
  WorkerConfig,
  WorkerResult,
  ChunkResult,
  EvaluationCriteria,
  EvaluationResult,
  TaskEvaluation,
  CoordinatorConfig,
  CoordinatedTaskResult,
  CoordinatorMetrics,
} from "./agents/index.js";

// Project context utilities
export {
  setProjectRoot,
  getProjectRoot,
  isWithinProject,
  validatePath,
  extractAndValidatePaths,
  getProjectContextString,
  toRelativePath,
  toAbsolutePath,
} from "./utils/project-context.js";
