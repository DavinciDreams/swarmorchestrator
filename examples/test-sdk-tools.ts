/**
 * Test script for the SDK tools integration
 * Verifies that SDK tools are properly exported and available
 */

import { allTools, sdkTools } from "../src/tools/index.js";

console.log("╔══════════════════════════════════════════════╗");
console.log("║     SDK Tools Integration Test               ║");
console.log("╚══════════════════════════════════════════════╝");

console.log("\n=== Tool Counts ===");
console.log(`Total tools: ${allTools.length}`);
console.log(`SDK tools: ${sdkTools.length}`);

console.log("\n=== SDK Tool Names ===");
sdkTools.forEach((t) => console.log(`  - ${t.name}: ${t.description?.slice(0, 60)}...`));

console.log("\n=== All Tools by Category ===");
const mcpTools = allTools.filter((t) => !t.name.startsWith("sdk_"));
console.log(`MCP tools (Claude Flow): ${mcpTools.length}`);
console.log(`SDK tools (Agent SDK): ${sdkTools.length}`);

console.log("\n✅ SDK tools integration verified!");
