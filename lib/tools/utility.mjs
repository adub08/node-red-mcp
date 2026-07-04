/**
 * MCP Utility Tools for Node-RED
 */

import { registerGuardedTool } from '../permissions/guard.mjs';

/**
 * @param {object} server
 * @param {object} configStore
 */
export default function registerUtilityTools(server, configStore) {
  registerGuardedTool(server, 'api-help', {}, async () => {
    const endpoints = [
      { method: 'GET', path: '/flows', description: 'Get all flows' },
      { method: 'POST', path: '/flows', description: 'Update all flows' },
      { method: 'GET', path: '/flow/:id', description: 'Get a specific flow' },
      { method: 'PUT', path: '/flow/:id', description: 'Update a specific flow' },
      { method: 'DELETE', path: '/flow/:id', description: 'Delete a specific flow' },
      { method: 'POST', path: '/flow', description: 'Create a new flow' },
      { method: 'GET', path: '/flows/state', description: 'Get the state of flows' },
      { method: 'POST', path: '/flows/state', description: 'Set the state of flows' },
      { method: 'GET', path: '/nodes', description: 'Get list of installed nodes' },
      { method: 'GET', path: '/settings', description: 'Get runtime settings' },
      { method: 'GET', path: '/diagnostics', description: 'Get diagnostics information' },
      { method: 'POST', path: '/inject/:id', description: 'Trigger an inject node' }
    ];

    const implementedMethods = {
      'GET /flows': true,
      'POST /flows': true,
      'GET /flow/:id': true,
      'PUT /flow/:id': true,
      'POST /inject/:id': true,
      'POST /flow': true,
      'DELETE /flow/:id': true,
      'GET /flows/state': true,
      'POST /flows/state': true,
      'GET /nodes': true,
      'GET /settings': true,
      'GET /diagnostics': true
    };

    const output = [
      '# Node-RED API Help',
      '',
      '| Method | Path | Description | Implemented in MCP |',
      '|--------|------|-------------|---------------------|'
    ];

    endpoints.forEach((endpoint) => {
      const key = `${endpoint.method} ${endpoint.path}`;
      output.push(
        `| ${endpoint.method} | ${endpoint.path} | ${endpoint.description} | ${implementedMethods[key] ? '✅' : '❌'} |`
      );
    });

    return { content: [{ type: 'text', text: output.join('\n') }] };
  }, configStore);
}
