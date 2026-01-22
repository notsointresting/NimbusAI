#!/usr/bin/env node

/**
 * Nimbus CLI - Command line interface for Nimbus AI Agent
 * Usage: npx nimbus-ai-agent or nimbus (if installed globally)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
☁️  Nimbus - Autonomous AI Agent

Usage:
  nimbus                    Start the desktop app (requires Electron)
  nimbus server             Start only the backend server
  nimbus setup              Interactive setup wizard
  nimbus --help             Show this help message

Getting Started:
  1. Start the antigravity-claude-proxy first
  2. Run 'nimbus server' to start the backend
  3. Run 'nimbus' to start the desktop app (or use the web interface)

For more info: https://github.com/notsointresting/NimbusAI
`);
}

async function runSetup() {
  console.log('☁️  Nimbus Setup Wizard\n');

  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');

  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✓ Created .env file from template');
  }

  console.log(`
Next steps:
  1. Edit .env file with your configuration
  2. Start antigravity-claude-proxy (cd antigravity-claude-proxy && npm start)
  3. Start Nimbus server (nimbus server)
  4. Start Nimbus app (nimbus)

Optional: Install the Chrome extension from chrome-extension/ folder
`);
}

async function startServer() {
  console.log('☁️  Starting Nimbus Backend Server...\n');

  const serverPath = path.join(__dirname, 'server', 'server.js');

  if (!fs.existsSync(serverPath)) {
    console.error('Error: server/server.js not found');
    process.exit(1);
  }

  const server = spawn('node', [serverPath], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  });

  server.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  server.on('close', (code) => {
    process.exit(code || 0);
  });
}

async function startApp() {
  console.log('☁️  Starting Nimbus Desktop App...\n');

  // Check if electron is available
  const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron');

  const electron = spawn(process.platform === 'win32' ? 'npx' : 'npx',
    ['electron', '.'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });

  electron.on('error', (err) => {
    console.error('Failed to start Electron app:', err);
    console.log('\nMake sure Electron is installed: npm install');
    process.exit(1);
  });

  electron.on('close', (code) => {
    process.exit(code || 0);
  });
}

// Main command handler
switch (command) {
  case '--help':
  case '-h':
  case 'help':
    printHelp();
    break;

  case 'server':
    startServer();
    break;

  case 'setup':
    runSetup();
    break;

  default:
    // Default: start the app
    startApp();
}
