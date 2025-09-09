#!/usr/bin/env node

import { spawn } from "child_process";
import { join } from "path";

// Start the MCP server
const serverProcess = spawn("node", ["server-simple.mjs"], {
  cwd: "/Users/25040100/Documents/my-project/mcp/mcp-ssh",
  stdio: ["pipe", "pipe", "inherit"]
});

let requestId = 1;

// Function to send MCP request
function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: "2.0",
    id: requestId++,
    method,
    params
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
  console.log("=== Testing MCP SSH Server ===\n");

  // Test 1: List available tools
  sendRequest("tools/list", {});

  // Wait for response and then test connectivity
  setTimeout(() => {
    // Test 2: List known hosts
    sendRequest("tools/call", {
      name: "listKnownHosts"
    });

    // Wait for response and then test connectivity
    setTimeout(() => {
      // Test 3: Check connectivity to contabo host
      sendRequest("tools/call", {
        name: "checkConnectivity",
        arguments: {
          hostAlias: "contabo"
        }
      });

      // Wait for response and then test session reuse
      setTimeout(() => {
        // Test 4: Run a command to test session reuse
        sendRequest("tools/call", {
          name: "runRemoteCommand",
          arguments: {
            hostAlias: "contabo",
            command: "echo 'Testing session reuse - First command'"
          }
        });

        // Wait for response and then run another command to test reuse
        setTimeout(() => {
          sendRequest("tools/call", {
            name: "runRemoteCommand",
            arguments: {
              hostAlias: "contabo",
              command: "echo 'Testing session reuse - Second command'"
            }
          });

          // Wait for response and then run another command
          setTimeout(() => {
            sendRequest("tools/call", {
              name: "runRemoteCommand",
              arguments: {
                hostAlias: "contabo",
                command: "date && uptime"
              }
            });

            // Close after all tests
            setTimeout(() => {
              console.log("\n=== Test completed, closing server ===");
              serverProcess.kill();
            }, 3000);

          }, 3000);
        }, 3000);
      }, 3000);
    }, 3000);
  }, 2000);
}, 2000);
