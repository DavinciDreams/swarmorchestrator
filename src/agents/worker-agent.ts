/**
 * Worker Agent - Specialized for background worker tasks
 * Handles codebase mapping, auditing, optimization, and test gap analysis
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import { getProjectRoot, getProjectContextString } from "../utils/project-context.js";

export type WorkerType = "map" | "audit" | "optimize" | "testgaps";

export interface WorkerConfig {
  workerType: WorkerType;
  chunkSize?: number;
  maxAgents?: number;
}

export interface WorkerResult {
  workerId: string;
  workerType: WorkerType;
  status: "running" | "completed" | "failed";
  filesProcessed: number;
  totalFiles: number;
  findings?: unknown[];
  output?: string;
  error?: string;
}

export interface ChunkResult {
  chunkId: string;
  files: string[];
  findings: unknown[];
  agentId: string;
}

export class WorkerAgent extends BaseAgent {
  private workerConfig: WorkerConfig;

  constructor(workerType: WorkerType, config?: Partial<AgentConfig>) {
    super(`${workerType}-worker`, {
      model: "haiku",
      maxTokens: 8192,
      allowedTools: ["Read", "Write", "Glob", "Grep", "Bash"],
      permissionMode: "bypassPermissions",
      ...config,
    });

    this.workerConfig = {
      workerType,
      chunkSize: 10,
      maxAgents: 4,
    };
  }

  /**
   * Run the worker on the codebase
   */
  async run(targetPath?: string): Promise<WorkerResult> {
    let projectRoot = "";
    try {
      projectRoot = getProjectRoot();
    } catch {
      projectRoot = process.cwd();
    }

    const path = targetPath || projectRoot;

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildRunPrompt(path);

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseWorkerResult(response);
  }

  /**
   * Run worker on a specific chunk of files
   */
  async processChunk(files: string[], chunkId: string): Promise<ChunkResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Process the following files as chunk ${chunkId}:

Files:
${files.map((f) => `- ${f}`).join("\n")}

${this.getWorkerInstructions()}

Return findings for each file in the chunk.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseChunkResult(response, chunkId, files);
  }

  /**
   * Get dynamic agent count based on file count
   */
  getAgentCount(fileCount: number): number {
    if (fileCount < 10) return 2;
    if (fileCount <= 50) return 4;
    return 8;
  }

  /**
   * Chunk files for parallel processing
   */
  chunkFiles(files: string[], chunkSize?: number): string[][] {
    const size = chunkSize || this.workerConfig.chunkSize || 10;
    const chunks: string[][] = [];

    for (let i = 0; i < files.length; i += size) {
      chunks.push(files.slice(i, i + size));
    }

    return chunks;
  }

  private buildSystemPrompt(): string {
    let projectContext = "";
    try {
      projectContext = getProjectContextString();
    } catch {
      // Project root not set
    }

    const workerDescriptions: Record<WorkerType, string> = {
      map: `You are a Codebase Mapping Worker that analyzes code structure, dependencies, and architecture.

Your responsibilities:
- Map file relationships and dependencies
- Identify entry points and exports
- Document module structure
- Create architecture diagrams`,

      audit: `You are a Security and Quality Audit Worker that identifies vulnerabilities and code quality issues.

Your responsibilities:
- Scan for security vulnerabilities (OWASP Top 10)
- Check for code quality issues
- Identify hardcoded secrets or credentials
- Flag deprecated or unsafe patterns`,

      optimize: `You are an Optimization Analysis Worker that identifies performance improvements.

Your responsibilities:
- Profile code for performance bottlenecks
- Identify redundant or inefficient code
- Suggest algorithmic improvements
- Recommend caching strategies`,

      testgaps: `You are a Test Coverage Worker that identifies missing test coverage.

Your responsibilities:
- Analyze test coverage gaps
- Identify untested functions and branches
- Recommend test cases for critical paths
- Flag high-risk untested code`,
    };

    return `${workerDescriptions[this.workerConfig.workerType]}

${projectContext}

Always work within the project boundaries and report structured findings.`;
  }

  private buildRunPrompt(targetPath: string): string {
    return `Run ${this.workerConfig.workerType} analysis on: ${targetPath}

1. First, discover all relevant files using Glob
2. Chunk files for parallel processing (${this.workerConfig.chunkSize} files per chunk)
3. Process each chunk and collect findings
4. Aggregate results into a comprehensive report

${this.getWorkerInstructions()}

Report: files processed, findings by category, recommendations.`;
  }

  private getWorkerInstructions(): string {
    const instructions: Record<WorkerType, string> = {
      map: `Mapping instructions:
- Identify imports/exports for each file
- Document file purpose and dependencies
- Note architectural patterns used
- Create a dependency graph`,

      audit: `Audit instructions:
- Check for SQL injection, XSS, CSRF vulnerabilities
- Scan for hardcoded credentials or API keys
- Identify unsafe functions (eval, exec, etc.)
- Flag missing input validation
- Check for insecure dependencies`,

      optimize: `Optimization instructions:
- Identify O(n²) or worse algorithms
- Find redundant computations
- Spot missing memoization opportunities
- Check for memory leaks
- Identify blocking operations`,

      testgaps: `Test gap instructions:
- Calculate statement and branch coverage
- Identify functions without tests
- Flag error paths without coverage
- Prioritize by code complexity
- Suggest test scenarios`,
    };

    return instructions[this.workerConfig.workerType];
  }

  private parseWorkerResult(response: string): WorkerResult {
    const workerIdMatch = response.match(/worker[_-]?id[:\s]+([a-zA-Z0-9-_]+)/i);
    const filesProcessedMatch = response.match(/files[_\s]?processed[:\s]+(\d+)/i);
    const totalFilesMatch = response.match(/total[_\s]?files[:\s]+(\d+)/i);
    const statusMatch = response.match(/status[:\s]+(running|completed|failed)/i);

    // Extract findings from response
    const findings: unknown[] = [];
    const findingMatches = response.matchAll(/finding[:\s]+(.+?)(?=finding:|$)/gi);
    for (const match of findingMatches) {
      findings.push(match[1]?.trim());
    }

    return {
      workerId: workerIdMatch?.[1] || `${this.workerConfig.workerType}-${Date.now()}`,
      workerType: this.workerConfig.workerType,
      status: statusMatch?.[1] as WorkerResult["status"] ||
        (response.toLowerCase().includes("error") ? "failed" : "completed"),
      filesProcessed: filesProcessedMatch ? parseInt(filesProcessedMatch[1]) : 0,
      totalFiles: totalFilesMatch ? parseInt(totalFilesMatch[1]) : 0,
      findings: findings.length > 0 ? findings : undefined,
      output: response,
    };
  }

  private parseChunkResult(response: string, chunkId: string, files: string[]): ChunkResult {
    const findings: unknown[] = [];
    const findingMatches = response.matchAll(/(?:finding|issue|warning|error)[:\s]+(.+?)(?=(?:finding|issue|warning|error):|$)/gi);

    for (const match of findingMatches) {
      findings.push(match[1]?.trim());
    }

    return {
      chunkId,
      files,
      findings,
      agentId: this.getName(),
    };
  }
}
