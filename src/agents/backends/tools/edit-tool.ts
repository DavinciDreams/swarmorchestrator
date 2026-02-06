/**
 * Edit Tool — performs string replacement in files
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "node:fs";

export const editTool = new DynamicStructuredTool({
  name: "edit_file",
  description: "Perform an exact string replacement in a file. The old_string must appear exactly once in the file.",
  schema: z.object({
    file_path: z.string().describe("Absolute path to the file to edit"),
    old_string: z.string().describe("The exact string to find and replace"),
    new_string: z.string().describe("The replacement string"),
  }),
  func: async ({ file_path, old_string, new_string }) => {
    try {
      if (!fs.existsSync(file_path)) {
        return `Error: File not found: ${file_path}`;
      }
      const content = fs.readFileSync(file_path, "utf-8");
      const occurrences = content.split(old_string).length - 1;

      if (occurrences === 0) {
        return `Error: old_string not found in file`;
      }
      if (occurrences > 1) {
        return `Error: old_string found ${occurrences} times (must be unique)`;
      }

      const newContent = content.replace(old_string, new_string);
      fs.writeFileSync(file_path, newContent, "utf-8");
      return `Successfully edited ${file_path}`;
    } catch (error: unknown) {
      return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
