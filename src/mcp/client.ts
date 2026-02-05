/**
 * MCP Client Bridge
 *
 * Connects to the Claude Flow MCP server via stdio transport,
 * exposing all 87 MCP tools as callable functions for the orchestrator.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { EventEmitter } from "node:events";

// Increase default max listeners to prevent memory leak warnings
// The MCP client + transport + subprocess creates many listeners
EventEmitter.defaultMaxListeners = 20;

let client: Client | null = null;
let transport: StdioClientTransport | null = null;
// MCP disabled by default due to stdio protocol corruption issues
// Set ENABLE_MCP=true to enable
let mcpEnabled = process.env.ENABLE_MCP === "true";
let mcpInitialized = false;
let initializationPromise: Promise<Client> | null = null;

/**
 * Check if MCP is enabled
 */
export function isMcpEnabled(): boolean {
  return mcpEnabled;
}

/**
 * Disable MCP (call before any MCP operations)
 */
export function disableMcp(): void {
  mcpEnabled = false;
}

/**
 * Enable MCP
 */
export function enableMcp(): void {
  mcpEnabled = true;
}

/**
 * Initialize MCP client eagerly. Call this BEFORE starting any readline/terminal
 * interaction to prevent stdio conflicts.
 *
 * This function is idempotent - calling it multiple times returns the same promise.
 */
export async function initializeMcp(): Promise<Client> {
  if (!mcpEnabled) {
    throw new Error("MCP is disabled. Set DISABLE_MCP=false or call enableMcp() to enable.");
  }

  // Return existing client if already connected
  if (client && mcpInitialized) return client;

  // Return existing initialization if in progress
  if (initializationPromise) return initializationPromise;

  // Start initialization
  initializationPromise = (async () => {
    // Create a log file for MCP stderr to prevent terminal interference
    const logDir = path.join(process.cwd(), ".claude-flow", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const stderrLog = fs.openSync(path.join(logDir, "mcp-stderr.log"), "a");

    // Note: MCP is disabled by default due to stdio protocol issues
    // The claude-flow CLI outputs human-readable messages to stdout before JSON-RPC
    transport = new StdioClientTransport({
      command: "npx",
      args: ["--yes", "--quiet", "@claude-flow/cli@latest", "mcp", "start"],
      env: {
        ...process.env,
        CLAUDE_FLOW_MODE: process.env.CLAUDE_FLOW_MODE ?? "v3",
        CLAUDE_FLOW_HOOKS_ENABLED: "true",
        CLAUDE_FLOW_TOPOLOGY:
          process.env.CLAUDE_FLOW_TOPOLOGY ?? "hierarchical-mesh",
        CLAUDE_FLOW_MAX_AGENTS: process.env.CLAUDE_FLOW_MAX_AGENTS ?? "15",
        CLAUDE_FLOW_MEMORY_BACKEND:
          process.env.CLAUDE_FLOW_MEMORY_BACKEND ?? "hybrid",
        npm_config_loglevel: "silent",
        NO_UPDATE_NOTIFIER: "1",
      },
      stderr: stderrLog,
    });

    client = new Client(
      { name: "swarm-orchestrato", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    mcpInitialized = true;
    return client;
  })();

  return initializationPromise;
}

export async function getClient(): Promise<Client> {
  return initializeMcp();
}

/**
 * Call a Claude Flow MCP tool by name with the given arguments.
 * Returns empty result if MCP is disabled (graceful degradation).
 */
export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (!mcpEnabled) {
    // Return empty result when MCP is disabled - allows SDK agents to work without MCP
    return JSON.stringify({ status: "mcp_disabled", message: "MCP is disabled" });
  }

  const c = await getClient();
  const result = await c.callTool({ name: toolName, arguments: args });

  // MCP tool results come back as content blocks
  if (Array.isArray(result.content)) {
    return result.content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block.type === "text") return block.text;
        return JSON.stringify(block);
      })
      .join("\n");
  }

  return typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);
}

/**
 * List all available tools on the MCP server.
 * Returns empty array if MCP is disabled.
 */
export async function listMcpTools(): Promise<string[]> {
  if (!mcpEnabled) {
    return [];
  }

  const c = await getClient();
  const { tools } = await c.listTools();
  return tools.map((t) => t.name);
}

/**
 * Gracefully shut down the MCP connection.
 */
export async function disconnect(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
  if (transport) {
    await transport.close();
    transport = null;
  }
  // Reset initialization state to allow reconnection
  mcpInitialized = false;
  initializationPromise = null;
}
