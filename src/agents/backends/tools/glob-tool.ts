/**
 * Glob Tool — file pattern matching via recursive directory traversal
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob to regex
  const regexStr = pattern
    .replace(/\*\*/g, "{{DOUBLESTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/{{DOUBLESTAR}}/g, ".*");
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

function walkDir(dir: string, results: string[], maxDepth = 10, depth = 0): void {
  if (depth > maxDepth) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist", "build", ".next", "coverage"].includes(entry.name)) {
          walkDir(fullPath, results, maxDepth, depth + 1);
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories
  }
}

export const globTool = new DynamicStructuredTool({
  name: "glob_files",
  description: "Find files matching a glob pattern (e.g., '**/*.ts', 'src/**/*.js'). Returns matching file paths.",
  schema: z.object({
    pattern: z.string().describe("Glob pattern to match files against"),
    directory: z.string().optional().describe("Directory to search in (defaults to current working directory)"),
  }),
  func: async ({ pattern, directory }) => {
    try {
      const searchDir = directory ?? process.cwd();
      const allFiles: string[] = [];
      walkDir(searchDir, allFiles);

      const matches = allFiles.filter((f) => {
        const relative = path.relative(searchDir, f);
        return matchGlob(relative, pattern);
      });

      if (matches.length === 0) {
        return `No files matched pattern: ${pattern}`;
      }

      return matches.map((f) => path.relative(searchDir, f)).join("\n");
    } catch (error: unknown) {
      return `Error searching files: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
