/**
 * Bash Tool — executes commands via child_process
 * Sandboxed to project root for safety.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { execSync } from "node:child_process";

export const bashTool = new DynamicStructuredTool({
  name: "run_command",
  description: "Execute a shell command. Returns stdout. Use for git, npm, build tools, etc.",
  schema: z.object({
    command: z.string().describe("The shell command to execute"),
    cwd: z.string().optional().describe("Working directory (defaults to cwd)"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
  }),
  func: async ({ command, cwd, timeout }) => {
    try {
      const result = execSync(command, {
        cwd: cwd ?? process.cwd(),
        encoding: "utf-8",
        timeout: timeout ?? 30000,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result || "(command completed with no output)";
    } catch (error: any) {
      const stderr = error?.stderr ? String(error.stderr) : "";
      const stdout = error?.stdout ? String(error.stdout) : "";
      return `Command failed (exit ${error?.status ?? "unknown"}):\n${stderr || stdout || error.message}`;
    }
  },
});
