# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-01-XX

### Added
- **NEW FEATURE**: SSH session reuse with connection multiplexing
- Implemented SSH ControlMaster support for improved performance
- Added session timeout management (default: 5 minutes)
- Graceful fallback to direct connections when session reuse fails
- New environment variables: `SSH_SESSION_REUSE`, `SSH_SESSION_TIMEOUT`

### Enhanced
- Improved performance for multiple operations to the same host
- Reduced connection latency through session multiplexing
- Better resource management with automatic session cleanup
- Enhanced error handling with session-aware fallback mechanisms

### Configuration
- Session reuse enabled by default for better performance
- Configurable session timeout via environment variable
- Optional session reuse disable for high-security scenarios

## [1.1.0] - 2025-08-17

### Added
- **NEW FEATURE**: SSH config Include directive support
- Added recursive processing of Include directives in SSH configuration files
- Support for glob patterns in Include paths (e.g., `Include ~/.ssh/configs/*`)
- Enhanced SSH host discovery from included configuration files
- Added `glob` dependency for Include path pattern matching

### Enhanced
- Improved SSH configuration parsing to handle complex Include hierarchies
- Enhanced host discovery to recursively process all included config files
- Better error handling for malformed or inaccessible Include files

## [1.0.4] - 2025-08-17

### Security
- **SECURITY FIX**: Fixed command injection vulnerability in SSH operations (commit 5b9b9c5)
- **SECURITY FIX**: Upgraded `tmp` dependency to version 0.2.5 to address CVE vulnerability
- Fixed arbitrary temporary file/directory write via symbolic link in `tmp` package (GHSA-52f5-9888-hmc6)
- Added dependency overrides to ensure all transitive dependencies use secure `tmp` version
- Enhanced input validation and sanitization for SSH commands and file paths

### Technical
- Added `tmp: ">=0.2.4"` to devDependencies to force secure version
- Added npm overrides configuration to enforce secure tmp version across entire dependency tree
- Updated package-lock.json to reflect security fixes

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
