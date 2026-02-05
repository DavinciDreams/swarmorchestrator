/**
 * Agent exports
 * Mirrors SunBurpBot's agent architecture for consistent SDK usage
 */

// Base agent
export { BaseAgent } from "./base-agent.js";
export type { AgentConfig, QueryOptions, AgentMessage, AgentResult } from "./base-agent.js";

// Specialized agents
export { SwarmAgent } from "./swarm-agent.js";
export type { SwarmConfig, SwarmResult } from "./swarm-agent.js";

export { TaskAgent } from "./task-agent.js";
export type { TaskType, TaskConfig, TaskResult, TaskDecomposition } from "./task-agent.js";

export { MemoryAgent } from "./memory-agent.js";
export type {
  MemoryNamespace,
  MemoryEntry,
  MemorySearchResult,
  PatternEntry,
} from "./memory-agent.js";

export { WorkerAgent } from "./worker-agent.js";
export type { WorkerType, WorkerConfig, WorkerResult, ChunkResult } from "./worker-agent.js";

export { EvaluatorAgent } from "./evaluator-agent.js";
export type {
  EvaluationCriteria,
  EvaluationResult,
  TaskEvaluation,
} from "./evaluator-agent.js";

// Coordinator
export { AgentCoordinator } from "./agent-coordinator.js";
export type {
  CoordinatorConfig,
  CoordinatedTaskResult,
  CoordinatorMetrics,
} from "./agent-coordinator.js";
