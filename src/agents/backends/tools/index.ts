/**
 * LangChain Backend Tools
 *
 * Filesystem tools for the LangChain execution backend.
 * These provide the same capabilities as Claude's native tools
 * (Read, Write, Edit, Bash, Glob, Grep) but work with any LLM.
 */

import { readTool } from "./read-tool.js";
import { writeTool } from "./write-tool.js";
import { editTool } from "./edit-tool.js";
import { globTool } from "./glob-tool.js";
import { grepTool } from "./grep-tool.js";
import { bashTool } from "./bash-tool.js";

export function createBackendTools() {
  return [
    readTool,
    writeTool,
    editTool,
    globTool,
    grepTool,
    bashTool,
  ];
}

export { readTool, writeTool, editTool, globTool, grepTool, bashTool };
