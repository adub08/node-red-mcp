/**
 * Persistent configuration store for node-red-mcp.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'node:crypto';
import {
  resolveEncryptionKey,
  encryptSecret,
  decryptSecret
} from './crypto.mjs';

export const DEFAULT_IP_ALLOWLIST = [
  '127.0.0.1/32',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16'
];

const CONFIG_FILENAME = 'config.json';

/**
 * @returns {string}
 */
export function resolveDataDir() {
  if (process.env.NR_MCP_DATA_DIR) {
    return process.env.NR_MCP_DATA_DIR;
  }
  if (process.platform !== 'win32') {
    try {
      fs.accessSync('/data', fs.constants.W_OK);
      return '/data';
    } catch {
      // not writable or missing
    }
  }
  return path.join(os.homedir(), '.node-red-mcp');
}

/**
 * @returns {string}
 */
export function generateSecretPath() {
  return `/private_${randomBytes(16).toString('hex')}`;
}

/**
 * @returns {object}
 */
function defaultConfig() {
  return {
    secretPath: generateSecretPath(),
    nodeRedUrl: process.env.NODE_RED_URL || 'http://localhost:1880',
    nodeRedToken: process.env.NODE_RED_TOKEN || '',
    readOnlyMode: true,
    disabledTools: [],
    ipAllowlist: [...DEFAULT_IP_ALLOWLIST],
    verbose: false,
    httpPort: parseInt(process.env.MCP_HTTP_PORT || '3000', 10)
  };
}

/**
 * Atomic JSON write.
 * @param {string} filePath
 * @param {object} data
 */
function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/**
 * In-memory config always holds plaintext nodeRedToken.
 * On disk, encrypt when NR_MCP_ENCRYPTION_KEY is set.
 * @param {object} config
 * @returns {object}
 */
function toDiskShape(config) {
  const { nodeRedToken, nodeRedTokenEnc: _drop, ...rest } = config;
  const key = resolveEncryptionKey();
  if (key) {
    if (nodeRedToken) {
      return { ...rest, nodeRedTokenEnc: encryptSecret(nodeRedToken, key) };
    }
    return { ...rest };
  }
  return { ...rest, nodeRedToken: nodeRedToken || '' };
}

/**
 * @param {object} raw
 * @returns {string}
 */
function tokenFromDisk(raw) {
  const key = resolveEncryptionKey();
  if (raw.nodeRedTokenEnc) {
    if (!key) {
      throw new Error(
        'config.json has an encrypted Node-RED token but NR_MCP_ENCRYPTION_KEY is not set'
      );
    }
    return decryptSecret(raw.nodeRedTokenEnc, key);
  }
  if (typeof raw.nodeRedToken === 'string') {
    return raw.nodeRedToken;
  }
  return process.env.NODE_RED_TOKEN || '';
}

/**
 * @param {string} dataDir
 */
export function createConfigStore(dataDir = resolveDataDir()) {
  const configPath = path.join(dataDir, CONFIG_FILENAME);
  let config = null;

  function load() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const { nodeRedTokenEnc: _enc, nodeRedToken: _pt, ...rest } = raw;
      const token = tokenFromDisk(raw);
      config = { ...defaultConfig(), ...rest, nodeRedToken: token };
      if (!config.secretPath) {
        config.secretPath = generateSecretPath();
      }
      if (!Array.isArray(config.ipAllowlist) || config.ipAllowlist.length === 0) {
        config.ipAllowlist = [...DEFAULT_IP_ALLOWLIST];
      }
      // Migrate plaintext → encrypted (or rewrite shape) when key is set.
      save();
      return config;
    }
    config = defaultConfig();
    save();
    return config;
  }

  function save() {
    atomicWriteJson(configPath, toDiskShape(config));
  }

  function get() {
    if (!config) load();
    return { ...config };
  }

  /**
   * @param {object} partial
   */
  function update(partial) {
    if (!config) load();
    const { nodeRedTokenEnc: _ignore, ...safe } = partial;
    config = { ...config, ...safe };
    save();
    return get();
  }

  function regenerateSecretPath() {
    return update({ secretPath: generateSecretPath() });
  }

  /** @returns {object} Runtime config for MCP tools and Node-RED API calls */
  function toMcpConfig() {
    const c = get();
    return {
      serverName: 'node-red-mcp',
      serverVersion: '2.0.0',
      nodeRedUrl: c.nodeRedUrl,
      nodeRedToken: c.nodeRedToken,
      transportType: 'http',
      httpPort: c.httpPort,
      verbose: c.verbose,
      accessTeamDomain: process.env.CF_ACCESS_TEAM_DOMAIN || '',
      accessAud: process.env.CF_ACCESS_AUD || '',
      readOnlyMode: c.readOnlyMode,
      disabledTools: [...c.disabledTools],
      secretPath: c.secretPath,
      ipAllowlist: [...c.ipAllowlist]
    };
  }

  return {
    dataDir,
    configPath,
    load,
    get,
    update,
    save,
    regenerateSecretPath,
    toMcpConfig
  };
}
