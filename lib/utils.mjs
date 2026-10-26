/**
 * Utility tools for the Node-RED MCP server
 */

import axios from 'axios';

/** Join Node-RED base URL + Admin API path without producing `//flows`. */
export function nodeRedApiUrl(baseUrl, apiPath) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const path = String(apiPath || '').startsWith('/') ? apiPath : `/${apiPath}`;
  return base + path;
}

/**
 * @param {string} method
 * @param {string} apiPath
 * @param {Object|null} data
 * @param {Object} config
 */
export async function callNodeRed(method, apiPath, data = null, config) {
  const url = nodeRedApiUrl(config.nodeRedUrl, apiPath);
  const headers = config.nodeRedToken ? { Authorization: 'Bearer ' + config.nodeRedToken } : {};

  try {
    const response = await axios({ method, url, headers, data });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const body = error.response?.data;
    let detail = error.message;
    if (typeof body === 'string' && body.includes('<!DOCTYPE')) {
      detail = status ? `HTTP ${status}` : 'unexpected HTML response';
    } else if (body != null && typeof body !== 'object') {
      detail = String(body);
    } else if (body && typeof body === 'object') {
      detail = JSON.stringify(body);
    }
    throw new Error(`Node-RED API error: ${detail}`);
  }
}

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERNS = ['secret', 'password', 'passwd', 'passphrase', 'token', 'apikey', 'privatekey'];

function isSensitiveKey(key) {
  const normalized = String(key).toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function scrubUrlCreds(str) {
  return str.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, `$1${REDACTED}@`);
}

export function redactSensitive(value, seen = new WeakSet()) {
  if (typeof value === 'string') return scrubUrlCreds(value);
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  const result = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactSensitive(val, seen);
  }
  return result;
}

export function formatFlowsOutput(flows) {
  const result = {
    tabs: flows.filter((n) => n.type === 'tab'),
    nodes: flows.filter((n) => n.type !== 'tab' && n.type !== 'subflow'),
    subflows: flows.filter((n) => n.type === 'subflow')
  };

  const stats = {
    tabCount: result.tabs.length,
    nodeCount: result.nodes.length,
    subflowCount: result.subflows.length,
    nodeTypes: {}
  };

  result.nodes.forEach((node) => {
    if (!stats.nodeTypes[node.type]) stats.nodeTypes[node.type] = 0;
    stats.nodeTypes[node.type]++;
  });

  return {
    summary: `Node-RED project: ${stats.tabCount} tabs, ${stats.nodeCount} nodes, ${stats.subflowCount} subflows`,
    statistics: stats,
    data: result
  };
}
