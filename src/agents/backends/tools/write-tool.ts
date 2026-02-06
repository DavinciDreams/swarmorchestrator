/**
 * Write Tool — writes file contents via Node.js fs
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

export const writeTool = new DynamicStructuredTool({
  name: "write_file",
  description: "Write content to a file. Creates parent directories if needed. Overwrites existing files.",
  schema: z.object({
    file_path: z.string().describe("Absolute path to the file to write"),
    content: z.string().describe("Content to write to the file"),
  }),
  func: async ({ file_path, content }) => {
    try {
      fs.mkdirSync(path.dirname(file_path), { recursive: true });
      fs.writeFileSync(file_path, content, "utf-8");
      return `Successfully wrote ${content.length} bytes to ${file_path}`;
    } catch (error: unknown) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
