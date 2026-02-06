/**
 * Read Tool — reads file contents via Node.js fs
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "node:fs";

export const readTool = new DynamicStructuredTool({
  name: "read_file",
  description: "Read the contents of a file. Returns the file content as a string.",
  schema: z.object({
    file_path: z.string().describe("Absolute path to the file to read"),
    offset: z.number().optional().describe("Line number to start reading from (1-based)"),
    limit: z.number().optional().describe("Maximum number of lines to read"),
  }),
  func: async ({ file_path, offset, limit }) => {
    try {
      if (!fs.existsSync(file_path)) {
        return `Error: File not found: ${file_path}`;
      }
      const content = fs.readFileSync(file_path, "utf-8");
      const lines = content.split("\n");

      const startLine = (offset ?? 1) - 1;
      const endLine = limit ? startLine + limit : lines.length;
      const selectedLines = lines.slice(startLine, endLine);

      return selectedLines
        .map((line, idx) => `${startLine + idx + 1}\t${line}`)
        .join("\n");
    } catch (error: unknown) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
