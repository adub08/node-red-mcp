/**
 * MCP tools for working with Node-RED settings
 */

import { callNodeRed, redactSensitive } from '../utils.mjs';
import { registerGuardedTool } from '../permissions/guard.mjs';

/**
 * @param {object} server
 * @param {object} configStore
 */
export default function registerSettingsTools(server, configStore) {
  registerGuardedTool(server, 'get-settings', {}, async (_args, config) => {
    const settings = await callNodeRed('get', '/settings', null, config);
    return {
      content: [{ type: 'text', text: JSON.stringify(redactSensitive(settings), null, 2) }]
    };
  }, configStore);

  registerGuardedTool(server, 'get-diagnostics', {}, async (_args, config) => {
    const diagnostics = await callNodeRed('get', '/diagnostics', null, config);
    return {
      content: [{ type: 'text', text: JSON.stringify(redactSensitive(diagnostics), null, 2) }]
    };
  }, configStore);
}
