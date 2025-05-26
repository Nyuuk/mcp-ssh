#!/bin/bash

# Change to the directory where this script is located
cd "$(dirname "$0")"

# MCP SSH Agent Startup Script
# This script starts the MCP SSH server using npm

echo "Starting MCP SSH Agent..."
npm start
