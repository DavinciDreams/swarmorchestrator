/**
 * Test script for the new agent architecture
 * Tests BaseAgent, specialized agents, and the AgentCoordinator
 */

import {
  BaseAgent,
  SwarmAgent,
  TaskAgent,
  MemoryAgent,
  WorkerAgent,
  EvaluatorAgent,
  AgentCoordinator,
  setProjectRoot,
  getProjectRoot,
} from "../src/lib.js";

async function testProjectContext() {
  console.log("\n=== Testing Project Context ===");

  // Set project root
  setProjectRoot(process.cwd());
  console.log(`Project root set to: ${getProjectRoot()}`);

  console.log("✓ Project context working");
}

async function testAgentCreation() {
  console.log("\n=== Testing Agent Creation ===");

  // Test BaseAgent
  const baseAgent = new BaseAgent("test-base", { model: "haiku" });
  console.log(`✓ BaseAgent created: ${baseAgent.getName()}`);

  // Test SwarmAgent
  const swarmAgent = new SwarmAgent(undefined, { topology: "mesh", maxAgents: 4 });
  console.log(`✓ SwarmAgent created: ${swarmAgent.getName()}`);

  // Test TaskAgent
  const taskAgent = new TaskAgent();
  console.log(`✓ TaskAgent created: ${taskAgent.getName()}`);

  // Test MemoryAgent
  const memoryAgent = new MemoryAgent();
  console.log(`✓ MemoryAgent created: ${memoryAgent.getName()}`);

  // Test WorkerAgent (all types)
  const mapWorker = new WorkerAgent("map");
  const auditWorker = new WorkerAgent("audit");
  const optimizeWorker = new WorkerAgent("optimize");
  const testgapsWorker = new WorkerAgent("testgaps");
  console.log(`✓ WorkerAgents created: ${mapWorker.getName()}, ${auditWorker.getName()}, ${optimizeWorker.getName()}, ${testgapsWorker.getName()}`);

  // Test EvaluatorAgent
  const evaluatorAgent = new EvaluatorAgent();
  console.log(`✓ EvaluatorAgent created: ${evaluatorAgent.getName()}`);

  // Test AgentCoordinator
  const coordinator = new AgentCoordinator({
    iterativeRefinement: { enabled: true, maxIterations: 2, qualityThreshold: 0.7 },
    historicalLearning: { enabled: false, retrievalTopK: 3, patternMinSuccessRate: 0.6 },
    swarm: { topology: "hierarchical-mesh", maxAgents: 4 },
  });
  console.log("✓ AgentCoordinator created");

  return { swarmAgent, taskAgent, memoryAgent, evaluatorAgent, coordinator };
}

async function testWorkerChunking() {
  console.log("\n=== Testing Worker Chunking ===");

  const worker = new WorkerAgent("map");

  // Test file chunking
  const files = Array.from({ length: 25 }, (_, i) => `file${i}.ts`);
  const chunks = worker.chunkFiles(files, 10);

  console.log(`Input: ${files.length} files`);
  console.log(`Output: ${chunks.length} chunks`);
  console.log(`Chunk sizes: ${chunks.map(c => c.length).join(", ")}`);

  // Test dynamic agent scaling
  console.log(`Agent count for 5 files: ${worker.getAgentCount(5)}`);
  console.log(`Agent count for 30 files: ${worker.getAgentCount(30)}`);
  console.log(`Agent count for 100 files: ${worker.getAgentCount(100)}`);

  console.log("✓ Worker chunking working");
}

async function testEvaluatorCriteria() {
  console.log("\n=== Testing Evaluator Criteria ===");

  const evaluator = new EvaluatorAgent();
  const criteria = evaluator.getCriteria();

  console.log("Default evaluation criteria:");
  for (const c of criteria) {
    console.log(`  - ${c.name} (${(c.weight * 100).toFixed(0)}%): ${c.description}`);
  }

  // Test custom criteria
  evaluator.setCriteria([
    { name: "Custom1", description: "Custom criterion 1", weight: 0.5 },
    { name: "Custom2", description: "Custom criterion 2", weight: 0.5 },
  ]);

  const customCriteria = evaluator.getCriteria();
  console.log(`Custom criteria count: ${customCriteria.length}`);

  console.log("✓ Evaluator criteria working");
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     SWARM ORCHESTRATO - Agent Tests          ║");
  console.log("╚══════════════════════════════════════════════╝");

  try {
    await testProjectContext();
    await testAgentCreation();
    await testWorkerChunking();
    await testEvaluatorCriteria();

    console.log("\n✅ All tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
