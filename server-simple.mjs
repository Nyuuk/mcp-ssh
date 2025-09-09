#!/usr/bin/env node

/**
 * MCP SSH Agent - A Model Context Protocol server for managing SSH connections
 *
 * This is a simplified implementation that directly imports from specific files
 * to avoid module resolution issues.
 */

// Import required Node.js modules
import { homedir } from "os";
import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// Use createRequire to work around ESM import issues
const require = createRequire(import.meta.url);

// Required libraries
const { spawn, exec, execFile } = require("child_process");
const { promisify } = require("util");
const sshConfig = require("ssh-config");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Silent mode for MCP clients - disable debug output when used as MCP server
const SILENT_MODE =
  process.env.MCP_SILENT === "true" || process.argv.includes("--silent");

// SSH Session configuration
const SSH_SESSION_ENABLED = process.env.SSH_SESSION_REUSE !== "false"; // Default: enabled
const SSH_SESSION_TIMEOUT =
  parseInt(process.env.SSH_SESSION_TIMEOUT) || 5 * 60 * 1000; // 5 minutes default

// Debug logging function - only outputs in non-silent mode
function debugLog(message) {
  if (!SILENT_MODE) {
    process.stderr.write(message);
  }
}

// Import MCP components using proper export paths
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// SSH Configuration Parser
class SSHConfigParser {
  constructor() {
    const homeDir = homedir();
    this.configPath = join(homeDir, ".ssh", "config");
    this.knownHostsPath = join(homeDir, ".ssh", "known_hosts");
  }

  async parseConfig() {
    try {
      const content = await readFile(this.configPath, "utf-8");
      const config = sshConfig.parse(content);
      return this.extractHostsFromConfig(config, this.configPath);
    } catch (error) {
      debugLog(`Error reading SSH config: ${error.message}\n`);
      return [];
    }
  }

  async processIncludeDirectives(configPath) {
    try {
      const content = await readFile(configPath, "utf-8");
      const config = sshConfig.parse(content);
      const hosts = [];

      for (const section of config) {
        if (section.param === "Include" && section.value) {
          const includePaths = this.expandIncludePath(
            section.value,
            configPath
          );

          for (const includePath of includePaths) {
            try {
              const includeHosts = await this.processIncludeDirectives(
                includePath
              );
              hosts.push(...includeHosts);
            } catch (error) {
              debugLog(
                `Error processing include file ${includePath}: ${error.message}\n`
              );
            }
          }
        }
      }

      // Add hosts from the current config file
      const currentHosts = this.extractHostsFromConfig(config, configPath);
      hosts.push(...currentHosts);

      return hosts;
    } catch (error) {
      debugLog(
        `Error processing config file ${configPath}: ${error.message}\n`
      );
      return [];
    }
  }

  expandIncludePath(includePath, baseConfigPath) {
    const { dirname, resolve } = require("path");
    const { glob } = require("glob");
    const { existsSync } = require("fs");

    // Handle tilde expansion
    if (includePath.startsWith("~/")) {
      includePath = includePath.replace("~", homedir());
    }

    // Handle relative paths
    if (!includePath.startsWith("/")) {
      const baseDir = dirname(baseConfigPath);
      includePath = resolve(baseDir, includePath);
    }

    try {
      // Handle glob patterns
      if (includePath.includes("*") || includePath.includes("?")) {
        return glob.sync(includePath).filter((path) => existsSync(path));
      } else {
        return existsSync(includePath) ? [includePath] : [];
      }
    } catch (error) {
      debugLog(
        `Error expanding include path ${includePath}: ${error.message}\n`
      );
      return [];
    }
  }

  extractHostsFromConfig(config, configPath) {
    const hosts = [];

    for (const section of config) {
      // Skip Include directives as they are processed separately
      if (section.param === "Include") {
        continue;
      }

      if (section.param === "Host" && section.value !== "*") {
        const hostInfo = {
          hostname: "",
          alias: section.value,
          configFile: configPath,
        };

        // Search all entries for this host
        for (const param of section.config) {
          // Safety check for undefined param
          if (!param || !param.param) {
            continue;
          }

          switch (param.param.toLowerCase()) {
            case "hostname":
              hostInfo.hostname = param.value;
              break;
            case "user":
              hostInfo.user = param.value;
              break;
            case "port":
              hostInfo.port = parseInt(param.value, 10);
              break;
            case "identityfile":
              hostInfo.identityFile = param.value;
              break;
            default:
              // Store other parameters
              hostInfo[param.param.toLowerCase()] = param.value;
          }
        }

        // Only add hosts with complete information
        if (hostInfo.hostname) {
          hosts.push(hostInfo);
        }
      }
    }

    return hosts;
  }

