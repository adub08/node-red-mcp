#!/usr/bin/env node

/**
 * Command-line interface for Node-RED MCP server
 */

import { createServer } from '../lib/server.mjs';

const options = {
  verbose: false
};

if (process.env.MCP_TRANSPORT === 'http' || process.env.MCP_HTTP_PORT) {
  options.transportType = 'http';
}
if (process.env.MCP_HTTP_PORT) {
  options.httpPort = parseInt(process.env.MCP_HTTP_PORT, 10);
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--http') {
    options.transportType = 'http';
    const next = args[i + 1];
    if (next && /^\d+$/.test(next)) {
      options.httpPort = parseInt(next, 10);
      i++;
    }
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true;
  }
}

async function run() {
  try {
    const server = createServer(options);
    if (options.verbose) {
      server.configStore.update({ verbose: true });
    }
    await server.start();
  } catch {
    process.exit(1);
  }
}

run();
