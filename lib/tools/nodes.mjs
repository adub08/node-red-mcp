/**
 * MCP tools for working with Node-RED nodes
 */

import { z } from 'zod';
import { callNodeRed } from '../utils.mjs';
import { registerGuardedTool } from '../permissions/guard.mjs';

/**
 * @param {object} server
 * @param {object} configStore
 */
export default function registerNodeTools(server, configStore) {
  registerGuardedTool(server, 'inject',
    'Manually trigger an inject node by ID, as if its timer/button fired once. Has side effects in the running flow (e.g. may call external services); not idempotent. Blocked in read-only mode.',
    {
    id: z.string().describe('Inject node ID')
  }, async ({ id }, config) => {
    await callNodeRed('post', '/inject/' + id, null, config);
    return { content: [{ type: 'text', text: `Inject node ${id} triggered` }] };
  }, configStore);

  registerGuardedTool(server, 'get-nodes',
    'List all installed Node-RED node modules and their enabled/disabled status. Read-only.',
    {}, async (_args, config) => {
    const nodes = await callNodeRed('get', '/nodes', null, config);
    return { content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'get-node-info',
    'Return details about a specific installed node module by name. Read-only.',
    {
    module: z.string().describe('Node module name, e.g. "node-red-node-email"')
  }, async ({ module }, config) => {
    const info = await callNodeRed('get', '/nodes/' + module, null, config);
    return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'toggle-node-module',
    'Enable or disable an installed node module at runtime. Blocked in read-only mode.',
    {
    module: z.string().describe('Node module name to enable/disable'),
    enabled: z.boolean().describe('true to enable, false to disable')
  }, async ({ module, enabled }, config) => {
    try {
      await callNodeRed('put', '/nodes/' + module, { enabled }, config);
      return {
        content: [{ type: 'text', text: `Module ${module} ${enabled ? 'enabled' : 'disabled'}` }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'find-nodes-by-type',
    'Find all nodes of a given type (e.g. "inject", "function", "http request") across all flows. Read-only.',
    {
    nodeType: z.string().describe('Node type to search for, e.g. "inject" or "function"')
  }, async ({ nodeType }, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    const nodes = flows.filter((node) => node.type === nodeType);
    return {
      content: [{
        type: 'text',
        text: nodes.length > 0
          ? `Found ${nodes.length} nodes of type "${nodeType}":\n\n${JSON.stringify(nodes, null, 2)}`
          : `No nodes of type "${nodeType}" found`
      }]
    };
  }, configStore);

  registerGuardedTool(server, 'search-nodes',
    'Search node names/properties (or one specific property) across all flows for a text match. Read-only.',
    {
    query: z.string().describe('String to search for in node name or properties'),
    property: z.string().optional().describe('Restrict the search to this specific node property (optional; searches all properties if omitted)')
  }, async ({ query, property }, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    const nodes = flows.filter((node) => {
      if (property) {
        return node[property] && String(node[property]).includes(query);
      }
      return JSON.stringify(node).includes(query);
    });
    return {
      content: [{
        type: 'text',
        text: nodes.length > 0
          ? `Found ${nodes.length} nodes matching query "${query}":\n\n${JSON.stringify(nodes, null, 2)}`
          : `No nodes found matching query "${query}"`
      }]
    };
  }, configStore);
}
