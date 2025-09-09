# MCP SSH Agent

A Model Context Protocol (MCP) server for managing and controlling SSH connections. This server integrates seamlessly with Claude Desktop and other MCP-compatible clients to provide AI-powered SSH operations.

## Overview

This MCP server provides SSH operations through a clean, standardized interface that can be used by MCP-compatible language models like Claude Desktop. The server automatically discovers SSH hosts from your `~/.ssh/config` and `~/.ssh/known_hosts` files and executes commands using native SSH tools for maximum reliability.

## Quick Start

### Desktop Extension Installation (Recommended)

The easiest way to install MCP SSH Agent is through the Desktop Extension (.dxt) format:

1. Download the latest `mcp-ssh-*.dxt` file from the [GitHub releases page](https://github.com/aiondadotcom/mcp-ssh/releases)
2. Double-click the `.dxt` file to install it in Claude Desktop
3. The SSH tools will be automatically available in your conversations with Claude

### Alternative Installation Methods

#### Installation via npx

```bash
npx @aiondadotcom/mcp-ssh
```

#### Manual Claude Desktop Configuration

To use this MCP server with Claude Desktop using manual configuration, add the following to your MCP settings file:

**On macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**On Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-ssh": {
      "command": "npx",
      "args": ["@aiondadotcom/mcp-ssh"]
    }
  }
}
```

After adding this configuration, restart Claude Desktop. The SSH tools will be available for use in your conversations with Claude.

#### Global Installation
```bash
npm install -g @aiondadotcom/mcp-ssh
```

#### Local Development
```bash
git clone https://github.com/aiondadotcom/mcp-ssh.git
cd mcp-ssh
npm install
npm start
```

## Example Usage

![MCP SSH Agent Example](doc/example.png)

The screenshot above shows the MCP SSH Agent in action, demonstrating how it integrates with MCP-compatible clients to provide seamless SSH operations.

### Integration with Claude

![Claude MCP Integration](doc/Claude.png)

This screenshot demonstrates the MCP SSH Agent integrated with Claude, showing how the AI assistant can directly manage SSH connections and execute remote commands through the MCP protocol.

## Key Features

- **Reliable SSH**: Uses native `ssh`/`scp` commands instead of JavaScript SSH libraries
- **Automatic Discovery**: Finds hosts from SSH config and known_hosts files
- **Full SSH Support**: Works with SSH agents, keys, and all authentication methods
- **Session Reuse**: Optional connection multiplexing for improved performance
- **File Operations**: Upload and download files using `scp`
- **Batch Commands**: Execute multiple commands in sequence
- **Error Handling**: Comprehensive error reporting with timeouts

## Functions

The agent provides the following MCP tools:

1. **listKnownHosts()** - Lists all known SSH hosts, prioritizing entries from ~/.ssh/config first, then additional hosts from ~/.ssh/known_hosts
2. **runRemoteCommand(hostAlias, command)** - Executes a command on a remote host using `ssh`
3. **getHostInfo(hostAlias)** - Returns detailed configuration for a specific host
4. **checkConnectivity(hostAlias)** - Tests SSH connectivity to a host
5. **uploadFile(hostAlias, localPath, remotePath)** - Uploads a file to the remote host using `scp`
6. **downloadFile(hostAlias, remotePath, localPath)** - Downloads a file from the remote host using `scp`
7. **runCommandBatch(hostAlias, commands)** - Executes multiple commands sequentially

## Configuration Examples

### Claude Desktop Integration

Here's how your Claude Desktop configuration should look:

```json
{
  "mcpServers": {
    "mcp-ssh": {
      "command": "npx",
      "args": ["@aiondadotcom/mcp-ssh"]
    }
  }
}
```

### Manual Server Configuration

If you prefer to run the server manually or integrate it with other MCP clients:

```json
{
  "servers": {
    "mcp-ssh": {
      "command": "npx",
      "args": ["@aiondadotcom/mcp-ssh"]
    }
  }
}
```

## Requirements

- Node.js 18 or higher
- SSH client installed (`ssh` and `scp` commands available)
- SSH configuration files (`~/.ssh/config` and `~/.ssh/known_hosts`)

## Usage with Claude Desktop

Once configured, you can ask Claude to help you with SSH operations like:

- "List all my SSH hosts"
- "Check connectivity to my production server" 
- "Run a command on my web server"
- "Upload this file to my remote server"
- "Download logs from my application server"

Claude will use the MCP SSH tools to perform these operations safely and efficiently.

## Usage

The agent runs as a Model Context Protocol server over STDIO. When installed via npm, you can use it directly:

```bash
# Run via npx (recommended)
npx @aiondadotcom/mcp-ssh

