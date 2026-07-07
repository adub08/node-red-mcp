/**
 * IP allowlist middleware — uses req.socket.remoteAddress only (no X-Forwarded-For).
 */

import { logSecurity } from '../log.mjs';

/**
 * Normalize client IP (strip IPv4-mapped IPv6 prefix).
 * @param {string|null|undefined} ip
 * @returns {string|null}
 */
export function normalizeClientIp(ip) {
  if (!ip) return null;
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

const BARE_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Append /32 when a bare IPv4 address is given (no prefix length).
 * @param {string} entry
 * @returns {string}
 */
export function normalizeCidrEntry(entry) {
  const s = String(entry).trim();
  if (!s) return s;
  if (BARE_IPV4.test(s)) return `${s}/32`;
  return s;
}

/**
 * @param {string} ip
 * @returns {number|null}
 */
function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

/**
 * @param {string} cidr
 * @returns {{ network: number, mask: number }|null}
 */
function parseCidr(cidr) {
  const trimmed = cidr.trim();
  const slash = trimmed.indexOf('/');
  const ipPart = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const bits = slash === -1 ? 32 : parseInt(trimmed.slice(slash + 1), 10);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const network = ipv4ToInt(ipPart);
  if (network === null) return null;
  const mask = bits === 0 ? 0 : ((~0 << (32 - bits)) >>> 0);
  return { network, mask };
}

/**
 * True when the entry parses as a valid IPv4 address or CIDR range.
 * @param {string} entry
 * @returns {boolean}
 */
export function isValidCidr(entry) {
  if (typeof entry !== 'string') return false;
  return parseCidr(entry) !== null;
}

/**
 * @param {string} clientIp
 * @param {string} cidr
 * @returns {boolean}
 */
export function ipMatchesCidr(clientIp, cidr) {
  const client = ipv4ToInt(clientIp);
  const parsed = parseCidr(cidr);
  if (client === null || parsed === null) return false;
  return (client & parsed.mask) === (parsed.network & parsed.mask);
}

/**
 * @param {string} clientIp
 * @param {string[]} allowlist
 * @returns {boolean}
 */
export function isIpAllowed(clientIp, allowlist) {
  const normalized = normalizeClientIp(clientIp);
  if (!normalized) return false;
  if (!Array.isArray(allowlist) || allowlist.length === 0) return false;
  return allowlist.some((cidr) => ipMatchesCidr(normalized, cidr));
}

/**
 * @param {() => object} getConfig
 * @returns {import('express').RequestHandler}
 */
export function createIpAllowlistMiddleware(getConfig) {
  return (req, res, next) => {
    const peer = normalizeClientIp(req.socket?.remoteAddress);
    const { ipAllowlist } = getConfig();
    if (!isIpAllowed(peer, ipAllowlist)) {
      logSecurity('access_denied', {
        reason: 'ip_not_allowlisted',
        ip: peer ?? 'unknown',
        method: req.method,
        path: req.originalUrl || req.url
      });
      res.status(403).json({
        error: 'Forbidden',
        message: `Client IP ${peer ?? 'unknown'} is not in the allowlist`
      });
      return;
    }
    next();
  };
}
