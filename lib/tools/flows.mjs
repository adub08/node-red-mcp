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
  registerGuardedTool(server, 'get-flows', {}, async (_args, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    return { content: [{ type: 'text', text: JSON.stringify(flows, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'update-flows', {
    flowsJson: z.string().describe('Flow configuration in JSON')
  }, async ({ flowsJson }, config) => {
    try {
      const flowsObj = JSON.parse(flowsJson);
      await callNodeRed('post', '/flows', flowsObj, config);
      return { content: [{ type: 'text', text: 'Flows updated' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'get-flow', {
    id: z.string().describe('Flow ID')
  }, async ({ id }, config) => {
    const flow = await callNodeRed('get', '/flow/' + id, null, config);
    return { content: [{ type: 'text', text: JSON.stringify(flow, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'update-flow', {
    id: z.string().describe('Flow ID'),
    flowJson: z.string().describe('Flow configuration in JSON')
  }, async ({ id, flowJson }, config) => {
    try {
      const flowObj = JSON.parse(flowJson);
      await callNodeRed('put', '/flow/' + id, flowObj, config);
      return { content: [{ type: 'text', text: `Flow ${id} updated` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'list-tabs', {}, async (_args, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    const tabs = flows
      .filter((node) => node.type === 'tab')
      .map((node) => `- ${node.label || node.name || 'Unnamed'} (ID: ${node.id})`);
    return { content: [{ type: 'text', text: tabs.join('\n') }] };
  }, configStore);

  registerGuardedTool(server, 'create-flow', {
    flowJson: z.string().describe('New flow configuration in JSON')
  }, async ({ flowJson }, config) => {
    try {
      const flowObj = JSON.parse(flowJson);
      const result = await callNodeRed('post', '/flow', flowObj, config);
      return { content: [{ type: 'text', text: `New flow created with ID: ${result.id}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'delete-flow', {
    id: z.string().describe('Flow ID to delete')
  }, async ({ id }, config) => {
    try {
      await callNodeRed('delete', '/flow/' + id, null, config);
      return { content: [{ type: 'text', text: `Flow ${id} deleted` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'get-flows-state', {}, async (_args, config) => {
    const state = await callNodeRed('get', '/flows/state', null, config);
    return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'set-flows-state', {
    stateJson: z.string().describe('Flows state in JSON')
  }, async ({ stateJson }, config) => {
    try {
      const stateObj = JSON.parse(stateJson);
      await callNodeRed('post', '/flows/state', stateObj, config);
      return { content: [{ type: 'text', text: 'Flows state updated' }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
    }
  }, configStore);

  registerGuardedTool(server, 'get-flows-formatted', {}, async (_args, config) => {
    const flows = await callNodeRed('get', '/flows', null, config);
    const formatted = formatFlowsOutput(flows);
    return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
  }, configStore);

  registerGuardedTool(server, 'visualize-flows', {}, async (_args, config) => {
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
