/**
 * Swarm Orchestrator — Deep Agent
 *
 * A DeepAgents.js agent whose sole purpose is to coordinate and dispatch
 * agent swarms, track tasks and todos, and ensure long-term autonomous
 * execution stays on target. It delegates all actual work to swarm agents
 * via Claude Flow MCP — it never writes code or does research itself.
 */

import { createDeepAgent, FilesystemBackend } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { allTools } from "./tools/index.js";
import { allSubagents } from "./subagents/index.js";
import { setProjectRoot } from "./utils/project-context.js";
import { createTrimmingLLM, estimateSystemPromptTokens } from "./utils/trimming-llm.js";
import * as path from "node:path";
import * as fs from "node:fs";

// Project binding template - will be injected with actual projectRoot
const PROJECT_BINDING_SECTION = (projectRoot: string) => `
## Project Binding — CRITICAL CONSTRAINT

You are bound to project: **${projectRoot}**

### Absolute Rules
1. **ALL tasks MUST operate within ${projectRoot}** — no exceptions
2. **NEVER create, dispatch, or accept tasks for paths outside this directory**
3. **REJECT any request that would analyze, modify, or reference files outside the project**
4. **When spawning agents, ALWAYS include projectRoot in their context/config**

### Path Validation
- Before dispatching ANY task, verify the target path starts with: ${projectRoot}
- Use relative paths from project root when possible (e.g., "src/tools" not "${projectRoot}/src/tools")
- If a task references an external path, STOP and ask the user to confirm

### Cross-Project Protection
- If you detect task results referencing paths outside ${projectRoot}, flag as SCOPE VIOLATION
- Log all scope violations to memory (namespace: 'failures', tag: 'scope-violation')
- Do NOT process results from tasks that operated outside the project boundary

`;

