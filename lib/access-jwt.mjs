/**
 * Optional Cloudflare Access JWT validation for MCP routes.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { logSecurity } from './log.mjs';
import { normalizeClientIp } from './middleware/ip-allowlist.mjs';

/**
 * @param {{ teamDomain: string, aud: string, verbose?: boolean }} options
 * @returns {import('express').RequestHandler}
 */
export function createAccessJwtMiddleware(options) {
  const { teamDomain, aud, verbose } = options;

  if (!teamDomain || !aud) {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.error(
        'Cloudflare Access JWT validation disabled (set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD to enable)'
      );
    }
    return (_req, _res, next) => next();
  }

  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  return async (req, res, next) => {
    const ip = normalizeClientIp(req.socket?.remoteAddress) ?? 'unknown';
    const token =
      req.headers['cf-access-jwt-assertion'] ||
      req.headers['Cf-Access-Jwt-Assertion'];

    if (!token) {
      logSecurity('auth_failed', {
        reason: 'missing_cf_access_jwt',
        ip,
        method: req.method,
        path: req.originalUrl || req.url
      });
      res.status(401).json({ error: 'Missing Cloudflare Access JWT' });
      return;
    }

    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: aud });
      req.accessClaims = payload;
      next();
    } catch (err) {
      logSecurity('auth_failed', {
        reason: 'invalid_cf_access_jwt',
        ip,
        method: req.method,
        path: req.originalUrl || req.url,
        detail: err instanceof Error ? err.message : String(err)
      });
      res.status(401).json({ error: 'Invalid Cloudflare Access JWT' });
    }
  };
}
