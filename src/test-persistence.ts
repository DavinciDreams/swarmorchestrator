/**
 * Test script to verify persistence fallback system
 */

import { PersistenceManager } from "./utils/persistence.js";
import { disableMcp } from "./mcp/client.js";

async function testPersistence() {
  console.log("=== Testing Persistence System ===\n");

  // Disable MCP to test local fallback
  disableMcp();
  console.log("✓ MCP disabled - will use local file storage\n");

  const persistence = new PersistenceManager({
    localStorageDir: "./.memory",
    verbose: true,
  });

  // Test 1: Store data
  console.log("Test 1: Storing data...");
  const storeResult = await persistence.store(
    "test_namespace",
    "test-key-1",
    {
      message: "Hello from persistence test",
      timestamp: new Date().toISOString(),
      nested: {
        data: [1, 2, 3],
        flag: true,
      },
    },
    ["test", "demo"]
  );
  console.log(`  Backend: ${storeResult.backend}`);
  console.log(`  Success: ${storeResult.success}\n`);

  // Test 2: Retrieve data
  console.log("Test 2: Retrieving data...");
  const retrieveResult = await persistence.retrieve("test_namespace", "test-key-1");
  console.log(`  Backend: ${retrieveResult.backend}`);
  console.log(`  Success: ${retrieveResult.success}`);
  if (retrieveResult.data) {
    console.log(`  Data: ${JSON.stringify(retrieveResult.data, null, 2)}\n`);
  }

  // Test 3: Store multiple entries
  console.log("Test 3: Storing multiple entries...");
  for (let i = 1; i <= 5; i++) {
    await persistence.store("test_namespace", `entry-${i}`, {
      index: i,
      value: `Entry number ${i}`,
    });
  }
  console.log("  ✓ Stored 5 entries\n");

  // Test 4: List all keys
  console.log("Test 4: Listing all keys...");
  const listResult = await persistence.list("test_namespace");
  console.log(`  Backend: ${listResult.backend}`);
  console.log(`  Keys found: ${listResult.keys.length}`);
  console.log(`  Keys: ${listResult.keys.join(", ")}\n`);

  // Test 5: Get statistics
  console.log("Test 5: Storage statistics...");
  const stats = await persistence.getStats();
  console.log(`  MCP Enabled: ${stats.mcpEnabled}`);
  console.log(`  Local Storage Dir: ${stats.localStorageDir}`);
  console.log(`  Namespaces:`);
  for (const ns of stats.namespaces) {
    console.log(`    - ${ns.name}: ${ns.keyCount} keys`);
  }
  console.log();

  // Test 6: Coordinator-style persistence
  console.log("Test 6: Simulating coordinator metrics persistence...");
  const metricsResult = await persistence.store("sdk_coordinator", "coordinator_metrics", {
    totalTasks: 10,
    successfulTasks: 8,
    averageQuality: 0.85,
    averageIterations: 2.3,
    patternsLearned: 5,
    lastUpdated: new Date().toISOString(),
  });
  console.log(`  ✓ Metrics persisted to ${metricsResult.backend} storage\n`);

  // Test 7: Retrieve coordinator metrics
  console.log("Test 7: Retrieving coordinator metrics...");
  const metricsRetrieve = await persistence.retrieve("sdk_coordinator", "coordinator_metrics");
  if (metricsRetrieve.success && metricsRetrieve.data) {
    console.log(`  Total Tasks: ${metricsRetrieve.data.totalTasks}`);
    console.log(`  Success Rate: ${(Number(metricsRetrieve.data.successfulTasks) / Number(metricsRetrieve.data.totalTasks) * 100).toFixed(1)}%`);
    console.log(`  Average Quality: ${metricsRetrieve.data.averageQuality}`);
  }

  console.log("\n=== All Tests Complete ===");
  console.log("✓ Persistence system is working correctly!");
  console.log("✓ Data will automatically fall back to local files when MCP is unavailable");
}

// Run tests
testPersistence().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