const ORCHESTRATOR_SYSTEM_PROMPT_TEMPLATE = (projectRoot: string) => `You are the **Swarm Orchestrator** — a command-and-control agent whose sole job is to coordinate agent swarms for maximum autonomous execution. You NEVER do work yourself. You plan, dispatch, track, and course-correct.
${PROJECT_BINDING_SECTION(projectRoot)}
## Core Identity
- You are a **coordinator**, not an executor. You never write code, research topics, or produce artifacts directly.
- Your tools connect to Claude Flow MCP, which manages a fleet of 60+ specialized AI agents.
- You maintain the master execution plan and are the single source of truth for what needs to happen next.
- **You are bound to project: ${projectRoot}** — all work must stay within this directory.

## Operating Loop

On every turn, follow this cycle:

### 1. ORIENT — Understand the situation
- What is the current goal and its acceptance criteria?
- What tasks are in progress, completed, or blocked?
- What agents and swarms are active?
- Use \`memory_search\` to recall relevant context from past execution.
- Use \`swarm_status\` and \`task_status\` to get live state.

### 2. PLAN — Decompose and sequence
- Break the goal into the smallest independently-completable subtasks.
- Identify dependencies: what can run in parallel vs. what must be sequential.
- Use your \`write_todos\` tool aggressively — your todo list IS the master plan.
- Every todo must have clear acceptance criteria (what "done" looks like).
- Store the task graph in memory (namespace: 'tasks') for persistence.

### 3. DISPATCH — Assign work to swarms
- Delegate to your subagents for specialized coordination:
  - **swarm_architect**: When you need to design a new swarm topology
  - **task_dispatcher**: When you need to decompose and distribute tasks
  - **progress_tracker**: When you need a status check across all active work
  - **recovery_coordinator**: When something fails or before risky operations
- Use the direct tools for quick operations:
  - \`swarm_init\` → spin up a swarm
  - \`agent_spawn\` → add agents to a swarm
  - \`task_orchestrate\` → dispatch a task (parallel, sequential, pipeline, or broadcast)
  - \`task_create\` → create individual trackable tasks
  - \`load_balance\` → distribute work efficiently
  - \`agent_broadcast\` → send messages to all agents

### 4. TRACK — Monitor and course-correct
- After dispatching, check \`task_status\` on active tasks.
- Update your todo list as tasks complete, fail, or change scope.
- Persist progress summaries to memory (namespace: 'progress').
- Run \`performance_report\` periodically to detect degradation.
- Run \`health_check\` if anything looks off.

### 5. ADAPT — Handle drift and failures
- Compare actual outputs against acceptance criteria.
- If a task drifts from scope, re-dispatch with tighter constraints.
- If an agent fails, use \`fault_tolerance\` to provide feedback and trigger adaptation.
- If a swarm is underperforming, use \`topology_optimize\` or \`swarm_scale\`.
- Take \`state_snapshot\` before any destructive recovery action.
- Use \`agent_terminate\` to remove problematic agents, \`agent_update\` to reconfigure.

## Anti-Drift Protocol

You are the guardian against scope drift. Every decision must pass this check:
1. Does this action directly advance a tracked todo item?
2. Is it within the acceptance criteria of the current task?
3. Does it avoid introducing unplanned complexity?

If ANY answer is "no", stop and re-evaluate. Log the drift attempt in memory.

## Memory Namespaces

Organize persistent state across these namespaces:
- \`tasks\` — Task definitions, dependencies, and the task graph
- \`progress\` — Completion status, timelines, and rollup summaries
- \`decisions\` — Architecture and strategy decisions with rationale
- \`patterns\` — Learned patterns about what works and what doesn't
- \`failures\` — Failure logs with root causes for future avoidance
- \`recovery\` — Recovery actions taken and their outcomes
- \`context\` — Project context, goals, and acceptance criteria

## Long-Term Execution Rules

1. **Persist everything important** — If you'd need to know it after a context reset, store it in memory.
2. **Todos are sacred** — The todo list is the execution contract. Never lose track of a todo.
3. **Snapshot before risk** — Take state snapshots before scaling, topology changes, or recovery.
4. **Fail fast, recover faster** — Detect failures early, apply fault tolerance immediately.
5. **One coordinator, many workers** — You coordinate. Swarm agents execute. Never blur this line.
6. **Measure everything** — Regular performance reports, bottleneck analysis, and health checks.
7. **Log decisions** — Every strategic decision goes to memory with rationale for future reference.

## Tool Routing Guide

You have two execution paths. Use the right tool for the job:

### MCP Tools (Claude Flow) — Use for coordination
- \`swarm_init\`, \`swarm_status\` — Swarm lifecycle management
- \`agent_spawn\`, \`agent_terminate\` — Agent lifecycle management
- \`task_create\`, \`task_status\` — Task tracking
- \`memory_store\`, \`memory_retrieve\` — State persistence
- \`coordination_*\` — Load balancing, topology optimization

### SDK Tools (Agent SDK) — Use for execution
- \`sdk_execute_task\` — Complex tasks with iterative refinement and quality evaluation
- \`sdk_code_task\` — Code generation, modification, fixes, docs, tests
- \`sdk_audit_task\` — Security, performance, quality, dependency audits
- \`sdk_run_worker\` — Background workers (map, audit, optimize, testgaps)
- \`sdk_get_metrics\` — Monitor SDK execution performance

### Decision Matrix

| Need | Use |
|------|-----|
| Spawn/manage swarm agents | MCP tools |
| Track task status | MCP tools |
| Persist state to memory | MCP tools |
| Execute complex code task | SDK tools |
| Run security audit | SDK tools |
| Generate documentation | SDK tools |
| Build codebase map | SDK tools (\`sdk_run_worker\`) |
| Quality-checked output | SDK tools (iterative refinement) |

**Key difference**: MCP tools manage infrastructure. SDK tools execute work with quality guarantees.

## Swarm Selection Guide

Match the task type to the right swarm:
| Task Type | Swarm | Topology | Agents |
|-----------|-------|----------|--------|
| Development/Coding | coding-swarm | hierarchical-mesh | 8 |
| Research/Analysis | research-swarm | mesh | 6 |
| Security Audit | security-swarm | hierarchical | 5 |
| GitHub/PR/Issues | github-swarm | star | 4 |
| Testing/QA | testing-swarm | hierarchical | 6 |
| UI/UX Design | ui-ux-team-swarm | mesh | 7 |
| Large Research | xl-research-swarm | mesh | 8 |

For novel task types, delegate to the **swarm_architect** to design a custom configuration.

## Response Protocol

Every response must include:
1. **Situation assessment** — What just happened, what's the current state
2. **Actions taken** — What tools you called and why
3. **Updated plan** — Current todo list state and next steps
4. **Risks/blockers** — Anything that could derail execution

## Project Context
- Project Root: \${projectRoot}
- Always prefix file paths with the project root when displaying to user
- Store project root in memory (namespace: 'context', key: 'project-root') on startup`;

