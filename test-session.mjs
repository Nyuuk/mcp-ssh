#!/usr/bin/env node

/**
 * Simple test script to verify SSH session reuse functionality
 * This script tests the session manager independently
 */

// Import required modules
import { homedir } from "os";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Required libraries
const { spawn, exec, execFile } = require("child_process");
const { promisify } = require("util");
const { readFile } = require("fs/promises");
const { join } = require("path");
const sshConfig = require("ssh-config");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// SSH Session Manager (same as in server-simple.mjs)
class SSHSessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionTimeout = 5 * 60 * 1000; // 5 minutes
    this.enabled = process.env.SSH_SESSION_REUSE !== "false";

    console.log(`SSH Session reuse ${this.enabled ? "enabled" : "disabled"}`);
  }

  async createSession(hostAlias) {
    try {
      const socketPath = `/tmp/test-ssh-${hostAlias}-${Date.now()}`;
      console.log(`Creating SSH session for ${hostAlias} at ${socketPath}`);

      // Use ControlMaster to create a multiplexed connection
      const result = await execFileAsync(
        "ssh",
        [
          "-f", // Go to background
          "-N", // Don't execute remote command
          "-M", // Master mode
          "-S",
          socketPath, // Control socket path
          hostAlias,
        ],
        { timeout: 10000 }
      );

      const session = {
        socketPath,
        lastUsed: Date.now(),
        timeoutId: setTimeout(() => {
          this.cleanupSession(hostAlias);
        }, this.sessionTimeout),
      };

      this.sessions.set(hostAlias, session);
      console.log(`SSH session created successfully for ${hostAlias}`);
      return socketPath;
    } catch (error) {
      console.error(
        `Failed to create SSH session for ${hostAlias}: ${error.message}`
      );
      throw error;
    }
  }

  async getSession(hostAlias) {
    if (!this.enabled) {
      return null;
    }

    let session = this.sessions.get(hostAlias);

    if (!session) {
      await this.createSession(hostAlias);
      session = this.sessions.get(hostAlias);
    }

    if (session) {
      session.lastUsed = Date.now();
      clearTimeout(session.timeoutId);
      session.timeoutId = setTimeout(() => {
        this.cleanupSession(hostAlias);
      }, this.sessionTimeout);

      return session.socketPath;
    }

    return null;
  }

  async cleanupSession(hostAlias) {
    const session = this.sessions.get(hostAlias);
    if (session) {
      console.log(`Cleaning up SSH session for ${hostAlias}`);
      try {
        await execFileAsync("ssh", [
          "-O",
          "exit",
          "-S",
          session.socketPath,
          hostAlias,
        ]);
      } catch (error) {
        console.error(
          `Error closing SSH session for ${hostAlias}: ${error.message}`
        );
      }

      clearTimeout(session.timeoutId);
      this.sessions.delete(hostAlias);
    }
  }

  async cleanupAll() {
    for (const hostAlias of this.sessions.keys()) {
      await this.cleanupSession(hostAlias);
    }
  }
}

// Test function
async function testSessionReuse() {
  console.log("Testing SSH Session Reuse Functionality");
  console.log("=====================================");

  const sessionManager = new SSHSessionManager();

  // Test 1: Check if session creation works
  try {
    console.log("\nTest 1: Session Creation");
    const socketPath = await sessionManager.getSession("prod");
    console.log(`Session created: ${socketPath ? "YES" : "NO"}`);

    if (socketPath) {
      console.log(`Socket path: ${socketPath}`);

      // Test 2: Check if session reuse works
      console.log("\nTest 2: Session Reuse");
      const socketPath2 = await sessionManager.getSession("prod");
      console.log(
        `Same session reused: ${socketPath === socketPath2 ? "YES" : "NO"}`
      );
    }

    // Test 3: Test command execution with session
    console.log("\nTest 3: Command Execution with Session");
    if (socketPath) {
      try {
        const { stdout } = await execFileAsync(
          "ssh",
          ["-S", socketPath, "prod", 'echo "Session test successful"'],
          { timeout: 10000 }
        );

        console.log(`Command output: ${stdout.trim()}`);
      } catch (error) {
        console.error(`Command failed: ${error.message}`);
      }
    }

    // Cleanup
    console.log("\nTest 4: Session Cleanup");
    await sessionManager.cleanupAll();
    console.log("All sessions cleaned up");
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
  }
}

// Run the test
testSessionReuse().catch(console.error);
