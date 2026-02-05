/**
 * Swarm-Based Optimization Worker
 *
 * Analyzes the codebase for optimization opportunities using swarm agents to:
 * 1. Find performance bottlenecks
 * 2. Identify code duplication
 * 3. Suggest refactoring opportunities
 */

import { createSwarmWorker, chunkByDirectory } from "./base.js";
import * as fs from "node:fs";
import * as path from "node:path";

export interface OptimizationSuggestion {
  type: "performance" | "duplication" | "refactor" | "complexity";
  priority: "high" | "medium" | "low";
  file: string;
  line?: number;
  description: string;
  suggestion: string;
  estimatedImpact?: string;
}

export interface OptimizeResult {
  suggestions: OptimizationSuggestion[];
  summary: {
    performance: number;
    duplication: number;
    refactor: number;
    complexity: number;
    total: number;
  };
  hotspots: string[];
  timestamp: string;
}

export async function OptimizeWorker(projectRoot: string) {
  const worker = await createSwarmWorker({
    name: "optimize",
    model: "sonnet", // Need intelligence for optimization analysis
    maxConcurrency: 4,
    chunkTimeoutMs: 120000,
    topology: "hierarchical-mesh",
  });

  return {
    async run(): Promise<OptimizeResult> {
      console.log("[optimize] Starting swarm-based optimization analysis...");

      // 1. Gather source files
      const sourceFiles = await gatherSourceFiles(projectRoot);
      console.log(`[optimize] Found ${sourceFiles.length} source files`);

      if (sourceFiles.length === 0) {
        return {
          suggestions: [],
          summary: { performance: 0, duplication: 0, refactor: 0, complexity: 0, total: 0 },
          hotspots: [],
          timestamp: new Date().toISOString(),
        };
      }

      // 2. Chunk files
      const chunks = chunkByDirectory(sourceFiles, 6);
      console.log(`[optimize] Split into ${chunks.length} chunks`);

      // 3. Initialize swarm
      const swarmId = await worker.initSwarm();

      try {
        // 4. Process chunks
        const result = await worker.processChunks(chunks, async (chunk) => {
          return analyzeChunkForOptimizations(chunk, projectRoot);
        });

        // 5. Aggregate
        const aggregated = aggregateOptimizations(result);
        console.log(`[optimize] Found ${aggregated.summary.total} optimization opportunities`);

        // 6. Store results
        await worker.storeResults(`optimize-${Date.now()}`, aggregated);

        await worker.shutdown(swarmId);
        return aggregated;
      } catch (err) {
        console.error("[optimize] Optimization analysis failed:", err);
        await worker.shutdown(swarmId).catch(() => {});
        throw err;
      }
    },
  };
}

async function gatherSourceFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  const extensions = [".ts", ".js", ".tsx", ".jsx"];
  const ignoreDirs = ["node_modules", ".git", "dist", "build", ".next", "coverage"];

  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext) && !entry.name.includes(".test.") && !entry.name.includes(".spec.")) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip inaccessible
    }
  }

  walk(projectRoot);
  return files;
}

function analyzeChunkForOptimizations(files: string[], projectRoot: string): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = path.relative(projectRoot, filePath);
      const lines = content.split("\n");

      suggestions.push(...checkPerformanceIssues(relativePath, lines));
      suggestions.push(...checkComplexity(relativePath, lines, content));
      suggestions.push(...checkDuplication(relativePath, lines));
    } catch {
      // Skip unreadable files
    }
  }

  return suggestions;
}

