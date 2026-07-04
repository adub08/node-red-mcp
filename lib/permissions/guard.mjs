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
 * Registers a tool with a client-facing description and MCP annotation hints
 * (readOnlyHint/destructiveHint/idempotentHint) derived from the permission
 * registry, so clients can show/reason about what each tool does.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {string} name
 * @param {string} description
 * @param {object|undefined} schema
 * @param {Function} handler
 * @param {object} configStore
 */
export function registerGuardedTool(server, name, description, schema, handler, configStore) {
  const meta = getToolMeta(name);
  const annotations = {
    title: name,
    readOnlyHint: meta?.readOnly ?? false,
    destructiveHint: meta?.destructive ?? false,
    openWorldHint: true,
    ...(meta?.idempotent !== undefined ? { idempotentHint: meta.idempotent } : {})
  };

  server.tool(name, description, schema, annotations, async (args) => {
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