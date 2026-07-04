/**
 * Container-friendly logging (stdout — visible in `docker logs`).
 */

/**
 * @param {string} event
 * @param {Record<string, string|number|null|undefined>} [details]
 */
export function logSecurity(event, details = {}) {
  const parts = Object.entries(details)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  // eslint-disable-next-line no-console
  console.log(`[security] ${event}${parts ? ` ${parts}` : ''}`);
}

/**
 * @param {string} message
 * @param {unknown} [err]
 */
export function logError(message, err) {
  const detail =
    err instanceof Error
      ? err.stack || err.message
      : err != null
        ? String(err)
        : '';
  // eslint-disable-next-line no-console
  console.log(`[error] ${message}${detail ? `: ${detail}` : ''}`);
}
