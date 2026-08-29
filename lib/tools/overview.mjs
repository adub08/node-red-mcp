/**
 * Overview tool — mandatory, always available.
 */

import { registerGuardedTool, assertToolAllowed } from '../permissions/guard.mjs';
import { allToolNames, getToolMeta } from '../permissions/registry.mjs';
import { publicBaseUrl } from '../public-url.mjs';
import { probeNodeRed } from '../node-red-probe.mjs';

/**
 * @param {object} server
 * @param {object} configStore
 * @param {number} httpPort
 */
export default function registerOverviewTool(server, configStore, httpPort) {
  registerGuardedTool(server, 'nr_get_overview',
    "Return this MCP server's status: Node-RED connectivity, read-only mode, tool counts and permissions, IP allowlist size, and the settings/MCP URLs. Always available regardless of tool permissions.",
    {}, async () => {
    const cfg = configStore.get();
    const probe = await probeNodeRed(configStore.toMcpConfig());

    const tools = allToolNames().map((name) => {
      const meta = getToolMeta(name);
      const allowed = assertToolAllowed(name, cfg);
      return {
        name,
        group: meta?.group,
        readOnly: meta?.readOnly,
        enabled: allowed.allowed,
        mandatory: meta?.mandatory ?? false
      };
    });

    const enabledCount = tools.filter((t) => t.enabled).length;
    const baseUrl = publicBaseUrl(httpPort);

    const overview = {
      serverVersion: '2.0.0',
      nodeRedUrl: cfg.nodeRedUrl,
      nodeRedConnected: probe.ok,
      nodeRedReachable: probe.reachable,
      nodeRedAuthorized: probe.authorized,
      nodeRedStatus: probe.status,
      nodeRedError: probe.error,
      nodeRedLatencyMs: probe.latencyMs,
      readOnlyMode: cfg.readOnlyMode,
      toolCount: tools.length,
      enabledToolCount: enabledCount,
      ipAllowlistCount: cfg.ipAllowlist.length,
      settingsUrl: `${baseUrl}${cfg.secretPath}/settings`,
      mcpUrl: `${baseUrl}${cfg.secretPath}/mcp`,
      settingsUrlHint: 'Open settingsUrl from an allowlisted client using the secret path',
      tools
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(overview, null, 2) }]
    };
  }, configStore);
}
