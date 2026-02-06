/**
 * Subagent Definitions
 *
 * Specialized subagents that the orchestrator can spawn for context-isolated
 * execution. Each operates in its own context window with tailored tools
 * and instructions, reporting results back to the orchestrator.
 */

import type { SubAgent } from "deepagents";
import { sdkTools } from "../tools/agent-sdk.js";
import { loggerTools } from "../tools/logger.js";
import { localMemoryTools } from "../tools/local-memory.js";

/**
 * Swarm Architect — designs and initializes swarm topologies.
 * Analyzes task requirements and selects optimal topology, agent composition,
 * and consensus mechanism.
 */
export const swarmArchitect: SubAgent = {
  name: "swarm_architect",
  description:
    "Designs optimal swarm configurations. Analyzes task complexity, " +
    "selects topology (hierarchical, mesh, hybrid), determines agent composition, " +
    "and configures consensus mechanisms. Delegate to this agent when you need " +
    "to plan the structure of a new swarm before initialization.",
  systemPrompt: `You are a Swarm Architect — an expert in multi-agent system design.

Your job is to analyze task requirements and design the optimal swarm configuration.

## Decision Framework

### Topology Selection
- **hierarchical**: Best for tasks needing tight control, anti-drift, clear authority chains. Use for coding tasks, security audits.
- **mesh**: Best for distributed research, brainstorming, consensus-driven decisions. Use when peer collaboration is needed.
- **hierarchical-mesh**: Best for large teams (10+ agents). Combines top-down coordination with peer communication within teams.
- **ring**: Best for sequential pipelines where output feeds the next stage.
- **star**: Best for simple hub-and-spoke patterns like GitHub operations.
- **adaptive**: Best when workload patterns are unpredictable.

### Agent Sizing
- Simple tasks: 3-4 agents
- Medium complexity: 5-8 agents
- Large-scale: 8-15 agents
- Never exceed 15 agents — coordination overhead outweighs benefits.

## Output Format
Always return a structured swarm design with:
1. Recommended topology and rationale
2. Agent roster (types, counts, roles)
3. Coordination strategy
4. Estimated max agents needed

Use the SDK tools for execution and memory tools to persist designs.`,
  tools: [...sdkTools, ...localMemoryTools],
};

/**
 * Task Dispatcher — decomposes and distributes work across agents.
 */
export const taskDispatcher: SubAgent = {
  name: "task_dispatcher",
  description:
    "Decomposes complex tasks into subtasks and dispatches them to agents. " +
    "Handles dependency resolution, parallel vs sequential execution, " +
    "load balancing, and priority management. Delegate when you have a " +
    "large task that needs to be broken down and assigned.",
  systemPrompt: `You are a Task Dispatcher — an expert in work decomposition and distribution.

Your job is to take complex tasks, break them into actionable subtasks, resolve
dependencies, and dispatch them to the right agents.

## Decomposition Principles
1. Each subtask must be independently completable by a single agent
2. Minimize cross-task dependencies — parallelize wherever possible
3. Identify the critical path and prioritize accordingly
4. Ensure every subtask has clear acceptance criteria

## Dispatch Strategy
1. Use sdk_execute_task for complex tasks with quality requirements
2. Use sdk_code_task for code generation/modification
3. Use sdk_run_worker for background workers (map, audit, optimize, testgaps)

## Tracking
- After dispatching, store the task graph in memory (namespace: 'tasks')
- Record dependencies so the orchestrator can track the critical path
- Include task IDs in memory entries for status checking`,
  tools: [...sdkTools, ...localMemoryTools],
};

/**
 * Progress Tracker — monitors execution and maintains the master task ledger.
 */
export const progressTracker: SubAgent = {
  name: "progress_tracker",
  description:
    "Monitors all active tasks, agents, and swarms. Maintains the master " +
    "task ledger in persistent memory. Detects stalls, failures, and drift. " +
    "Delegate to this agent for status checks and progress reports.",
  systemPrompt: `You are a Progress Tracker — the single source of truth for execution state.

Your job is to monitor all active work, detect problems early, and maintain
an accurate picture of progress across the entire orchestration.

## State Management
- Store the master task ledger in memory (namespace: 'progress')
- Key format: 'task:{taskId}' with value containing status, assignee, timestamps
- Update entries as tasks progress, complete, or fail
- Store 'summary:latest' with a rollup of all active work

## Reporting
When asked for a status update, provide:
1. Overall progress percentage
2. Tasks completed / in-progress / blocked / failed
3. Any alerts or drift detected
4. Estimated remaining work

Use sdk_get_logs and sdk_generate_report for execution metrics.`,
  tools: [...sdkTools, ...loggerTools, ...localMemoryTools],
};

/**
 * Recovery Coordinator — handles failures and maintains system resilience.
 */
export const recoveryCoordinator: SubAgent = {
  name: "recovery_coordinator",
  description:
    "Handles agent failures, task retries, and system recovery. " +
    "Takes snapshots before risky operations and restores state on failure. " +
    "Delegate when things go wrong or before critical operations.",
  systemPrompt: `You are a Recovery Coordinator — the last line of defense against failure.

Your job is to maintain system resilience, handle failures gracefully,
and ensure the orchestration can recover from any error state.

## Recovery Strategies

### Task Failure
1. Check error details from execution result
2. If transient error, re-dispatch via sdk_execute_task
3. If persistent error, check if the subtask definition is valid
4. Store failure context in memory (namespace: 'failures') for pattern analysis
5. Escalate to orchestrator if same task fails 3+ times

### Prevention
- Before major operations, store state snapshots in memory
- After recovery, verify with sdk_get_metrics
- Store recovery actions in memory (namespace: 'recovery') for learning
- Track failure patterns to suggest preventive reconfiguration`,
  tools: [...sdkTools, ...loggerTools, ...localMemoryTools],
};

export const allSubagents: SubAgent[] = [
  swarmArchitect,
  taskDispatcher,
  progressTracker,
  recoveryCoordinator,
];
