/**
 * Grep Tool — content search via line-by-line regex matching
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

function walkDir(dir: string, results: string[]): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "dist", "build", ".next", "coverage"].includes(entry.name)) {
          walkDir(fullPath, results);
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible
  }
}

export const grepTool = new DynamicStructuredTool({
  name: "grep_content",
  description: "Search file contents for a regex pattern. Returns matching lines with file paths and line numbers.",
  schema: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    directory: z.string().optional().describe("Directory to search in (defaults to cwd)"),
    glob: z.string().optional().describe("File glob filter (e.g., '*.ts')"),
  }),
  func: async ({ pattern, directory, glob: fileGlob }) => {
    try {
      const searchDir = directory ?? process.cwd();
      const allFiles: string[] = [];
      walkDir(searchDir, allFiles);

      const regex = new RegExp(pattern, "g");
      const results: string[] = [];

      for (const filePath of allFiles) {
        // Apply glob filter if specified
        if (fileGlob) {
          const fileName = path.basename(filePath);
          const ext = fileGlob.replace("*", "");
          if (!fileName.endsWith(ext)) continue;
        }

        try {
          const content = fs.readFileSync(filePath, "utf-8");
          const lines = content.split("\n");
          const relative = path.relative(searchDir, filePath);

          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${relative}:${i + 1}:${lines[i]}`);
            }
            regex.lastIndex = 0; // Reset regex state
          }
        } catch {
          // Skip unreadable files
        }

        if (results.length >= 100) break; // Limit results
      }

      if (results.length === 0) {
        return `No matches found for pattern: ${pattern}`;
      }

      return results.join("\n");
    } catch (error: unknown) {
      return `Error searching: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
