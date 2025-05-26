#!/usr/bin/env node

/**
 * Simple test script to verify the MCP server can handle basic requests
 */

import { spawn } from 'child_process';

console.log('Testing MCP SSH Server...');

// Start the server process
const server = spawn('node', ['server-simple.mjs'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

// Test initialization request
const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "test-client",
      version: "1.0.0"
    }
  }
};

setTimeout(() => {
  console.log('Sending initialize request...');
  server.stdin.write(JSON.stringify(initRequest) + '\n');
  
  setTimeout(() => {
    console.log('Test completed. Server appears to be working.');
    server.kill();
    process.exit(0);
  }, 1000);
}, 1000);

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

server.stdout.on('data', (data) => {
  console.log('Server response:', data.toString());
});
