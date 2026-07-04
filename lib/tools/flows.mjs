/**
 * MCP tools for working with Node-RED flows
 */

import { z } from 'zod';
import { callNodeRed, formatFlowsOutput } from '../utils.mjs';
import { registerGuardedTool } from '../permissions/guard.mjs';

/**
 * @param {object} server
 * @param {object} configStore
 */
export default function registerFlowTools(server, configStore) {
  registerGuardedTool(server, 'get-flows',
    'Return the full Node-RED flow configuration (all tabs, nodes, and wiring) as JSON. Read-only.',
    {}, async (_args, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    return { content: [{ type: 'text', text: JSON.stringify(flows, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'update-flows',
    'Replace the ENTIRE Node-RED flow configuration with the given JSON. Destructive: overwrites all existing flows, tabs, and nodes. Blocked in read-only mode.',
    {
    flowsJson: z.string().describe('Full flows array, as JSON (same shape returned by get-flows)')
  }, async ({ flowsJson }, config) => {
    try {
      const flowsObj = JSON.parse(flowsJson);
      await callNodeRed('post', '/flows', flowsObj, config);
      return { content: [{ type: 'text', text: 'Flows updated' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'get-flow',
    'Return a single flow (tab) by ID as JSON, including its nodes. Read-only.',
    {
    id: z.string().describe('Flow (tab) ID — see list-tabs to find IDs')
  }, async ({ id }, config) => {
    const flow = await callNodeRed('get', '/flow/' + id, null, config);
    return { content: [{ type: 'text', text: JSON.stringify(flow, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'update-flow',
    'Replace a single flow (tab) with the given JSON. Destructive: overwrites all nodes in that tab. Blocked in read-only mode.',
    {
    id: z.string().describe('Flow (tab) ID to replace'),
    flowJson: z.string().describe('New flow configuration for this tab, as JSON')
  }, async ({ id, flowJson }, config) => {
    try {
      const flowObj = JSON.parse(flowJson);
      await callNodeRed('put', '/flow/' + id, flowObj, config);
      return { content: [{ type: 'text', text: `Flow ${id} updated` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'list-tabs',
    'List all flow tabs (name and ID) without node detail. Use this to discover flow IDs before calling get-flow or update-flow. Read-only.',
    {}, async (_args, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    const tabs = flows
      .filter((node) => node.type === 'tab')
      .map((node) => `- ${node.label || node.name || 'Unnamed'} (ID: ${node.id})`);
    return { content: [{ type: 'text', text: tabs.join('\n') }] };
  }, configStore);

  registerGuardedTool(server, 'create-flow',
    'Create a new flow (tab) from the given JSON. Additive — does not affect existing flows. Blocked in read-only mode.',
    {
    flowJson: z.string().describe('New flow (tab) configuration, as JSON')
  }, async ({ flowJson }, config) => {
    try {
      const flowObj = JSON.parse(flowJson);
      const result = await callNodeRed('post', '/flow', flowObj, config);
      return { content: [{ type: 'text', text: `New flow created with ID: ${result.id}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'delete-flow',
    'Permanently delete a flow (tab) and all its nodes by ID. Destructive and irreversible. Blocked in read-only mode.',
    {
    id: z.string().describe('Flow (tab) ID to delete')
  }, async ({ id }, config) => {
    try {
      await callNodeRed('delete', '/flow/' + id, null, config);
      return { content: [{ type: 'text', text: `Flow ${id} deleted` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'get-flows-state',
    'Return whether flows are currently started or stopped. Read-only.',
    {}, async (_args, config) => {
    const state = await callNodeRed('get', '/flows/state', null, config);
    return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'set-flows-state',
    'Start or stop all flows at runtime (does not change flow configuration). Blocked in read-only mode.',
    {
    stateJson: z.string().describe('State object as JSON, e.g. {"state":"start"} or {"state":"stop"}')
  }, async ({ stateJson }, config) => {
    try {
      const stateObj = JSON.parse(stateJson);
      await callNodeRed('post', '/flows/state', stateObj, config);
      return { content: [{ type: 'text', text: 'Flows state updated' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'get-flows-formatted',
    'Return a condensed, more readable summary of all flows (fewer internal fields than get-flows). Read-only.',
    {}, async (_args, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    const formatted = formatFlowsOutput(flows);
    return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'visualize-flows',
    'Return a Markdown summary of flow tabs and node type counts, for quickly understanding flow structure without reading full JSON. Read-only.',
    {}, async (_args, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    const tabs = flows.filter((node) => node.type === 'tab');
    const nodesByTab = {};
    tabs.forEach((tab) => {
      nodesByTab[tab.id] = flows.filter((node) => node.z === tab.id);
    });

    const result = tabs.map((tab) => {
      const nodes = nodesByTab[tab.id];
      const nodeTypes = {};
      nodes.forEach((node) => {
        if (!nodeTypes[node.type]) nodeTypes[node.type] = 0;
        nodeTypes[node.type]++;
      });
      return {
        id: tab.id,
        name: tab.label || tab.name || 'Unnamed',
        nodes: nodes.length,
        nodeTypes: Object.entries(nodeTypes)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ')
      };
    });

    const output = ['# Node-RED Flow Structure', '', '## Tabs', ''];
    result.forEach((tab) => {
      output.push(`### ${tab.name} (ID: ${tab.id})`);
      output.push(`- Number of nodes: ${tab.nodes}`);
      output.push(`- Node types: ${tab.nodeTypes}`);
      output.push('');
    });

    return { content: [{ type: 'text', text: output.join('\n') }] };
  }, configStore);
}
