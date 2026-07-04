/**
 * Tool metadata: groups, read-only hints, mandatory tools.
 */

export const TOOL_GROUPS = {
  'flows:read': {
    label: 'Flows (read)',
    risk: 'low',
    tools: ['get-flows', 'get-flow', 'list-tabs', 'get-flows-formatted', 'visualize-flows', 'get-flows-state']
  },
  'flows:write': {
    label: 'Flows (write)',
    risk: 'high',
    tools: ['update-flows', 'update-flow', 'create-flow', 'delete-flow', 'set-flows-state']
  },
  'nodes:read': {
    label: 'Nodes (read)',
    risk: 'low',
    tools: ['get-nodes', 'get-node-info', 'find-nodes-by-type', 'search-nodes']
  },
  'nodes:write': {
    label: 'Nodes (write)',
    risk: 'high',
    tools: ['inject', 'toggle-node-module']
  },
  'runtime:read': {
    label: 'Runtime (read)',
    risk: 'medium',
    tools: ['get-settings', 'get-diagnostics']
  },
  meta: {
    label: 'Meta',
    risk: 'none',
    tools: ['api-help', 'nr_get_overview']
  }
};

/** @type {Map<string, { group: string, readOnly: boolean, mandatory: boolean }>} */
const TOOL_META = new Map();

for (const [groupId, group] of Object.entries(TOOL_GROUPS)) {
  const readOnly = !groupId.includes(':write');
  for (const name of group.tools) {
    TOOL_META.set(name, {
      group: groupId,
      readOnly,
      mandatory: name === 'nr_get_overview'
    });
  }
}

/**
 * @param {string} toolName
 * @returns {{ group: string, readOnly: boolean, mandatory: boolean }|undefined}
 */
export function getToolMeta(toolName) {
  return TOOL_META.get(toolName);
}

/**
 * @returns {string[]}
 */
export function allToolNames() {
  return [...TOOL_META.keys()];
}

/**
 * @returns {object[]}
 */
export function listToolsForUi() {
  return allToolNames().map((name) => {
    const meta = TOOL_META.get(name);
    return {
      name,
      group: meta.group,
      readOnly: meta.readOnly,
      mandatory: meta.mandatory,
      groupLabel: TOOL_GROUPS[meta.group]?.label ?? meta.group
    };
  });
}