  async parseKnownHosts() {
    try {
      const content = await readFile(this.knownHostsPath, "utf-8");
      const knownHosts = content
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
          // Format: hostname[,hostname2...] key-type public-key
          const parts = line.split(" ")[0];
          return parts.split(",")[0];
        });

      return knownHosts;
    } catch (error) {
      debugLog(`Error reading known_hosts file: ${error.message}\n`);
      return [];
    }
  }

  async getAllKnownHosts() {
    // First: Get all hosts from ~/.ssh/config including Include directives (these are prioritized)
    const configHosts = await this.processIncludeDirectives(this.configPath);

    // Second: Get hostnames from ~/.ssh/known_hosts
    const knownHostnames = await this.parseKnownHosts();

    // Create a comprehensive list starting with config hosts
    const allHosts = [...configHosts];

    // Add hosts from known_hosts that aren't already in the config
    // These will appear after the config hosts
    for (const hostname of knownHostnames) {
      if (
        !configHosts.some(
          (host) => host.hostname === hostname || host.alias === hostname
        )
      ) {
        allHosts.push({
          hostname: hostname,
          source: "known_hosts",
        });
      }
    }

    // Mark config hosts for clarity
    configHosts.forEach((host) => {
      host.source = "ssh_config";
    });

    return allHosts;
  }
}

// SSH Session Manager for connection reuse
class SSHSessionManager {
  constructor() {
    this.sessions = new Map(); // hostAlias -> { socketPath, lastUsed, timeoutId }
    this.sessionTimeout = SSH_SESSION_TIMEOUT;
    this.enabled = SSH_SESSION_ENABLED;

    if (this.enabled) {
      debugLog(
        `SSH Session reuse enabled (timeout: ${this.sessionTimeout}ms)\n`
      );
    } else {
      debugLog("SSH Session reuse disabled\n");
    }
  }

  async createSession(hostAlias) {
    try {
      const socketPath = `/tmp/mcp-ssh-${hostAlias}-${Date.now()}`;
      debugLog(`Creating SSH session for ${hostAlias} at ${socketPath}\n`);

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
      debugLog(`SSH session created successfully for ${hostAlias}\n`);
      return socketPath;
    } catch (error) {
      debugLog(
        `Failed to create SSH session for ${hostAlias}: ${error.message}\n`
      );
      throw error;
    }
  }

