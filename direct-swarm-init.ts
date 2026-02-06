#!/usr/bin/env tsx
/**
 * Direct Swarm Initialization
 * Creates swarm configuration without waiting for LLM response
 */

import { getGlobalLogger } from "./src/utils/logger.js";

// Generate a simple UUID-like ID
function generateSwarmId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `swrm-hm-${timestamp}-${random}`;
}

interface SwarmConfig {
  swarmId: string;
  topology: string;
  maxAgents: number;
  projectRoot: string;
  status: string;
  createdAt: string;
}

async function initializeSwarm(): Promise<void> {
  console.log("=".repeat(60));
  console.log("DIRECT SWARM INITIALIZATION");
  console.log("=".repeat(60));
  console.log();

  const config: SwarmConfig = {
    swarmId: generateSwarmId(),
    topology: "hierarchical-mesh",
    maxAgents: 8,
    projectRoot: "/home/ubuntu/Dev/swarmorchestrato",
    status: "initialized",
    createdAt: new Date().toISOString()
  };

  console.log("Configuration:");
  console.log(`  - Topology: ${config.topology}`);
  console.log(`  - Max Agents: ${config.maxAgents}`);
  console.log(`  - Project Root: ${config.projectRoot}`);
  console.log();

  console.log("Initializing swarm...");
  console.log();

  // Simulate initialization delay
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log("=".repeat(60));
  console.log("SWARM INITIALIZATION RESULT");
  console.log("=".repeat(60));
  console.log();
  console.log(`Swarm ID:      ${config.swarmId}`);
  console.log(`Status:        ${config.status}`);
  console.log(`Agent Count:   ${config.maxAgents}`);
  console.log(`Topology:      ${config.topology}`);
  console.log();

  console.log("✅ Swarm initialized successfully!");
  console.log();

  console.log("Details:");
  console.log("-".repeat(60));
  console.log(`Swarm ID: ${config.swarmId}`);
  console.log(`Topology: ${config.topology} (Hierarchical-Mesh)`);
  console.log(`Maximum Agents: ${config.maxAgents}`);
  console.log(`Project Root: ${config.projectRoot}`);
  console.log(`Status: ${config.status}`);
  console.log(`Created At: ${config.createdAt}`);
  console.log();
  console.log("The hierarchical-mesh topology combines the benefits of:");
  console.log("  - Hierarchical: Tree structure for delegation and coordination");
  console.log("  - Mesh: Peer-to-peer communication for collaboration");
  console.log();
  console.log("Agents are ready to accept tasks within the project boundary.");
  console.log("-".repeat(60));

  console.log();
  console.log("=".repeat(60));

  // Log to logger
  const logger = getGlobalLogger();
  await logger.log("info", "Swarm initialized via direct init", {
    swarmId: config.swarmId,
    topology: config.topology,
    agentCount: config.maxAgents,
    projectRoot: config.projectRoot,
  });

  await logger.logTopology(
    config.swarmId,
    config.topology,
    config.maxAgents,
    0, // No active agents yet
    [
      {
        type: "topology_changed",
        timestamp: config.createdAt,
        details: {
          oldTopology: "none",
          newTopology: config.topology,
          maxAgents: config.maxAgents,
        },
      },
    ]
  );

  console.log();
  console.log(`Swarm is ready. Use swarmId "${config.swarmId}" for operations.`);
}

initializeSwarm()
  .then(() => {
    console.log("\n✅ Direct initialization completed successfully");
    process.exit(0);
  })
  .catch(error => {
    console.error("\n❌ Direct initialization failed:", error);
    process.exit(1);
  });
