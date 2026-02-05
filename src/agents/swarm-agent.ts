/**
 * Swarm Agent - Specialized for swarm initialization and management
 * Handles swarm lifecycle, topology, and scaling operations
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import { getProjectRoot, getProjectContextString } from "../utils/project-context.js";

export interface SwarmConfig {
  swarmId?: string;
  topology?: "mesh" | "hierarchical" | "hierarchical-mesh" | "ring" | "star" | "adaptive" | "hybrid";
  maxAgents?: number;
}

export interface SwarmResult {
  swarmId: string;
  status: "initialized" | "running" | "scaled" | "shutdown" | "error";
  agentCount: number;
  topology: string;
  message?: string;
}

export class SwarmAgent extends BaseAgent {
  private swarmConfig: SwarmConfig;

  constructor(config?: Partial<AgentConfig>, swarmConfig?: SwarmConfig) {
    super("swarm-agent", {
      model: "haiku",
      maxTokens: 4096,
      allowedTools: ["Read", "Write", "Bash"],
      permissionMode: "bypassPermissions",
      ...config,
    });

    this.swarmConfig = swarmConfig || {
      topology: "hierarchical-mesh",
      maxAgents: 8,
    };
  }

  /**
   * Initialize a new swarm with specified configuration
   */
  async initializeSwarm(
    topology?: SwarmConfig["topology"],
    maxAgents?: number
  ): Promise<SwarmResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildInitPrompt(topology, maxAgents);

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseSwarmResult(response, "initialized");
  }

  /**
   * Check swarm status
   */
  async getStatus(swarmId?: string): Promise<SwarmResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Check the status of swarm ${swarmId || this.swarmConfig.swarmId || "default"}.
Report: agent count, active tasks, health status, topology efficiency.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseSwarmResult(response, "running");
  }

  /**
   * Scale swarm up or down
   */
  async scale(targetAgents: number): Promise<SwarmResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Scale the swarm to ${targetAgents} agents.
Current max: ${this.swarmConfig.maxAgents}
Ensure graceful scaling without task interruption.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseSwarmResult(response, "scaled");
  }

  /**
   * Shutdown swarm gracefully
   */
  async shutdown(swarmId?: string): Promise<SwarmResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Gracefully shutdown swarm ${swarmId || this.swarmConfig.swarmId || "default"}.
1. Complete or checkpoint active tasks
2. Persist state to memory
3. Terminate agents in order
4. Clean up resources`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseSwarmResult(response, "shutdown");
  }

  private buildSystemPrompt(): string {
    let projectContext = "";
    try {
      projectContext = getProjectContextString();
    } catch {
      // Project root not set
    }

    return `You are a Swarm Management Agent responsible for initializing, monitoring, and managing agent swarms.

${projectContext}

Your responsibilities:
1. Initialize swarms with optimal topology for the task type
2. Monitor swarm health and performance
3. Scale agents based on workload
4. Coordinate graceful shutdowns

Available topologies:
- mesh: Peer-to-peer, good for collaborative tasks
- hierarchical: Tree structure, good for delegation
- hierarchical-mesh: Hybrid, combines both benefits
- ring: Sequential processing, good for pipelines
- star: Central coordinator, good for broadcasting
- adaptive: Self-organizing based on workload

Always report structured results with swarmId, status, agentCount, and topology.`;
  }

  private buildInitPrompt(
    topology?: SwarmConfig["topology"],
    maxAgents?: number
  ): string {
    const topo = topology || this.swarmConfig.topology || "hierarchical-mesh";
    const agents = maxAgents || this.swarmConfig.maxAgents || 8;

    let projectRoot = "";
    try {
      projectRoot = getProjectRoot();
    } catch {
      projectRoot = process.cwd();
    }

    return `Initialize a new swarm with:
- Topology: ${topo}
- Max Agents: ${agents}
- Project Root: ${projectRoot}

Configure the swarm for optimal performance within the project boundary.
Return the swarmId and confirm initialization status.`;
  }

  private parseSwarmResult(
    response: string,
    expectedStatus: SwarmResult["status"]
  ): SwarmResult {
    // Extract swarmId from response
    const swarmIdMatch = response.match(/swarm[_-]?id[:\s]+([a-zA-Z0-9-_]+)/i);
    const agentCountMatch = response.match(/agent[_\s]?count[:\s]+(\d+)/i);
    const topologyMatch = response.match(/topology[:\s]+([a-zA-Z-]+)/i);

    return {
      swarmId: swarmIdMatch?.[1] || this.swarmConfig.swarmId || `swarm-${Date.now()}`,
      status: response.toLowerCase().includes("error") ? "error" : expectedStatus,
      agentCount: agentCountMatch ? parseInt(agentCountMatch[1]) : this.swarmConfig.maxAgents || 8,
      topology: topologyMatch?.[1] || this.swarmConfig.topology || "hierarchical-mesh",
      message: response,
    };
  }
}
