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
      process.stderr.write(`Error reading SSH config: ${error.message}\n`);
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
          // Safety check for undefined param
          if (!param || !param.param) {
            continue;
          }
          
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
      process.stderr.write(`Error reading known_hosts file: ${error.message}\n`);
      return [];
    }
  }

  async getAllKnownHosts() {
    // First: Get all hosts from ~/.ssh/config (these are prioritized)
    const configHosts = await this.parseConfig();
    
    // Second: Get hostnames from ~/.ssh/known_hosts
    const knownHostnames = await this.parseKnownHosts();

    // Create a comprehensive list starting with config hosts
    const allHosts = [...configHosts];

    // Add hosts from known_hosts that aren't already in the config
    // These will appear after the config hosts
    for (const hostname of knownHostnames) {
      if (!configHosts.some(host => 
          host.hostname === hostname || 
          host.alias === hostname)) {
        allHosts.push({
          hostname: hostname,
          source: 'known_hosts'
        });
      }
    }

    // Mark config hosts for clarity
    configHosts.forEach(host => {
      host.source = 'ssh_config';
    });

    return allHosts;
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
      process.stderr.write(`Error executing command on ${hostAlias}: ${error.message}\n`);
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
      process.stderr.write(`Connectivity error with ${hostAlias}: ${error.message}\n`);
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
      process.stderr.write(`Error uploading file to ${hostAlias}: ${error.message}\n`);
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
      process.stderr.write(`Error downloading file from ${hostAlias}: ${error.message}\n`);
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
      process.stderr.write(`Error during batch execution on ${hostAlias}: ${error.message}\n`);
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

    // Create connection configuration - keep it simple like manual SSH
    const connectionConfig = {
      host: hostInfo.hostname,
      username: hostInfo.user,
      port: hostInfo.port || 22,
      readyTimeout: 20000,
      agent: process.env.SSH_AUTH_SOCK
    };

    // Only add privateKeyPath if explicitly configured in SSH config
    if (hostInfo.identityFile) {
      connectionConfig.privateKeyPath = hostInfo.identityFile;
    }

    process.stderr.write(`Connecting to ${hostAlias} (${hostInfo.hostname}:${hostInfo.port}) as ${hostInfo.user}\n`);

    try {
      await this.ssh.connect(connectionConfig);
      process.stderr.write(`Successfully connected to ${hostAlias}\n`);
    } catch (error) {
      process.stderr.write(`Connection failed: ${error.message}\n`);
      throw new Error(`Connection to ${hostAlias} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Main function to start the MCP server
async function main() {
  try {
    // Create an instance of the SSH client
    process.stderr.write("Initializing SSH client...\n");
    const sshClient = new SSHClient();

    process.stderr.write("Creating MCP server...\n");
    // Create an MCP server
    const server = new Server(
      { name: "mcp-ssh", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    process.stderr.write("Setting up request handlers...\n");
    // Handler for listing available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      process.stderr.write("Received listTools request\n");
      return {
        tools: [
          {
            name: "listKnownHosts",
            description: "Returns a consolidated list of all known SSH hosts, prioritizing ~/.ssh/config entries first, then additional hosts from ~/.ssh/known_hosts",
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
      process.stderr.write(`Received callTool request for tool: ${name}\n`);

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
        process.stderr.write(`Error executing tool ${name}: ${error.message}\n`);
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

    process.stderr.write("Starting MCP SSH Agent on STDIO...\n");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("MCP SSH Agent connected and ready!\n");
    
  } catch (error) {
    process.stderr.write(`Error starting MCP SSH Agent: ${error.message}\n`);
    process.exit(1);
  }
}

// Start the server
main().catch(error => {
  process.stderr.write(`Unhandled error: ${error.message}\n`);
  process.exit(1);
});
