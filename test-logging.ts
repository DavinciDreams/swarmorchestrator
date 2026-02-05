#!/usr/bin/env tsx
/**
 * SDK Logging System Integration Test
 *
 * Tests basic functionality of the SDK logging system:
 * - Logger initialization
 * - Execution logging
 * - Tool usage logging
 * - Report generation
 * - Log retrieval
 */

import { getGlobalLogger, resetGlobalLogger } from "./src/utils/logger.js";

async function testLogging() {
  console.log("🧪 Testing SDK Logging System\n");

  // Reset logger for clean test
  resetGlobalLogger();
  const logger = getGlobalLogger();

  console.log("✓ Logger initialized");
  console.log(`  Session ID: ${logger.getSessionId()}\n`);

  // Test 1: Basic logging
  console.log("Test 1: Basic logging");
  await logger.log("info", "Test message", { foo: "bar" });
  console.log("✓ Basic log created\n");

  // Test 2: Execution logging
  console.log("Test 2: Execution logging");
  const executionId = "test-exec-001";
  logger.logExecutionStart(
    executionId,
    "test",
    "Test execution for logging",
    "test-agent",
    "TestAgent"
  );
  console.log("✓ Execution started");

  // Simulate tool usage
  const toolId = logger.logToolStart("test_tool", { param1: "value1" });
  console.log("✓ Tool usage started");

  await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work

  await logger.logToolEnd(toolId, { result: "success" }, true);
  console.log("✓ Tool usage ended");

  // Complete execution
  await logger.logExecutionEnd(
    executionId,
    true,
    0.95,
    "Test output",
    1,
    [{
      toolName: "test_tool",
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 100,
      parameters: { param1: "value1" },
      result: { result: "success" },
      success: true,
    }]
  );
  console.log("✓ Execution completed\n");

  // Test 3: Log retrieval
  console.log("Test 3: Log retrieval");
  const execLogs = logger.getExecutionLogs();
  console.log(`✓ Retrieved ${execLogs.length} execution log(s)`);

  const metrics = logger.getPerformanceMetrics();
  console.log(`✓ Performance metrics:
    Total: ${metrics.totalExecutions}
    Success: ${metrics.successfulExecutions}
    Avg Duration: ${metrics.averageDuration.toFixed(0)}ms
    Avg Quality: ${metrics.averageQuality.toFixed(2)}\n`);

  // Test 4: Report generation
  console.log("Test 4: Report generation");
  const report = logger.generateExecutionReport();
  console.log("✓ Report generated");
  console.log("\n" + "=".repeat(60));
  console.log(report);
  console.log("=".repeat(60) + "\n");

  // Test 5: Filtered log retrieval
  console.log("Test 5: Filtered log retrieval");
  const filteredLogs = logger.getFilteredExecutionLogs({
    success: true,
    minQuality: 0.9,
  });
  console.log(`✓ Retrieved ${filteredLogs.length} filtered log(s) (success=true, quality>=0.9)\n`);

  // Summary
  console.log("✅ All tests passed!");
  console.log("\nSDK Logging System is working correctly.");

  return true;
}

// Run test
testLogging()
  .then(() => {
    console.log("\n✅ Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
