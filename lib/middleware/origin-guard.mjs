/**
 * DNS-rebinding protection for the MCP endpoint.
 *
 * Non-browser MCP clients (Cursor, curl, the SDK client) do not send an Origin
 * header, so requests without one are allowed. A browser-initiated request
 * always carries Origin; a DNS-rebinding attack page therefore sends its own
 * cross-site Origin, which we reject unless the operator explicitly allowlisted
 * it via NR_MCP_ALLOWED_ORIGINS (comma-separated).
 */

import { logSecurity } from '../log.mjs';
import { normalizeClientIp } from './ip-allowlist.mjs';

/**
 * @param {string} [raw]
 * @returns {string[]}
 */
export function parseAllowedOrigins(raw = process.env.NR_MCP_ALLOWED_ORIGINS) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Decide whether a request Origin is acceptable.
 * @param {string|undefined|null} origin
 * @param {string[]} allowedOrigins
 * @returns {boolean}
 */
export function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

/**
 * @param {() => string[]} [getAllowedOrigins]
 * @returns {import('express').RequestHandler}
 */
export function createOriginGuard(getAllowedOrigins = parseAllowedOrigins) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (isOriginAllowed(origin, getAllowedOrigins())) {
      next();
      return;
    }
    logSecurity('access_denied', {
      reason: 'origin_not_allowed',
      origin,
      ip: normalizeClientIp(req.socket?.remoteAddress) ?? 'unknown',
      method: req.method,
      path: req.originalUrl || req.url
    });
    res.status(403).json({ error: 'Forbidden', message: 'Origin not allowed' });
  };
}
