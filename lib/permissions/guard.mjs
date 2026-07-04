/**
 * Permission checks for MCP tools.
 */

import { getToolMeta } from './registry.mjs';

/**
 * @param {string} toolName
 * @param {object} config
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function assertToolAllowed(toolName, config) {
  const meta = getToolMeta(toolName);
  if (!meta) {
    return { allowed: false, reason: `Unknown tool: ${toolName}` };
  }
  if (meta.mandatory) {
    return { allowed: true };
  }
  const disabled = new Set(config.disabledTools || []);
  if (disabled.has(toolName)) {
    return { allowed: false, reason: `Tool "${toolName}" is disabled` };
  }
  if (config.readOnlyMode && !meta.readOnly) {
    return { allowed: false, reason: `Tool "${toolName}" is blocked while read-only mode is enabled` };
  }
  return { allowed: true };
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {string} name
 * @param {object|undefined} schema
 * @param {Function} handler
 * @param {object} configStore
 */
export function registerGuardedTool(server, name, schema, handler, configStore) {
  server.tool(name, schema, async (args) => {
    const runtime = configStore.get();
    const check = assertToolAllowed(name, runtime);
    if (!check.allowed) {
      return {
        content: [{ type: 'text', text: `Permission denied: ${check.reason}` }],
        isError: true
      };
    }
    const mcpConfig = configStore.toMcpConfig();
    return handler(args ?? {}, mcpConfig);
  });
}