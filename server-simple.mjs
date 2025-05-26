#!/usr/bin/env node

/**
 * MCP SSH Agent - A Model Context Protocol server for managing SSH connections
 * 
 * This is a simplified implementation that directly imports from specific files
 * to avoid module resolution issues.
 */

// Import required Node.js modules
import { homedir } from 'os';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Use createRequire to work around ESM import issues
const require = createRequire(import.meta.url);

// Required libraries
const { NodeSSH } = require('node-ssh');
const sshConfig = require('ssh-config');

// Import MCP components using proper export paths
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// SSH Configuration Parser
class SSHConfigParser {
  constructor() {
    const homeDir = homedir();
    this.configPath = join(homeDir, '.ssh', 'config');
    this.knownHostsPath = join(homeDir, '.ssh', 'known_hosts');
  }

  async parseConfig() {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      const config = sshConfig.parse(content);
      return this.extractHostsFromConfig(config);
    } catch (error) {
      console.error('Error reading SSH config:', error);
      return [];
    }
  }

  extractHostsFromConfig(config) {
    const hosts = [];

    for (const section of config) {
      if (section.param === 'Host' && section.value !== '*') {
        const hostInfo = {
          hostname: '',
          alias: section.value,
        };

        // Search all entries for this host
        for (const param of section.config) {
          switch (param.param.toLowerCase()) {
            case 'hostname':
              hostInfo.hostname = param.value;
              break;
            case 'user':
              hostInfo.user = param.value;
              break;
            case 'port':
              hostInfo.port = parseInt(param.value, 10);
              break;
            case 'identityfile':
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
      const content = await readFile(this.knownHostsPath, 'utf-8');
      const knownHosts = content
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
          // Format: hostname[,hostname2...] key-type public-key
          const parts = line.split(' ')[0];
          return parts.split(',')[0];
        });

      return knownHosts;
    } catch (error) {
      console.error('Error reading known_hosts file:', error);
      return [];
    }
  }

  async getAllKnownHosts() {
    const configHosts = await this.parseConfig();
    const knownHostnames = await this.parseKnownHosts();

    // Add hosts from known_hosts that aren't in the config
    for (const hostname of knownHostnames) {
      if (!configHosts.some(host => 
          host.hostname === hostname || 
          host.alias === hostname)) {
        configHosts.push({
          hostname: hostname
        });
      }
    }

    return configHosts;
  }
}

// SSH Client Implementation
class SSHClient {
  constructor() {
    this.ssh = new NodeSSH();
    this.configParser = new SSHConfigParser();
  }

  async listKnownHosts() {
    return await this.configParser.getAllKnownHosts();
  }

  async runRemoteCommand(hostAlias, command) {
    try {
      // First connect to the host
      await this.connectToHost(hostAlias);

      // Execute the command
      const result = await this.ssh.execCommand(command);
      
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code || 0
      };
    } catch (error) {
      console.error(`Error executing command on ${hostAlias}:`, error);
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        code: 1
      };
    } finally {
      this.ssh.dispose();
    }
  }

  async getHostInfo(hostAlias) {
    const hosts = await this.configParser.parseConfig();
    return hosts.find(host => host.alias === hostAlias || host.hostname === hostAlias) || null;
  }

  async checkConnectivity(hostAlias) {
    try {
      // Establish connection
      await this.connectToHost(hostAlias);
      
      // Execute ping command
      const result = await this.ssh.execCommand('echo connected');
      
      const connected = result.stdout.trim() === 'connected';
      
      this.ssh.dispose();
      
      return {
        connected,
        message: connected ? 'Connection successful' : 'Echo test failed'
      };
    } catch (error) {
      console.error(`Connectivity error with ${hostAlias}:`, error);
      return {
        connected: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async uploadFile(hostAlias, localPath, remotePath) {
    try {
      await this.connectToHost(hostAlias);
      
      await this.ssh.putFile(localPath, remotePath);
      
      this.ssh.dispose();
      return true;
    } catch (error) {
      console.error(`Error uploading file to ${hostAlias}:`, error);
      return false;
    }
  }

  async downloadFile(hostAlias, remotePath, localPath) {
    try {
      await this.connectToHost(hostAlias);
      
      await this.ssh.getFile(localPath, remotePath);
      
      this.ssh.dispose();
      return true;
    } catch (error) {
      console.error(`Error downloading file from ${hostAlias}:`, error);
      return false;
    }
  }

  async runCommandBatch(hostAlias, commands) {
    try {
      await this.connectToHost(hostAlias);
      
      const results = [];
      let success = true;
      
      for (const command of commands) {
        const result = await this.ssh.execCommand(command);
        const cmdResult = {
          stdout: result.stdout,
          stderr: result.stderr,
          code: result.code || 0
        };
        
        results.push(cmdResult);
        
        if (cmdResult.code !== 0) {
          success = false;
          // We don't abort, execute all commands
        }
      }
      
      this.ssh.dispose();
      return {
        results,
        success
      };
    } catch (error) {
      console.error(`Error during batch execution on ${hostAlias}:`, error);
      return {
        results: [{
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          code: 1
        }],
        success: false
      };
    }
  }

  async connectToHost(hostAlias) {
    // Get host information
    const hostInfo = await this.getHostInfo(hostAlias);
    
    if (!hostInfo) {
      throw new Error(`Host ${hostAlias} not found`);
    }

    // Create connection configuration
    const connectionConfig = {
      host: hostInfo.hostname,
      username: hostInfo.user,
      port: hostInfo.port || 22,
      privateKeyPath: hostInfo.identityFile
    };

    try {
      await this.ssh.connect(connectionConfig);
    } catch (error) {
      throw new Error(`Connection to ${hostAlias} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Main function to start the MCP server
async function main() {
  try {
    // Create an instance of the SSH client
    console.log("Initializing SSH client...");
    const sshClient = new SSHClient();

    console.log("Creating MCP server...");
    // Create an MCP server
    const server = new Server(
      { name: "mcp-ssh", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    console.log("Setting up request handlers...");
    // Handler for listing available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log("Received listTools request");
      return {
        tools: [
          {
            name: "listKnownHosts",
            description: "Returns a consolidated list of all known SSH hosts",
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
            description: "Executes multiple shell commands sequentially on an SSH host",
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
      console.log(`Received callTool request for tool: ${name}`);

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
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "getHostInfo": {
            const hostInfo = await sshClient.getHostInfo(args.hostAlias);
            return {
              content: [{ type: "text", text: JSON.stringify(hostInfo, null, 2) }],
            };
          }

          case "checkConnectivity": {
            const status = await sshClient.checkConnectivity(args.hostAlias);
            return {
              content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
            };
          }

          case "uploadFile": {
            const success = await sshClient.uploadFile(
              args.hostAlias,
              args.localPath,
              args.remotePath
            );
            return {
              content: [{ type: "text", text: JSON.stringify({ success }, null, 2) }],
            };
          }

          case "downloadFile": {
            const success = await sshClient.downloadFile(
              args.hostAlias,
              args.remotePath,
              args.localPath
            );
            return {
              content: [{ type: "text", text: JSON.stringify({ success }, null, 2) }],
            };
          }

          case "runCommandBatch": {
            const result = await sshClient.runCommandBatch(
              args.hostAlias,
              args.commands
            );
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
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

    console.log("Starting MCP SSH Agent on STDIO...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("MCP SSH Agent connected and ready!");
    
  } catch (error) {
    console.error("Error starting MCP SSH Agent:", error);
    process.exit(1);
  }
}

// Start the server
main().catch(error => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