# Or if installed globally
mcp-ssh

# For development - run with debug output
npm start
```

The server communicates via clean JSON over STDIO, making it perfect for MCP clients like Claude Desktop.

## Advanced Configuration

### Environment Variables

- `MCP_SILENT=true` - Disable debug output (automatically set when used as MCP server)
- `SSH_SESSION_REUSE=false` - Disable SSH session reuse (default: enabled)
- `SSH_SESSION_TIMEOUT=300000` - Session timeout in milliseconds (default: 5 minutes)

### SSH Session Reuse

The MCP SSH Agent supports SSH connection multiplexing using OpenSSH's ControlMaster feature, which significantly improves performance for multiple operations to the same host:

#### Benefits:
- **Faster Connections**: Reuse existing SSH connections instead of establishing new ones
- **Reduced Latency**: Eliminates SSH handshake overhead for subsequent commands
- **Better Performance**: Especially beneficial for batch operations and file transfers
- **Resource Efficient**: Fewer concurrent SSH processes and network connections

#### How It Works:
1. First command to a host creates a master SSH connection in the background
2. Subsequent commands reuse the existing connection via a control socket
3. Sessions automatically timeout after 5 minutes of inactivity
4. Graceful fallback to direct connections if session multiplexing fails

#### Configuration:
```bash
# Enable session reuse (default)
export SSH_SESSION_REUSE=true

# Disable session reuse (use new connection for each command)
export SSH_SESSION_REUSE=false