  async getSession(hostAlias) {
    // If session reuse is disabled, return null to force new connections
    if (!this.enabled) {
      return null;
    }

    let session = this.sessions.get(hostAlias);

    if (!session) {
      // Create new session
      await this.createSession(hostAlias);
      session = this.sessions.get(hostAlias);
    }

    if (session) {
      // Update last used time and reset timeout
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
      debugLog(`Cleaning up SSH session for ${hostAlias}\n`);
      try {
        // Close the master connection
        await execFileAsync("ssh", [
          "-O",
          "exit",
          "-S",
          session.socketPath,
          hostAlias,
        ]);
      } catch (error) {
        debugLog(
          `Error closing SSH session for ${hostAlias}: ${error.message}\n`
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

// SSH Client Implementation
class SSHClient {
  constructor() {
    this.configParser = new SSHConfigParser();
    this.sessionManager = new SSHSessionManager();
  }

  async listKnownHosts() {
    return await this.configParser.getAllKnownHosts();
  }

  async runRemoteCommand(hostAlias, command) {
    try {
      // Get or create SSH session for connection reuse
      const socketPath = await this.sessionManager.getSession(hostAlias);

      if (socketPath) {
        // Use existing session via ControlMaster socket
        debugLog(
          `Executing with session: ssh -S ${socketPath} ${hostAlias} ${command}\n`
        );
        const { stdout, stderr } = await execFileAsync(
          "ssh",
          ["-S", socketPath, hostAlias, command],
          {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10,
          }
        );

        return {
          stdout: stdout || "",
          stderr: stderr || "",
          code: 0,
        };
      } else {
        // Session reuse disabled or failed, use direct connection
        debugLog(`Executing without session: ssh ${hostAlias} ${command}\n`);
        const { stdout, stderr } = await execFileAsync(
          "ssh",
          [hostAlias, command],
          {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10,
          }
        );

        return {
          stdout: stdout || "",
          stderr: stderr || "",
          code: 0,
        };
      }
    } catch (error) {
      debugLog(`Error executing command on ${hostAlias}: ${error.message}\n`);
      return {
        stdout: error.stdout || "",
        stderr: error.stderr || error.message,
        code: error.code || 1,
      };
    }
  }

  async getHostInfo(hostAlias) {
    const hosts = await this.configParser.processIncludeDirectives(
      this.configParser.configPath
    );
    return (
      hosts.find(
        (host) => host.alias === hostAlias || host.hostname === hostAlias
      ) || null
    );
  }

  async checkConnectivity(hostAlias) {
    try {
      // Simple connectivity test using ssh
      const result = await this.runRemoteCommand(hostAlias, "echo connected");
      const connected =
        result.code === 0 && result.stdout.trim() === "connected";

      return {
        connected,
        message: connected ? "Connection successful" : "Connection failed",
      };
    } catch (error) {
      debugLog(`Connectivity error with ${hostAlias}: ${error.message}\n`);
      return {
        connected: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async uploadFile(hostAlias, localPath, remotePath) {
    try {
      // Get or create SSH session for connection reuse
      const socketPath = await this.sessionManager.getSession(hostAlias);

      if (socketPath) {
        // Use existing session via ControlMaster
        debugLog(
          `Executing with session: scp -o ControlPath=${socketPath} ${localPath} ${hostAlias}:${remotePath}\n`
        );
        await execFileAsync(
          "scp",
          [
            "-o",
            `ControlPath=${socketPath}`,
            localPath,
            `${hostAlias}:${remotePath}`,
          ],
          {
            timeout: 60000,
          }
        );
      } else {
        // Session reuse disabled or failed, use direct connection
        debugLog(
          `Executing without session: scp ${localPath} ${hostAlias}:${remotePath}\n`
        );
        await execFileAsync("scp", [localPath, `${hostAlias}:${remotePath}`], {
          timeout: 60000,
        });
      }
      return true;
    } catch (error) {
      debugLog(`Error uploading file to ${hostAlias}: ${error.message}\n`);
      return false;
    }
  }

  async downloadFile(hostAlias, remotePath, localPath) {
    try {
      // Get or create SSH session for connection reuse
      const socketPath = await this.sessionManager.getSession(hostAlias);

      if (socketPath) {
        // Use existing session via ControlMaster
        debugLog(
          `Executing with session: scp -o ControlPath=${socketPath} ${hostAlias}:${remotePath} ${localPath}\n`
        );
        await execFileAsync(
          "scp",
          [
            "-o",
            `ControlPath=${socketPath}`,
            `${hostAlias}:${remotePath}`,
            localPath,
          ],
          {
            timeout: 60000,
          }
        );
      } else {
        // Session reuse disabled or failed, use direct connection
        debugLog(
          `Executing without session: scp ${hostAlias}:${remotePath} ${localPath}\n`
        );
        await execFileAsync("scp", [`${hostAlias}:${remotePath}`, localPath], {
          timeout: 60000,
        });
      }
      return true;
    } catch (error) {
      debugLog(`Error downloading file from ${hostAlias}: ${error.message}\n`);
      return false;
    }
  }

  async runCommandBatch(hostAlias, commands) {
    try {
      const results = [];
      let success = true;

      for (const command of commands) {
        const result = await this.runRemoteCommand(hostAlias, command);
        results.push(result);

        if (result.code !== 0) {
          success = false;
          // Continue executing remaining commands
        }
      }

      return {
        results,
        success,
      };
    } catch (error) {
      debugLog(
        `Error during batch execution on ${hostAlias}: ${error.message}\n`
      );
      return {
        results: [
          {
            stdout: "",
            stderr: error instanceof Error ? error.message : String(error),
            code: 1,
          },
        ],
        success: false,
      };
    }
  }
}

// Main function to start the MCP server
async function main() {
  let sshClient;

  try {
    // Create an instance of the SSH client
    debugLog("Initializing SSH client...\n");
    sshClient = new SSHClient();

    debugLog("Creating MCP server...\n");
    // Create an MCP server
    const server = new Server(
      { name: "mcp-ssh", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    debugLog("Setting up request handlers...\n");
    // Handler for listing available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      debugLog("Received listTools request\n");
      return {
        tools: [
          {
            name: "listKnownHosts",
            description:
              "Returns a consolidated list of all known SSH hosts, prioritizing ~/.ssh/config entries first, then additional hosts from ~/.ssh/known_hosts",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "runRemoteCommand",
            description: "Executes a shell command on an SSH host",
            inputSchema: {
              type: "object",
              properties: {
                hostAlias: {
                  type: "string",
                  description: "Alias or hostname of the SSH host",
                },
                command: {
                  type: "string",
                  description: "The shell command to execute",
                },
              },
              required: ["hostAlias", "command"],
            },
          },
          {
            name: "getHostInfo",
            description: "Returns all configuration details for an SSH host",
            inputSchema: {
              type: "object",
              properties: {
                hostAlias: {
                  type: "string",
                  description: "Alias or hostname of the SSH host",
                },
              },
              required: ["hostAlias"],
            },
          },
          {
            name: "checkConnectivity",
            description: "Checks if an SSH connection to the host is possible",
            inputSchema: {
              type: "object",
              properties: {
                hostAlias: {
                  type: "string",
                  description: "Alias or hostname of the SSH host",
                },
              },
              required: ["hostAlias"],
            },
          },
          {
            name: "uploadFile",
            description: "Uploads a local file to an SSH host",
            inputSchema: {
              type: "object",
              properties: {
                hostAlias: {
                  type: "string",
                  description: "Alias or hostname of the SSH host",
                },
                localPath: {
                  type: "string",
                  description: "Path to the local file",
                },
                remotePath: {
                  type: "string",
                  description: "Path on the remote host",
                },
              },
              required: ["hostAlias", "localPath", "remotePath"],
            },
          },
          {
            name: "downloadFile",
            description: "Downloads a file from an SSH host",
            inputSchema: {
              type: "object",
              properties: {
                hostAlias: {
                  type: "string",
                  description: "Alias or hostname of the SSH host",
                },
                remotePath: {
                  type: "string",
                  description: "Path on the remote host",
                },
                localPath: {
                  type: "string",
                  description: "Path to the local destination",
                },
              },
              required: ["hostAlias", "remotePath", "localPath"],
            },
          },
          {
            name: "runCommandBatch",
            description:
              "Executes multiple shell commands sequentially on an SSH host",
            inputSchema: {
              type: "object",
              properties: {
                hostAlias: {
                  type: "string",
                  description: "Alias or hostname of the SSH host",
                },
                commands: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of shell commands to execute",
                },
              },
              required: ["hostAlias", "commands"],
            },
          },
        ],
      };
    });

    // Handler for tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      debugLog(`Received callTool request for tool: ${name}\n`);

      if (!args && name !== "listKnownHosts") {
        throw new Error(`No arguments provided for tool: ${name}`);
      }

      try {
        switch (name) {
          case "listKnownHosts": {
            const hosts = await sshClient.listKnownHosts();
            return {
              content: [{ type: "text", text: JSON.stringify(hosts, null, 2) }],
            };
          }

          case "runRemoteCommand": {
            const result = await sshClient.runRemoteCommand(
              args.hostAlias,
              args.command
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }

          case "getHostInfo": {
            const hostInfo = await sshClient.getHostInfo(args.hostAlias);
            return {
              content: [
                { type: "text", text: JSON.stringify(hostInfo, null, 2) },
              ],
            };
          }

          case "checkConnectivity": {
            const status = await sshClient.checkConnectivity(args.hostAlias);
            return {
              content: [
                { type: "text", text: JSON.stringify(status, null, 2) },
              ],
            };
          }

          case "uploadFile": {
            const success = await sshClient.uploadFile(
              args.hostAlias,
              args.localPath,
              args.remotePath
            );
            return {
              content: [
                { type: "text", text: JSON.stringify({ success }, null, 2) },
              ],
            };
          }

          case "downloadFile": {
            const success = await sshClient.downloadFile(
              args.hostAlias,
              args.remotePath,
              args.localPath
            );
            return {
              content: [
                { type: "text", text: JSON.stringify({ success }, null, 2) },
              ],
            };
          }

          case "runCommandBatch": {
            const result = await sshClient.runCommandBatch(
              args.hostAlias,
              args.commands
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        debugLog(`Error executing tool ${name}: ${error.message}\n`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    });

    debugLog("Starting MCP SSH Agent on STDIO...\n");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    debugLog("MCP SSH Agent connected and ready!\n");

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      debugLog("Received SIGINT, cleaning up SSH sessions...\n");
      if (sshClient) {
        await sshClient.sessionManager.cleanupAll();
      }
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      debugLog("Received SIGTERM, cleaning up SSH sessions...\n");
      if (sshClient) {
        await sshClient.sessionManager.cleanupAll();
      }
      process.exit(0);
    });
  } catch (error) {
    debugLog(`Error starting MCP SSH Agent: ${error.message}\n`);
    // Cleanup on error
    if (sshClient) {
      await sshClient.sessionManager.cleanupAll();
    }
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  debugLog(`Unhandled error: ${error.message}\n`);
  process.exit(1);
});
