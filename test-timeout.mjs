#!/usr/bin/env node

import { spawn } from "child_process";

// Start the MCP server with a short timeout for testing
const serverProcess = spawn("node", ["server-simple.mjs"], {
  cwd: "/Users/25040100/Documents/my-project/mcp/mcp-ssh",
  stdio: ["pipe", "pipe", "inherit"],
  env: {
    ...process.env,
    SSH_SESSION_TIMEOUT: "10000", // 10 seconds for testing
  },
});

let requestId = 1;

// Function to send MCP request
function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: "2.0",
    id: requestId++,
    method,
    params,
  };

  console.log(`\n=== Sending ${method} request ===`);
  console.log(JSON.stringify(request, null, 2));
  serverProcess.stdin.write(JSON.stringify(request) + "\n");
}

// Handle server responses
serverProcess.stdout.on("data", (data) => {
  const lines = data.toString().trim().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log("\n=== Server Response ===");
        console.log(JSON.stringify(response, null, 2));
      } catch (e) {
        console.log("Raw output:", line);
      }
    }
  }
});

serverProcess.on("close", (code) => {
  console.log(`\nServer process exited with code ${code}`);
});

// Wait a bit for server to initialize
setTimeout(() => {
  console.log("=== Testing MCP SSH Session Timeout (10 seconds) ===\n");

  // Test 1: Create a session with first command
  console.log("Creating session with first command...");
  sendRequest("tools/call", {
    name: "runRemoteCommand",
    arguments: {
      hostAlias: "contabo",
      command: "echo 'Session created - will timeout in 10 seconds'",
    },
  });

  // Test 2: Use the session immediately
  setTimeout(() => {
    console.log("\nUsing session 3 seconds after creation...");
    sendRequest("tools/call", {
      name: "runRemoteCommand",
      arguments: {
        hostAlias: "contabo",
        command: "echo 'Using session - 3 seconds elapsed'",
      },
    });
  }, 3000);

  // Test 3: Wait for timeout and try to reuse (should create new session)
  setTimeout(() => {
    console.log(
      "\nTrying to reuse session after 12 seconds (should timeout)..."
    );
    sendRequest("tools/call", {
      name: "runRemoteCommand",
      arguments: {
        hostAlias: "contabo",
        command: "echo 'Testing after timeout - should create new session'",
      },
    });
  }, 12000);

  // Test 4: Verify the session was cleaned up
  setTimeout(() => {
    console.log("\nFinal test - session should be cleaned up...");
    sendRequest("tools/call", {
      name: "runRemoteCommand",
      arguments: {
        hostAlias: "contabo",
        command: "echo 'Final verification'",
      },
    });

    // Close after all tests
    setTimeout(() => {
      console.log("\n=== Timeout Test completed, closing server ===");
      serverProcess.kill();
    }, 3000);
  }, 15000);
}, 2000);
