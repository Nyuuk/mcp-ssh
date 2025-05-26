// Types for SSH Host information
export interface SSHHostInfo {
  hostname: string;
  alias?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  [key: string]: any; // For other configuration options
}

// Result of a remote command
export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

// SSH connection status
export interface ConnectionStatus {
  connected: boolean;
  message: string;
}

// Batch result of remote commands
export interface BatchCommandResult {
  results: CommandResult[];
  success: boolean;
}
