/**
 * Settings UI HTTP handlers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { TOOL_GROUPS, listToolsForUi } from '../permissions/registry.mjs';
import { getToolMeta } from '../permissions/registry.mjs';
import { publicBaseUrl } from '../public-url.mjs';
import { normalizeCidrEntry, normalizeClientIp } from '../middleware/ip-allowlist.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, 'static');

function readStatic(name) {
  return fs.readFileSync(path.join(STATIC_DIR, name), 'utf8');
}

/**
 * @param {object} configStore
 * @param {number} httpPort
 */
export function buildSettingsHandlers(configStore, httpPort) {
  const cfg = () => configStore.get();

  async function testNodeRedConnection() {
    const c = configStore.toMcpConfig();
    try {
      const headers = c.nodeRedToken ? { Authorization: 'Bearer ' + c.nodeRedToken } : {};
      await axios.get(c.nodeRedUrl, { headers, timeout: 5000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return {
    settingsPage(_req, res) {
      const html = readStatic('settings.html');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    },

    async getInfo(_req, res) {
      const c = cfg();
      const conn = await testNodeRedConnection();
      const base = publicBaseUrl(httpPort);
      res.json({
        serverVersion: '2.0.0',
        secretPath: c.secretPath,
        settingsUrl: `${base}${c.secretPath}/settings`,
        mcpUrl: `${base}${c.secretPath}/mcp`,
        readOnlyMode: c.readOnlyMode,
        verbose: c.verbose,
        nodeRedUrl: c.nodeRedUrl,
        nodeRedTokenSet: Boolean(c.nodeRedToken),
        nodeRedConnected: conn.ok,
        nodeRedError: conn.error ?? null,
        ipAllowlist: c.ipAllowlist,
        cfAccessConfigured: Boolean(
          process.env.CF_ACCESS_TEAM_DOMAIN && process.env.CF_ACCESS_AUD
        ),
        toolGroups: TOOL_GROUPS
      });
    },

    getConnection(_req, res) {
      const c = cfg();
      res.json({
        nodeRedUrl: c.nodeRedUrl,
        nodeRedTokenSet: Boolean(c.nodeRedToken)
      });
    },

    async postConnection(req, res) {
      const body = req.body || {};
      const patch = {};
      if (typeof body.nodeRedUrl === 'string' && body.nodeRedUrl.trim()) {
        patch.nodeRedUrl = body.nodeRedUrl.trim();
      }
      if (typeof body.nodeRedToken === 'string' && body.nodeRedToken.trim()) {
        patch.nodeRedToken = body.nodeRedToken.trim();
      }
      configStore.update(patch);
      const conn = await testNodeRedConnection();
      res.json({ ok: true, nodeRedConnected: conn.ok, nodeRedError: conn.error ?? null });
    },

    getTools(_req, res) {
      const c = cfg();
      const disabled = new Set(c.disabledTools || []);
      res.json({
        readOnlyMode: c.readOnlyMode,
        tools: listToolsForUi().map((t) => ({
          ...t,
          disabled: disabled.has(t.name)
        })),
        groups: TOOL_GROUPS
      });
    },

    postTools(req, res) {
      const body = req.body || {};
      const patch = {};

      if (typeof body.readOnlyMode === 'boolean') {
        patch.readOnlyMode = body.readOnlyMode;
      }

      if (Array.isArray(body.disabledTools)) {
        const mandatory = new Set(
          listToolsForUi().filter((t) => t.mandatory).map((t) => t.name)
        );
        patch.disabledTools = body.disabledTools.filter(
          (name) => typeof name === 'string' && !mandatory.has(name) && getToolMeta(name)
        );
      }

      if (typeof body.groupEnabled === 'object' && body.groupEnabled !== null) {
        const disabled = new Set(cfg().disabledTools || []);
        for (const [groupId, enabled] of Object.entries(body.groupEnabled)) {
          const group = TOOL_GROUPS[groupId];
          if (!group) continue;
          for (const toolName of group.tools) {
            const meta = getToolMeta(toolName);
            if (meta?.mandatory) continue;
            if (enabled) {
              disabled.delete(toolName);
            } else {
              disabled.add(toolName);
            }
          }
        }
        patch.disabledTools = [...disabled];
      }

      configStore.update(patch);
      res.json({ ok: true, config: configStore.get() });
    },

    getSecurity(req, res) {
      const c = cfg();
      res.json({
        ipAllowlist: c.ipAllowlist,
        secretPath: c.secretPath,
        clientIp: normalizeClientIp(req.socket?.remoteAddress),
        cfAccessTeamDomain: process.env.CF_ACCESS_TEAM_DOMAIN || '',
        cfAccessAudSet: Boolean(process.env.CF_ACCESS_AUD)
      });
    },

    postSecurity(req, res) {
      const body = req.body || {};
      if (Array.isArray(body.ipAllowlist)) {
        const cleaned = body.ipAllowlist
          .filter((e) => typeof e === 'string' && e.trim())
          .map((e) => normalizeCidrEntry(e));
        if (cleaned.length === 0) {
          res.status(400).json({ error: 'ipAllowlist must not be empty' });
          return;
        }
        configStore.update({ ipAllowlist: cleaned });
      }
      res.json({
        ok: true,
        ipAllowlist: cfg().ipAllowlist,
        clientIp: normalizeClientIp(req.socket?.remoteAddress)
      });
    },

    postRegenerateSecret(_req, res) {
      const updated = configStore.regenerateSecretPath();
      const base = publicBaseUrl(httpPort);
      res.json({
        ok: true,
        secretPath: updated.secretPath,
        settingsUrl: `${base}${updated.secretPath}/settings`,
        mcpUrl: `${base}${updated.secretPath}/mcp`
      });
    },

    getAdvanced(_req, res) {
      res.json({ verbose: cfg().verbose });
    },

    postAdvanced(req, res) {
      const body = req.body || {};
      if (typeof body.verbose === 'boolean') {
        configStore.update({ verbose: body.verbose });
      }
      res.json({ ok: true, verbose: cfg().verbose });
    },

    settingsCss(_req, res) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.send(readStatic('settings.css'));
    },

    settingsJs(_req, res) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.send(readStatic('settings.js'));
    }
  };
}
