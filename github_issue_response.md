Thank you for reporting this issue! You're absolutely right that the MCP SSH Agent doesn't support `Include` directives, and we'll implement this feature.

**Implementation Plan:**
We'll add proper `Include` directive support to ensure complete host discovery from all SSH configuration files.

**Important SSH Configuration Note:**
During our investigation, we discovered that SSH itself has a bug with `Include` directive processing. The `Include` statements **must be placed at the beginning** of your `~/.ssh/config` file to work correctly. 

**Example of correct placement:**
```
# ~/.ssh/config
Include ~/.ssh/config.d/*
Include ~/.ssh/work-hosts

# Global settings
ServerAliveInterval 55

# Host definitions
Host myserver
    HostName example.com
```

**Why this matters:**
If `Include` statements are placed at the end of the config file, SSH reads them but doesn't properly apply the included host configurations. This is a bug in OpenSSH's configuration parser.

**Our solution:**
1. We'll implement `Include` support in the MCP SSH Agent to read all configuration files
2. We'll document this SSH quirk in our README to help users avoid configuration issues
3. The agent will work correctly regardless of where users place their `Include` statements

We'll have this feature implemented soon. Thanks for bringing this to our attention!