/**
 * MCP Client Bridge
 *
 * Connects to the Claude Flow MCP server via stdio transport,
 * exposing all 87 MCP tools as callable functions for the orchestrator.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client: Client | null = null;
let transport: StdioClientTransport | null = null;

export async function getClient(): Promise<Client> {
  if (client) return client;

  transport = new StdioClientTransport({
    command: "npx",
    args: ["@claude-flow/cli@latest", "mcp", "start"],
    env: {
      ...process.env,
      CLAUDE_FLOW_MODE: process.env.CLAUDE_FLOW_MODE ?? "v3",
      CLAUDE_FLOW_HOOKS_ENABLED: "true",
      CLAUDE_FLOW_TOPOLOGY:
        process.env.CLAUDE_FLOW_TOPOLOGY ?? "hierarchical-mesh",
      CLAUDE_FLOW_MAX_AGENTS: process.env.CLAUDE_FLOW_MAX_AGENTS ?? "15",
      CLAUDE_FLOW_MEMORY_BACKEND:
        process.env.CLAUDE_FLOW_MEMORY_BACKEND ?? "hybrid",
    },
  });

  client = new Client(
    { name: "swarm-orchestrato", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  return client;
}

/**
 * Call a Claude Flow MCP tool by name with the given arguments.
 */
export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
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
 */
export async function listMcpTools(): Promise<string[]> {
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
}
