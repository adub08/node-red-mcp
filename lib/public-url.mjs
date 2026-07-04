/**
 * Host-facing base URL for logs and settings UI.
 * Listen port (MCP_HTTP_PORT) may differ from the published host port.
 */

/**
 * @param {number} listenPort
 * @returns {string}
 */
export function publicBaseUrl(listenPort) {
  const host = process.env.MCP_PUBLIC_HOST || '127.0.0.1';
  const port = parseInt(process.env.MCP_PUBLIC_PORT || String(listenPort), 10);
  return `http://${host}:${port}`;
}
