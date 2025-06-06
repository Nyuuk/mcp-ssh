# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2025-06-06

### Added
- Binary wrapper script (`bin/mcp-ssh.js`) for proper npx compatibility
- Fixed npx execution issues by implementing wrapper pattern

### Fixed
- NPX executable resolution using wrapper script approach
- Package binary configuration now points to proper wrapper

### Technical
- Added `bin/mcp-ssh.js` wrapper to handle npx execution
- Updated package.json bin configuration to use wrapper script

## [1.0.2] - 2025-06-06

### Fixed
- Build script temporary fix
- File permissions for executable

## [1.0.1] - 2025-06-06

### Fixed
- Initial package configuration
- File permissions

## [1.0.0] - 2025-06-06

### Added
- Initial release of MCP SSH Agent
- Support for all SSH operations via native ssh/scp commands
- Automatic SSH host discovery from ~/.ssh/config and ~/.ssh/known_hosts
- Functions: listKnownHosts, runRemoteCommand, getHostInfo, checkConnectivity, uploadFile, downloadFile, runCommandBatch
- Claude Desktop integration support
- NPM package distribution via @aiondadotcom/mcp-ssh
- npx compatibility for easy installation and usage

### Features
- Native SSH command execution for maximum compatibility
- Silent mode for MCP clients (MCP_SILENT=true)
- Comprehensive error handling with timeouts
- Batch command execution support
- File upload/download via scp
- SSH connectivity testing

### Documentation
- Complete README with Claude Desktop setup instructions
- Usage examples and troubleshooting guide
- Professional npm package configuration
