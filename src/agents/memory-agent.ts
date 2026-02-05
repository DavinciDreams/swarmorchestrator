/**
 * Memory Agent - Specialized for memory storage and retrieval
 * Handles persistent state, pattern learning, and context management
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import { getProjectRoot, getProjectContextString } from "../utils/project-context.js";

export type MemoryNamespace =
  | "tasks"
  | "progress"
  | "decisions"
  | "patterns"
  | "failures"
  | "recovery"
  | "context"
  | "workers";

export interface MemoryEntry {
  key: string;
  value: unknown;
  namespace: MemoryNamespace;
  tags?: string[];
  timestamp?: Date;
}

export interface MemorySearchResult {
  entries: MemoryEntry[];
  totalCount: number;
  query: string;
}

export interface PatternEntry {
  id: string;
  description: string;
  context: string;
  successRate: number;
  usageCount: number;
  createdAt: Date;
}

export class MemoryAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super("memory-agent", {
      model: "haiku",
      maxTokens: 4096,
      allowedTools: ["Read", "Write"],
      permissionMode: "bypassPermissions",
      ...config,
    });
  }

  /**
   * Store data in memory with namespace organization
   */
  async store(
    key: string,
    value: unknown,
    namespace: MemoryNamespace,
    tags?: string[]
  ): Promise<boolean> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Store the following data in memory:

Namespace: ${namespace}
Key: ${key}
Value: ${JSON.stringify(value, null, 2)}
${tags?.length ? `Tags: ${tags.join(", ")}` : ""}

Persist to the appropriate storage backend and confirm storage.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return !response.toLowerCase().includes("error") && !response.toLowerCase().includes("failed");
  }

  /**
   * Retrieve data from memory
   */
  async retrieve(key: string, namespace: MemoryNamespace): Promise<unknown | null> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Retrieve data from memory:

Namespace: ${namespace}
Key: ${key}

Return the stored value or indicate if not found.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);

    if (response.toLowerCase().includes("not found") || response.toLowerCase().includes("error")) {
      return null;
    }

    // Try to parse JSON from response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Return raw response if not JSON
    }

    return response;
  }

  /**
   * Search memory by query
   */
  async search(
    query: string,
    namespace?: MemoryNamespace,
    limit = 10
  ): Promise<MemorySearchResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Search memory for entries matching:

Query: ${query}
${namespace ? `Namespace: ${namespace}` : "All namespaces"}
Limit: ${limit}

Use semantic search to find relevant entries.
Return matching entries with their keys, values, and relevance scores.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseSearchResult(response, query);
  }

  /**
   * Delete data from memory
   */
  async delete(key: string, namespace: MemoryNamespace): Promise<boolean> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Delete data from memory:

Namespace: ${namespace}
Key: ${key}

Remove the entry and confirm deletion.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return !response.toLowerCase().includes("error") && !response.toLowerCase().includes("failed");
  }

  /**
   * Store a learned pattern
   */
  async storePattern(pattern: Omit<PatternEntry, "id" | "createdAt">): Promise<PatternEntry> {
    const patternEntry: PatternEntry = {
      id: `pattern-${Date.now()}`,
      ...pattern,
      createdAt: new Date(),
    };

    await this.store(patternEntry.id, patternEntry, "patterns", ["learned", pattern.context]);

    return patternEntry;
  }

  /**
   * Retrieve relevant patterns for a task
   */
  async retrievePatterns(taskDescription: string, topK = 5): Promise<PatternEntry[]> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Find the most relevant learned patterns for this task:

Task: ${taskDescription}

Search the patterns namespace and return the top ${topK} patterns that:
1. Match the task context
2. Have high success rates
3. Are most frequently used

Return patterns with their descriptions, success rates, and relevance.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parsePatterns(response);
  }

  /**
   * Take a state snapshot for recovery
   */
  async takeSnapshot(label: string): Promise<string> {
    let projectRoot = "";
    try {
      projectRoot = getProjectRoot();
    } catch {
      projectRoot = process.cwd();
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Take a state snapshot:

Label: ${label}
Project Root: ${projectRoot}
Timestamp: ${new Date().toISOString()}

Capture:
1. All active tasks and their states
2. Memory entries in all namespaces
3. Agent states and assignments
4. Current swarm topology

Store in recovery namespace for potential rollback.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    const snapshotIdMatch = response.match(/snapshot[_-]?id[:\s]+([a-zA-Z0-9-_]+)/i);
    return snapshotIdMatch?.[1] || `snapshot-${Date.now()}`;
  }

  /**
   * Restore from a state snapshot
   */
  async restoreSnapshot(snapshotId: string): Promise<boolean> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Restore state from snapshot:

Snapshot ID: ${snapshotId}

Restore:
1. Task states to snapshot point
2. Memory entries
3. Agent assignments
4. Swarm configuration

Confirm restoration success.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return !response.toLowerCase().includes("error") && !response.toLowerCase().includes("failed");
  }

  private buildSystemPrompt(): string {
    let projectContext = "";
    try {
      projectContext = getProjectContextString();
    } catch {
      // Project root not set
    }

    return `You are a Memory Management Agent responsible for persistent storage, pattern learning, and state management.

${projectContext}

Your responsibilities:
1. Store and retrieve data across namespaces
2. Manage semantic search with HNSW indexing
3. Learn and store successful patterns
4. Take and restore state snapshots
5. Maintain cross-session continuity

Memory namespaces:
- tasks: Task definitions, dependencies, task graph
- progress: Completion status, timelines, rollups
- decisions: Architecture/strategy decisions with rationale
- patterns: Learned patterns about what works
- failures: Failure logs with root causes
- recovery: Recovery actions and outcomes
- context: Project context, goals, acceptance criteria
- workers: Worker execution state and results

Always persist important state for recovery and learning.`;
  }

  private parseSearchResult(response: string, query: string): MemorySearchResult {
    const entries: MemoryEntry[] = [];
    const entryMatches = response.matchAll(
      /key[:\s]+([a-zA-Z0-9-_]+).*?namespace[:\s]+(\w+).*?value[:\s]+([\s\S]*?)(?=key:|$)/gi
    );

    for (const match of entryMatches) {
      entries.push({
        key: match[1],
        namespace: match[2] as MemoryNamespace,
        value: match[3]?.trim(),
      });
    }

    return {
      entries,
      totalCount: entries.length,
      query,
    };
  }

  private parsePatterns(response: string): PatternEntry[] {
    const patterns: PatternEntry[] = [];
    const patternMatches = response.matchAll(
      /pattern[_-]?(\d+|[a-zA-Z0-9-_]+)[:\s]+(.+?)(?:success[_\s]?rate[:\s]+([\d.]+))?(?:usage[:\s]+(\d+))?/gi
    );

    for (const match of patternMatches) {
      patterns.push({
        id: `pattern-${match[1]}`,
        description: match[2]?.trim() || "",
        context: "",
        successRate: match[3] ? parseFloat(match[3]) : 0.7,
        usageCount: match[4] ? parseInt(match[4]) : 1,
        createdAt: new Date(),
      });
    }

    return patterns;
  }
}
