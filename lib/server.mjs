/**
 * MCP server for Node-RED with admin UI, permissions, and IP allowlisting.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import express from 'express';
import 'dotenv/config';

import { createConfigStore } from './config/store.mjs';
import { createIpAllowlistMiddleware, normalizeClientIp } from './middleware/ip-allowlist.mjs';
import { createOriginGuard } from './middleware/origin-guard.mjs';
import { createAccessJwtMiddleware } from './access-jwt.mjs';
import { createSettingsRouter } from './settings-ui/routes.mjs';
import { publicBaseUrl } from './public-url.mjs';
import { logError, logSecurity } from './log.mjs';
import { probeNodeRed } from './node-red-probe.mjs';

import registerFlowTools from './tools/flows.mjs';
import registerNodeTools from './tools/nodes.mjs';
import registerSettingsTools from './tools/settings.mjs';
import registerUtilityTools from './tools/utility.mjs';
import registerOverviewTool from './tools/overview.mjs';

const MCP_SUFFIX = '/mcp';

/**
 * @param {object} configStore
 * @param {number} httpPort
 * @returns {McpServer}
 */
function createMcpServer(configStore, httpPort) {
  const server = new McpServer({
    name: 'node-red-mcp',
    version: '2.0.0'
  });

  registerFlowTools(server, configStore);
  registerNodeTools(server, configStore);
  registerSettingsTools(server, configStore);
  registerUtilityTools(server, configStore);
  registerOverviewTool(server, configStore, httpPort);

  return server;
}

/**
 * @param {object} userConfig
 */
export function createServer(userConfig = {}) {
  const configStore = userConfig.configStore || createConfigStore();
  configStore.load();

  const runtime = configStore.get();
  const httpPort = userConfig.httpPort || runtime.httpPort || 3000;

  const server = createMcpServer(configStore, httpPort);

  async function testNodeRedConnection() {
    return probeNodeRed(configStore.toMcpConfig());
  }

  async function startStdio() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  function logStartupBanner() {
    const c = configStore.get();
    const base = publicBaseUrl(httpPort);
    // eslint-disable-next-line no-console
    console.error('node-red-mcp v2.0.0');
    // eslint-disable-next-line no-console
    console.error(`  Settings UI: ${base}${c.secretPath}/settings`);
    // eslint-disable-next-line no-console
    console.error(`  MCP endpoint: ${base}${c.secretPath}${MCP_SUFFIX}`);
    // eslint-disable-next-line no-console
    console.error(`  Health:       ${base}/health`);
  }

  async function startHttp() {
    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({ ok: true, version: '2.0.0' });
    });

    const protectedApp = express.Router();
    const getConfig = () => configStore.get();

    protectedApp.use(createIpAllowlistMiddleware(getConfig));

    const settingsRouter = createSettingsRouter(configStore, httpPort);
    protectedApp.use(settingsRouter);

    const mcpPath = MCP_SUFFIX;
    const mcpConfig = () => configStore.toMcpConfig();

    // DNS-rebinding protection: reject cross-site browser Origins on the MCP
    // endpoint. Non-browser MCP clients send no Origin and are unaffected.
    protectedApp.use(mcpPath, createOriginGuard());

    protectedApp.use(
      mcpPath,
      createAccessJwtMiddleware({
        teamDomain: mcpConfig().accessTeamDomain,
        aud: mcpConfig().accessAud,
        verbose: mcpConfig().verbose
      })
    );

    const transports = {};

    protectedApp.post(mcpPath, async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'];
        let transport;

        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports[sid] = transport;
            }
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              delete transports[transport.sessionId];
            }
          };

          const sessionServer = createMcpServer(configStore, httpPort);
          await sessionServer.connect(transport);
        } else {
          logSecurity('mcp_bad_request', {
            reason: 'missing_or_invalid_session',
            ip: normalizeClientIp(req.socket?.remoteAddress) ?? 'unknown'
          });
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
            id: null
          });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        logError('MCP request failed', err);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: null
          });
        }
      }
    });

    const handleSessionRequest = async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'];
        if (!sessionId || !transports[sessionId]) {
          logSecurity('mcp_bad_request', {
            reason: 'missing_or_invalid_session',
            ip: normalizeClientIp(req.socket?.remoteAddress) ?? 'unknown'
          });
          res.status(400).send('Invalid or missing session ID');
          return;
        }
        await transports[sessionId].handleRequest(req, res);
      } catch (err) {
        logError('MCP session request failed', err);
        if (!res.headersSent) {
          res.status(500).send('Internal error');
        }
      }
    };

    protectedApp.get(mcpPath, handleSessionRequest);
    protectedApp.delete(mcpPath, handleSessionRequest);

    const prefix = () => getConfig().secretPath;

    app.use((req, res, next) => {
      // /health is public; everything else under the secret path.
      if (req.path === '/health') {
        next();
        return;
      }
      const secretPath = prefix();
      if (!req.path.startsWith(secretPath)) {
        // Failed "login": wrong or missing secret path (auth-by-obscurity).
        if (req.path !== '/' && req.path !== '/favicon.ico') {
          logSecurity('auth_failed', {
            reason: 'invalid_secret_path',
            ip: normalizeClientIp(req.socket?.remoteAddress) ?? 'unknown',
            method: req.method,
            path: req.path
          });
        }
        res.status(404).json({ error: 'Not found' });
        return;
      }
      next();
    });

    app.use((req, res, next) => {
      const secretPath = prefix();
      if (!req.path.startsWith(secretPath)) {
        next();
        return;
      }
      const subPath = req.path.slice(secretPath.length) || '/';
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = subPath + query;
      protectedApp(req, res, next);
    });

    // Express error handler (must have 4 args).
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => {
      logError(`${req.method} ${req.originalUrl || req.url}`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error' });
      }
    });

    await new Promise((resolve) => {
      app.listen(httpPort, '0.0.0.0', () => {
        logStartupBanner();
        resolve();
      });
    });
  }

  async function start() {
    try {
      await testNodeRedConnection();
    } catch {
      // non-fatal
    }

    const transportType =
      userConfig.transportType ||
      process.env.MCP_TRANSPORT ||
      'http';

    if (transportType === 'stdio') {
      await startStdio();
    } else if (transportType === 'http' || process.env.MCP_HTTP_PORT) {
      await startHttp();
    } else {
      throw new Error(`Unsupported transport type: ${transportType}`);
    }
  }

  return {
    server,
    configStore,
    start,
    testNodeRedConnection
  };
}