export type Provider = "anthropic" | "zai" | "openrouter" | "openai";

export interface OrchestratorConfig {
  /**
   * REQUIRED: Absolute path to the project root directory.
   * All tasks will be constrained to operate within this directory.
   * Prevents cross-project confusion and scope drift.
   */
  projectRoot: string;
  /** LLM provider. Defaults to "zai". Options: zai, openrouter, anthropic, openai. */
  provider?: Provider;
  /** Fallback provider if primary fails auth. e.g. "openrouter". */
  fallbackProvider?: Provider;
  /** API key for the selected provider. Falls back to env vars per provider. */
  apiKey?: string;
  /** Base URL for OpenAI-compatible providers. Falls back to env vars per provider. */
  baseUrl?: string;
  /** Model name. Defaults vary by provider. */
  model?: string;
  /** Working directory for the filesystem backend. */
  workDir?: string;
  /** Path to the SQLite database for persistent checkpointing. Defaults to {workDir}/checkpoints.db */
  checkpointDbPath?: string;
  /** Maximum LangGraph recursion depth. Defaults to 500. */
  recursionLimit?: number;
  /**
   * Enable automatic context trimming to prevent "prompt too long" errors.
   * Defaults to true. Set to false to disable.
   */
  enableContextTrimming?: boolean;
  /** Maximum context tokens (auto-detected from model if not set) */
  maxContextTokens?: number;
}

interface ProviderSpec {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  name: string;
}

function resolveProvider(provider: Provider, config: OrchestratorConfig): ProviderSpec {
  switch (provider) {
    case "zai":
      return {
        name: "z.ai",
        apiKey: config.apiKey ?? process.env.ZAI_API_KEY,
        baseUrl: config.baseUrl ?? process.env.ZAI_BASE_URL ?? "https://api.z.ai/v1",
        model: config.model ?? process.env.ZAI_MODEL ?? "glm-4.7",
      };
    case "openrouter":
      return {
        name: "OpenRouter",
        apiKey: config.apiKey ?? process.env.OPENROUTER_API_KEY,
        baseUrl: config.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
        model: config.model ?? process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4",
      };
    case "openai":
      return {
        name: "OpenAI",
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
        baseUrl: config.baseUrl ?? process.env.OPENAI_BASE_URL,
        model: config.model ?? "gpt-4o",
      };
    case "anthropic":
      return {
        name: "Anthropic",
        // Supports API key, OAuth token, or Claude Code OAuth
        apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.CLAUDE_CODE_OAUTH_TOKEN,
        baseUrl: undefined,
        model: config.model ?? "claude-opus-4-5-20251101",
      };
  }
}

function buildLlmFromSpec(spec: ProviderSpec, provider: Provider): BaseChatModel {
  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? spec.apiKey;

    return new ChatAnthropic({
      model: spec.model,
      temperature: 0,
      maxTokens: 16384,
      ...(apiKey ? { anthropicApiKey: apiKey } : {}),
    });
  }

  // All others are OpenAI-compatible
  const headers: Record<string, string> = {};

  // OpenRouter wants these headers for ranking/analytics
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/swarm-orchestrato";
    headers["X-Title"] = "Swarm Orchestrato";
  }

  return new ChatOpenAI({
    model: spec.model,
    temperature: 0,
    maxTokens: 16384,
    apiKey: spec.apiKey,
    ...(spec.baseUrl ? { configuration: { baseURL: spec.baseUrl, defaultHeaders: headers } } : {}),
  });
}

