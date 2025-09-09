#!/usr/bin/env node

import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// Create a test file to upload
const testFileContent =
  "This is a test file for MCP SSH session reuse demonstration.\nCreated at: " +
  new Date().toISOString() +
  "\n";
const testFilePath = "/tmp/test-mcp-session-reuse.txt";
writeFileSync(testFilePath, testFileContent);

console.log("Created test file:", testFilePath);
console.log("File content:", testFileContent);

// Start the MCP server
const serverProcess = spawn("node", ["server-simple.mjs"], {
  cwd: "/Users/25040100/Documents/my-project/mcp/mcp-ssh",
  stdio: ["pipe", "pipe", "inherit"],
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
  console.log("=== Testing MCP SSH File Operations with Session Reuse ===\n");

  // Test 1: Check connectivity (creates session)
  sendRequest("tools/call", {
    name: "checkConnectivity",
    arguments: {
      hostAlias: "contabo",
    },
  });

  // Wait and then test file upload
  setTimeout(() => {
    // Test 2: Upload file (should reuse session)
    sendRequest("tools/call", {
      name: "uploadFile",
      arguments: {
        hostAlias: "contabo",
        localPath: testFilePath,
        remotePath: "/tmp/test-uploaded.txt",
      },
    });

    // Wait and then run command to verify upload
    setTimeout(() => {
      // Test 3: Verify file was uploaded (should reuse session)
      sendRequest("tools/call", {
        name: "runRemoteCommand",
        arguments: {
          hostAlias: "contabo",
          command:
            "ls -la /tmp/test-uploaded.txt && cat /tmp/test-uploaded.txt",
        },
      });

      // Wait and then test download
      setTimeout(() => {
        // Test 4: Download the file back (should reuse session)
        sendRequest("tools/call", {
          name: "downloadFile",
          arguments: {
            hostAlias: "contabo",
            remotePath: "/tmp/test-uploaded.txt",
            localPath: "/tmp/test-downloaded.txt",
          },
        });

        // Wait and then verify download
        setTimeout(() => {
          // Test 5: Run multiple commands to show session reuse
          sendRequest("tools/call", {
            name: "runCommandBatch",
            arguments: {
              hostAlias: "contabo",
              commands: [
                "echo 'Command 1: Session reuse test'",
                "date",
                "whoami",
                "pwd",
                "echo 'Command 5: Final test command'",
              ],
            },
          });

          // Close after all tests
          setTimeout(() => {
            console.log(
              "\n=== File Operations Test completed, closing server ==="
            );
            serverProcess.kill();
          }, 5000);
        }, 4000);
      }, 4000);
    }, 4000);
  }, 3000);
}, 2000);