# Set custom session timeout (5 minutes default)
export SSH_SESSION_TIMEOUT=600000  # 10 minutes
```

#### When to Disable:
- **High Security Requirements**: Each connection uses fresh authentication
- **Resource Constraints**: Each session maintains a background SSH process
- **Troubleshooting**: Disable to isolate connection issues
- **Network Instability**: Fresh connections may be more reliable on unstable networks

### SSH Configuration

The agent reads from standard SSH configuration files:
- `~/.ssh/config` - SSH client configuration (supports Include directives)
- `~/.ssh/known_hosts` - Known host keys

Make sure your SSH keys are properly configured and accessible via SSH agent or key files.

#### Include Directive Support

The MCP SSH Agent fully supports SSH `Include` directives to organize your configuration across multiple files. However, there's an important SSH bug to be aware of:

**⚠️ SSH Include Directive Bug Warning**

SSH has a configuration parsing bug where `Include` statements **must be placed at the beginning** of your `~/.ssh/config` file to work correctly. If placed at the end, SSH will read them but won't properly apply the included configurations.

**✅ Correct placement (at the beginning):**
```ssh-config
# ~/.ssh/config
Include ~/.ssh/config.d/*
Include ~/.ssh/work-hosts

# Global settings
ServerAliveInterval 55

# Host definitions
Host myserver
    HostName example.com
```

**❌ Incorrect placement (at the end) - won't work:**
```ssh-config
# ~/.ssh/config
# Global settings
ServerAliveInterval 55

# Host definitions
Host myserver
    HostName example.com

# These Include statements won't work properly due to SSH bug:
Include ~/.ssh/config.d/*
Include ~/.ssh/work-hosts
```

The MCP SSH Agent correctly processes `Include` directives regardless of their placement in the file, so you'll get full host discovery even if SSH itself has issues with your configuration.

#### Example ~/.ssh/config

Here's an example SSH configuration file that demonstrates various connection scenarios including Include directives:

```ssh-config
# Include directives must be at the beginning due to SSH bug
Include ~/.ssh/config.d/*
Include ~/.ssh/work-servers

# Global settings - keep connections alive
ServerAliveInterval 55

# Production server with jump host
Host prod
    Hostname 203.0.113.10
    Port 22022
    User deploy
    IdentityFile ~/.ssh/id_prod_rsa

# Root access to production (separate entry)
Host root@prod
    Hostname 203.0.113.10
    Port 22022
    User root
    IdentityFile ~/.ssh/id_prod_rsa

# Archive server accessed through production jump host
Host archive
    Hostname 2001:db8:1f0:cafe::1
    Port 22077
    User archive-user
    ProxyJump prod

# Web servers with specific configurations
Host web1.example.com
    Hostname 198.51.100.15
    Port 22022
    User root
    IdentityFile ~/.ssh/id_ed25519

Host web2.example.com
    Hostname 198.51.100.25
    Port 22022
    User root
    IdentityFile ~/.ssh/id_ed25519

# Database server with custom key
Host database
    Hostname 203.0.113.50
    Port 22077
    User dbadmin
    IdentityFile ~/.ssh/id_database_rsa
    IdentitiesOnly yes

# Mail servers
Host mail1
    Hostname 198.51.100.88
    Port 22078
    User mailuser

Host root@mail1
    Hostname 198.51.100.88
    Port 22078
    User root

# Monitoring server
Host monitor
    Hostname 203.0.113.100
    Port 22077
    User monitoring
    IdentityFile ~/.ssh/id_monitor_ed25519
    IdentitiesOnly yes

# Load balancers
Host lb-a
    Hostname 198.51.100.200
    Port 22077
    User root

Host lb-b
    Hostname 198.51.100.201
    Port 22077
    User root
```

This configuration demonstrates:
- **Global settings**: `ServerAliveInterval` to keep connections alive
- **Custom ports**: Non-standard SSH ports for security
- **Multiple users**: Different user accounts for the same host (e.g., `prod` and `root@prod`)
- **Jump hosts**: Using `ProxyJump` to access servers through bastion hosts
- **IPv6 addresses**: Modern networking support
- **Identity files**: Specific SSH keys for different servers
- **Security options**: `IdentitiesOnly yes` to use only specified keys

#### How MCP SSH Agent Uses Your Configuration

The MCP SSH agent automatically discovers and uses your SSH configuration:

1. **Host Discovery**: All hosts from `~/.ssh/config` are automatically available
2. **Native SSH**: Uses your system's `ssh` command, so all config options work
3. **Authentication**: Respects your SSH agent, key files, and authentication settings
4. **Jump Hosts**: Supports complex proxy chains and bastion host setups
5. **Port Forwarding**: Can work with custom ports and connection options

**Example Usage with Claude Desktop:**
- "List my SSH hosts" → Shows all configured hosts including `prod`, `archive`, `web1.example.com`, etc.
- "Connect to archive server" → Uses the ProxyJump configuration automatically
- "Run 'df -h' on web1.example.com" → Connects with the correct user, port, and key
- "Upload file to database server" → Uses the specific identity file and port configuration

## Troubleshooting

### Common Issues

1. **Command not found**: Ensure `ssh` and `scp` are installed and in your PATH
2. **Permission denied**: Check SSH key permissions and SSH agent
3. **Host not found**: Verify host exists in `~/.ssh/config` or `~/.ssh/known_hosts`
4. **Connection timeout**: Check network connectivity and firewall settings

### Debug Mode

Run with debug output to see detailed operation logs:

```bash
# Enable debug mode
MCP_SILENT=false npx @aiondadotcom/mcp-ssh
```

## SSH Key Setup Guide

For the MCP SSH Agent to work properly, you need to set up SSH key authentication. Here's a complete guide:

### 1. Creating SSH Keys

Generate a new SSH key pair (use Ed25519 for better security):

```bash
# Generate Ed25519 key (recommended)
ssh-keygen -t ed25519 -C "your-email@example.com"

# Or generate RSA key (if Ed25519 is not supported)
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
```

**Important**: When prompted for a passphrase, **leave it empty** (press Enter). The MCP SSH Agent cannot handle password-protected keys as it runs non-interactively.

```
Enter passphrase (empty for no passphrase): [Press Enter]
Enter same passphrase again: [Press Enter]
```

This creates two files:
- `~/.ssh/id_ed25519` (private key) - Keep this secret!
- `~/.ssh/id_ed25519.pub` (public key) - This gets copied to servers

### 2. Installing Public Key on Remote Servers

Copy your public key to the remote server's authorized_keys file:

```bash
# Method 1: Using ssh-copy-id (easiest)
ssh-copy-id user@hostname

# Method 2: Manual copy
cat ~/.ssh/id_ed25519.pub | ssh user@hostname "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"

# Method 3: Copy and paste manually
cat ~/.ssh/id_ed25519.pub
# Then SSH to the server and paste into ~/.ssh/authorized_keys
```

### 3. Server-Side SSH Configuration

To enable secure key-only authentication on your SSH servers, edit `/etc/ssh/sshd_config`:

```bash
# Edit SSH daemon configuration
sudo nano /etc/ssh/sshd_config
```

Add or modify these settings:

```ssh-config
# Enable public key authentication
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys

# Disable password authentication (security best practice)
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no

# Root login options (choose one):
# Option 1: Allow root login with SSH keys only (recommended for admin access)
PermitRootLogin prohibit-password

# Option 2: Completely disable root login (most secure, but less flexible)
# PermitRootLogin no

# Optional: Restrict SSH to specific users
AllowUsers deploy root admin

# Optional: Change default port for security
Port 22022
```

After editing, restart the SSH service:

```bash
# On Ubuntu/Debian
sudo systemctl restart ssh

# On CentOS/RHEL/Fedora
sudo systemctl restart sshd

# On macOS
sudo launchctl unload /System/Library/LaunchDaemons/ssh.plist
sudo launchctl load /System/Library/LaunchDaemons/ssh.plist
```

### 4. Setting Correct Permissions

SSH is very strict about file permissions. Set them correctly:

**On your local machine:**
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
chmod 644 ~/.ssh/config
chmod 644 ~/.ssh/known_hosts
```

**On the remote server:**
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 5. Testing SSH Key Authentication

Test your connection before using with MCP SSH Agent:

```bash
# Test connection
ssh -i ~/.ssh/id_ed25519 user@hostname

# Test with verbose output for debugging
ssh -v -i ~/.ssh/id_ed25519 user@hostname

# Test specific configuration
ssh -F ~/.ssh/config hostname
```

### 6. Multiple Keys for Different Servers

You can create different keys for different servers:

```bash
# Create specific keys
ssh-keygen -t ed25519 -f ~/.ssh/id_production -C "production-server"
ssh-keygen -t ed25519 -f ~/.ssh/id_staging -C "staging-server"
```

Then configure them in `~/.ssh/config`:

```ssh-config
Host production
    Hostname prod.example.com
    User deploy
    IdentityFile ~/.ssh/id_production
    IdentitiesOnly yes

Host staging
    Hostname staging.example.com
    User deploy
    IdentityFile ~/.ssh/id_staging
    IdentitiesOnly yes
```

## Security Best Practices

### SSH Key Security
- **Never use password-protected keys** with MCP SSH Agent
- **Never share private keys** - they should stay on your machine only
- **Use Ed25519 keys** when possible (more secure than RSA)
- **Create separate keys** for different environments/purposes
- **Regularly rotate keys** (every 6-12 months)

### Server Security
- **Disable password authentication** completely
- **Use non-standard SSH ports** to reduce automated attacks
- **Limit SSH access** to specific users with `AllowUsers`
- **Choose appropriate root login policy**:
  - `PermitRootLogin prohibit-password` - Allows root access with SSH keys only (recommended for admin tasks)
  - `PermitRootLogin no` - Completely disables root login (most secure, but requires sudo access)
- **Enable SSH key-only authentication** for all accounts
- **Consider using jump hosts** for additional security layers

### Network Security
- **Use VPN or bastion hosts** for production servers
- **Implement fail2ban** to block brute force attempts
- **Monitor SSH logs** regularly
- **Use SSH key forwarding carefully** (disable when not needed)

## Building Desktop Extensions

For developers who want to build DXT packages locally:

### Prerequisites

- Node.js 18 or higher
- npm

### Building DXT Package

```bash
# Install dependencies
npm install

# Build the DXT package
npm run build:dxt
```

This creates a `.dxt` file in the `build/` directory that can be installed in Claude Desktop.

### Publishing DXT Releases

To publish a new DXT release:

```bash
# Build the DXT package
npm run build:dxt

# Create a GitHub release with the DXT file
gh release create v1.0.3 build/mcp-ssh-1.0.3.dxt --title "Release v1.0.3" --notes "MCP SSH Agent v1.0.3"
```

The DXT file will be available as a release asset for users to download and install.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details.

## Project Structure

```
mcp-ssh/
├── server-simple.mjs          # Main MCP server implementation
├── manifest.json              # DXT package manifest
├── package.json               # Dependencies and scripts
├── README.md                  # Documentation
├── LICENSE                    # MIT License
├── CHANGELOG.md               # Release history
├── PUBLISHING.md              # Publishing instructions
├── start.sh                   # Development startup script
├── start-silent.sh            # Silent startup script
├── scripts/
│   └── build-dxt.sh           # DXT package build script
├── doc/
│   ├── example.png            # Usage example screenshot
│   └── Claude.png             # Claude Desktop integration example
├── src/                       # TypeScript source files (development)
│   ├── ssh-client.ts          # SSH operations implementation
│   ├── ssh-config-parser.ts   # SSH configuration parsing
│   └── types.ts               # Type definitions
└── tsconfig.json              # TypeScript configuration
```

## About

This project is maintained by [aionda.com](https://aionda.com) and provides a reliable bridge between AI assistants and SSH infrastructure through the Model Context Protocol.
