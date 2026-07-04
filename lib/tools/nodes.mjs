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
  registerGuardedTool(server, 'inject', {
    id: z.string().describe('Inject node ID')
  }, async ({ id }, config) => {
    await callNodeRed('post', '/inject/' + id, null, config);
    return { content: [{ type: 'text', text: `Inject node ${id} triggered` }] };
  }, configStore);

  registerGuardedTool(server, 'get-nodes', {}, async (_args, config) => {
    const nodes = await callNodeRed('get', '/nodes', null, config);
    return { content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'get-node-info', {
    module: z.string().describe('Node module name')
  }, async ({ module }, config) => {
    const info = await callNodeRed('get', '/nodes/' + module, null, config);
    return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'toggle-node-module', {
    module: z.string().describe('Node module name'),
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

  registerGuardedTool(server, 'find-nodes-by-type', {
    nodeType: z.string().describe('Node type to search for')
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

  registerGuardedTool(server, 'search-nodes', {
    query: z.string().describe('String to search in node name or properties'),
    property: z.string().optional().describe('Specific property to search (optional)')
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