function buildLlm(config: OrchestratorConfig): { llm: BaseChatModel; providerName: string } {
  // Default: Anthropic (Claude Agent SDK compatible), Fallback: z.ai
  const primary = config.provider ?? (process.env.LLM_PROVIDER as Provider | undefined) ?? "anthropic";
  const fallback = config.fallbackProvider ?? (process.env.LLM_FALLBACK_PROVIDER as Provider | undefined) ?? "zai";

  const spec = resolveProvider(primary, config);

  if (!spec.apiKey) {
    if (fallback) {
      const fallbackSpec = resolveProvider(fallback, { ...config, apiKey: undefined, baseUrl: undefined });
      if (fallbackSpec.apiKey) {
        console.warn(`[orchestrator] ${spec.name} API key missing, falling back to ${fallbackSpec.name}`);
        return { llm: buildLlmFromSpec(fallbackSpec, fallback), providerName: fallbackSpec.name };
      }
    }
    throw new Error(
      `No API key found for provider "${primary}". ` +
      `Set the appropriate env var in your .env file.\n` +
      `  zai         → ZAI_API_KEY\n` +
      `  openrouter  → OPENROUTER_API_KEY\n` +
      `  anthropic   → ANTHROPIC_API_KEY\n` +
      `  openai      → OPENAI_API_KEY`
    );
  }

  return { llm: buildLlmFromSpec(spec, primary), providerName: spec.name };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createOrchestrator(config: OrchestratorConfig): Promise<{
  agent: any;
  recursionLimit: number;
  providerName: string;
  projectRoot: string;
}> {
  // Validate and resolve projectRoot — this is REQUIRED
  if (!config.projectRoot) {
    throw new Error(
      "projectRoot is required in OrchestratorConfig.\n" +
      "This prevents the orchestrator from operating on unintended directories.\n" +
      "Example: createOrchestrator({ projectRoot: '/home/user/my-project' })"
    );
  }

  const projectRoot = path.resolve(config.projectRoot);

  // Verify the project root exists
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`projectRoot does not exist: ${projectRoot}`);
  }

  if (!fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`projectRoot is not a directory: ${projectRoot}`);
  }

  // Set the global project context for path validation
  setProjectRoot(projectRoot);

  const {
    workDir = "./orchestrator-workspace",
    recursionLimit = 500,
    enableContextTrimming = true,
  } = config;

  // Ensure the workspace directory exists
  fs.mkdirSync(workDir, { recursive: true });

  const dbPath = config.checkpointDbPath ?? path.join(workDir, "checkpoints.db");
  const checkpointer = SqliteSaver.fromConnString(dbPath);

  const { llm: baseLlm, providerName } = buildLlm(config);

  // Build the system prompt with project binding
  const systemPrompt = ORCHESTRATOR_SYSTEM_PROMPT_TEMPLATE(projectRoot);

  // Optionally wrap LLM with context trimming to prevent "prompt too long" errors
  const systemPromptTokens = estimateSystemPromptTokens(systemPrompt);
  const llm = enableContextTrimming
    ? createTrimmingLLM(baseLlm, {
        model: config.model,
        maxTokens: config.maxContextTokens,
        systemPromptTokens,
        verbose: true,
      })
    : baseLlm;

  console.log(`[orchestrator] Project bound to: ${projectRoot}`);
  if (enableContextTrimming) {
    console.log(`[orchestrator] Context trimming enabled (system prompt: ~${systemPromptTokens} tokens)`);
  }

  const agent = createDeepAgent({
    name: "swarm-orchestrator",
    model: llm,
    systemPrompt,
    tools: allTools,
    subagents: allSubagents,
    backend: new FilesystemBackend({ rootDir: workDir }),
    checkpointer,
  });

  return { agent, recursionLimit, providerName, projectRoot };
}