function checkPerformanceIssues(file: string, lines: string[]): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // Pre-compile regex patterns for better performance
  const syncIoPattern = /readFileSync|writeFileSync|execSync/;
  const nestedLoopPattern = /for\s*\(.*for\s*\(/;
  const nestedForEachPattern = /\.forEach.*\.forEach/;
  const filterMapPattern = /\.filter\(.*\)\.map\(/;
  const useStateArrayPattern = /useState.*\[\]/;
  const pushPattern = /\.push\(/;

  lines.forEach((line, idx) => {
    // Synchronous operations in potentially async context
    if (syncIoPattern.test(line)) {
      suggestions.push({
        type: "performance",
        priority: "medium",
        file,
        line: idx + 1,
        description: "Synchronous I/O operation detected",
        suggestion: "Consider using async versions (readFile, writeFile, exec) for better concurrency",
        estimatedImpact: "May block event loop in high-throughput scenarios",
      });
    }

    // Nested loops that could be O(n²)
    if (nestedLoopPattern.test(line) || nestedForEachPattern.test(line)) {
      suggestions.push({
        type: "performance",
        priority: "high",
        file,
        line: idx + 1,
        description: "Nested iteration detected",
        suggestion: "Consider using Map/Set for O(1) lookups or restructuring the algorithm",
        estimatedImpact: "O(n²) complexity may cause slowdowns with large data",
      });
    }

    // Array methods that could be combined
    if (filterMapPattern.test(line)) {
      suggestions.push({
        type: "performance",
        priority: "low",
        file,
        line: idx + 1,
        description: "Chained filter/map creates intermediate arrays",
        suggestion: "Consider using reduce() or a single loop for better memory efficiency",
        estimatedImpact: "Minor memory overhead for large arrays",
      });
    }

    // Re-rendering triggers in React
    if (useStateArrayPattern.test(line) && pushPattern.test(content || "")) {
      suggestions.push({
        type: "performance",
        priority: "medium",
        file,
        line: idx + 1,
        description: "Array mutation may not trigger React re-render",
        suggestion: "Use spread operator or immer for immutable updates",
      });
    }
  });

  return suggestions;
}

let content = ""; // Closure variable for cross-check

function checkComplexity(file: string, lines: string[], fileContent: string): OptimizationSuggestion[] {
  content = fileContent;
  const suggestions: OptimizationSuggestion[] = [];

  // Check file length
  if (lines.length > 500) {
    suggestions.push({
      type: "complexity",
      priority: "medium",
      file,
      description: `File has ${lines.length} lines`,
      suggestion: "Consider splitting into smaller, focused modules",
      estimatedImpact: "Improved maintainability and testability",
    });
  }

  // Check function length (rough heuristic)
  let functionStart = -1;
  let braceCount = 0;

  lines.forEach((line, idx) => {
    if (/(?:function|async function|=>)\s*\{/.test(line) || /(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(/.test(line)) {
      functionStart = idx;
      braceCount = 0;
    }

    braceCount += (line.match(/\{/g) || []).length;
    braceCount -= (line.match(/\}/g) || []).length;

    if (functionStart >= 0 && braceCount === 0 && idx - functionStart > 50) {
      suggestions.push({
        type: "complexity",
        priority: "medium",
        file,
        line: functionStart + 1,
        description: `Function spanning ${idx - functionStart} lines detected`,
        suggestion: "Consider breaking into smaller functions with single responsibilities",
      });
      functionStart = -1;
    }
  });

  // Check cyclomatic complexity (rough approximation)
  const conditionCount =
    (fileContent.match(/\bif\b|\belse\b|\bswitch\b|\bcase\b|\b\?\b|\b&&\b|\b\|\|\b/g) || []).length;
  if (conditionCount > 30) {
    suggestions.push({
      type: "complexity",
      priority: "high",
      file,
      description: `High cyclomatic complexity (${conditionCount} conditionals)`,
      suggestion: "Consider extracting conditions into separate functions or using strategy pattern",
    });
  }

  return suggestions;
}

function checkDuplication(file: string, lines: string[]): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // Check for repeated patterns (simple heuristic)
  const lineFrequency = new Map<string, number[]>();

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.length > 20 && !trimmed.startsWith("//") && !trimmed.startsWith("*")) {
      const existing = lineFrequency.get(trimmed) || [];
      existing.push(idx + 1);
      lineFrequency.set(trimmed, existing);
    }
  });

  for (const [line, occurrences] of lineFrequency) {
    if (occurrences.length >= 3) {
      suggestions.push({
        type: "duplication",
        priority: "low",
        file,
        line: occurrences[0],
        description: `Code pattern repeated ${occurrences.length} times at lines ${occurrences.join(", ")}`,
        suggestion: "Consider extracting to a reusable function or constant",
      });
    }
  }

  return suggestions;
}

function aggregateOptimizations(result: any): OptimizeResult {
  const allSuggestions: OptimizationSuggestion[] = [];

  for (const chunk of result.results) {
    if (chunk.success && Array.isArray(chunk.data)) {
      allSuggestions.push(...(chunk.data as OptimizationSuggestion[]));
    }
  }

  // Calculate summary
  const summary = {
    performance: allSuggestions.filter((s) => s.type === "performance").length,
    duplication: allSuggestions.filter((s) => s.type === "duplication").length,
    refactor: allSuggestions.filter((s) => s.type === "refactor").length,
    complexity: allSuggestions.filter((s) => s.type === "complexity").length,
    total: allSuggestions.length,
  };

  // Identify hotspots (files with most issues)
  const fileCounts = new Map<string, number>();
  for (const s of allSuggestions) {
    fileCounts.set(s.file, (fileCounts.get(s.file) || 0) + 1);
  }

  const hotspots = [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([file]) => file);

  return {
    suggestions: allSuggestions,
    summary,
    hotspots,
    timestamp: new Date().toISOString(),
  };
}
