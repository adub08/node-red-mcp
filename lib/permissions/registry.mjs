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

/**
 * Per-tool overrides for MCP annotations (hints only — not security-enforcing).
 * destructive: overwrites/deletes existing data irreversibly.
 * idempotent: calling twice with the same args has the same effect as once.
 * @type {Record<string, { destructive?: boolean, idempotent?: boolean }>}
 */
const TOOL_ANNOTATION_OVERRIDES = {
  'update-flows': { destructive: true, idempotent: true },
  'update-flow': { destructive: true, idempotent: true },
  'delete-flow': { destructive: true, idempotent: true },
  'create-flow': { destructive: false, idempotent: false },
  'set-flows-state': { destructive: false, idempotent: true },
  inject: { destructive: false, idempotent: false },
  'toggle-node-module': { destructive: false, idempotent: true }
};

/** @type {Map<string, { group: string, readOnly: boolean, mandatory: boolean, destructive: boolean, idempotent: boolean|undefined }>} */
const TOOL_META = new Map();

for (const [groupId, group] of Object.entries(TOOL_GROUPS)) {
  const readOnly = !groupId.includes(':write');
  for (const name of group.tools) {
    const overrides = TOOL_ANNOTATION_OVERRIDES[name];
    TOOL_META.set(name, {
      group: groupId,
      readOnly,
      mandatory: name === 'nr_get_overview',
      destructive: overrides?.destructive ?? false,
      idempotent: overrides?.idempotent
    });
  }
}

/**
 * @param {string} toolName
 * @returns {{ group: string, readOnly: boolean, mandatory: boolean, destructive: boolean, idempotent: boolean|undefined }|undefined}
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
