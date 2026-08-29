/**
 * Probe Node-RED Admin API (not the editor HTML) so auth failures are detected.
 *
 * Hitting NODE_RED_URL alone is misleading: the editor shell often returns 200
 * without a token, while /flows and /settings require admin auth.
 */

import axios from 'axios';

/**
 * @param {{ status?: number, code?: string, message?: string, hasToken: boolean }} input
 * @returns {{ ok: boolean, reachable: boolean, authorized: boolean, status: number|null, error: string|null }}
 */
export function classifyProbeResult({ status, code, message, hasToken }) {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      reachable: true,
      authorized: false,
      status,
      error: hasToken
        ? `Authorization failed (HTTP ${status}). Check the access token.`
        : `Authorization required (HTTP ${status}). Set an access token.`
    };
  }

  if (typeof status === 'number' && status >= 200 && status < 300) {
    return { ok: true, reachable: true, authorized: true, status, error: null };
  }

  if (typeof status === 'number') {
    return {
      ok: false,
      reachable: true,
      authorized: false,
      status,
      error: `Node-RED Admin API returned HTTP ${status}`
    };
  }

  const detail = message || code || 'unreachable';
  return {
    ok: false,
    reachable: false,
    authorized: false,
    status: null,
    error: `Cannot reach Node-RED: ${detail}`
  };
}

/**
 * @param {{ nodeRedUrl: string, nodeRedToken?: string }} config
 * @param {{ request?: typeof axios, timeout?: number }} [opts]
 */
export async function probeNodeRed(config, opts = {}) {
  const request = opts.request || axios;
  const timeout = opts.timeout ?? 5000;
  const base = String(config.nodeRedUrl || '').replace(/\/$/, '');
  const hasToken = Boolean(config.nodeRedToken);
  const started = Date.now();

  if (!base) {
    return {
      ok: false,
      reachable: false,
      authorized: false,
      status: null,
      error: 'Node-RED URL is not set',
      latencyMs: 0,
      probedUrl: null
    };
  }

  // Admin API endpoint that requires auth when adminAuth is enabled.
  const probedUrl = `${base}/settings`;
  const headers = hasToken ? { Authorization: 'Bearer ' + config.nodeRedToken } : {};

  try {
    const response = await request.get(probedUrl, {
      headers,
      timeout,
      validateStatus: () => true
    });
    const classified = classifyProbeResult({
      status: response.status,
      hasToken
    });
    return { ...classified, latencyMs: Date.now() - started, probedUrl };
  } catch (err) {
    const classified = classifyProbeResult({
      code: err.code,
      message: err.message,
      hasToken
    });
    return { ...classified, latencyMs: Date.now() - started, probedUrl };
  }
}
