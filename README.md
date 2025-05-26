# MCP SSH Agent

A Model Context Protocol (MCP) agent for managing and controlling SSH connections via STDIO interface.

## Overview

This MCP server provides SSH operations through a clean, standardized interface that can be used by MCP-compatible language models. The server automatically discovers SSH hosts from your `~/.ssh/config` and `~/.ssh/known_hosts` files.

## Functions

The agent provides the following MCP tools:

1. **listKnownHosts()** - Lists all known SSH hosts, prioritizing entries from ~/.ssh/config first, then additional hosts from ~/.ssh/known_hosts
2. **runRemoteCommand(hostAlias, command)** - Executes a command on a remote host
3. **getHostInfo(hostAlias)** - Returns detailed configuration for a specific host
4. **checkConnectivity(hostAlias)** - Tests SSH connectivity to a host
5. **uploadFile(hostAlias, localPath, remotePath)** - Uploads a file to the remote host
6. **downloadFile(hostAlias, remotePath, localPath)** - Downloads a file from the remote host
7. **runCommandBatch(hostAlias, commands)** - Executes multiple commands sequentially

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd mcp-ssh

# Install dependencies
npm install
```

## Usage

The agent runs as a Model Context Protocol server over STDIO:

```bash
# Start the MCP SSH agent
npm start

# Or use the provided startup script
./start.sh
```

The server will output initialization messages and then wait for MCP requests over STDIO.

## Integration with MCP Clients

To use this agent with an MCP-compatible client:

```json
{
  "mcpServers": {
    "ssh": {
      "command": "./start.sh",
      "cwd": "/path/to/mcp-ssh"
    }
  }
}
```

**Alternative (more verbose) configuration:**
```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["server-simple.mjs"],
      "cwd": "/path/to/mcp-ssh"
    }
  }
}
```

## Project Structure

```
mcp-ssh/
├── server-simple.mjs          # Main MCP server implementation
├── package.json               # Dependencies and scripts
├── start.sh                   # Startup script (./start.sh)
├── src/
│   ├── ssh-client.ts          # SSH operations implementation
│   ├── ssh-config-parser.ts   # SSH configuration parsing
│   ├── types.ts               # TypeScript type definitions
│   └── index.ts               # (Empty - using server-simple.mjs)
├── README.md                  # This file
└── IMPLEMENTATION_NOTES.md    # Technical implementation details
```

## Requirements

- Node.js 18 or higher
- Existing SSH configuration with key-based authentication
- SSH keys must be properly configured (no interactive password prompts)

## Security Notes

- Uses existing SSH keys and configurations
- Does not store or handle passwords
- Requires pre-configured SSH key authentication
- All operations use your existing SSH setup

## Troubleshooting

1. **Server won't start**: Check that all dependencies are installed with `npm install`
2. **SSH operations fail**: Verify your SSH configuration works with standard `ssh` commands
3. **Host not found**: Ensure hosts are properly configured in `~/.ssh/config`

## Development

The server is implemented in JavaScript using the `@modelcontextprotocol/sdk` for MCP compliance and `node-ssh` for SSH operations.
