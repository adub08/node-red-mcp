import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'node:crypto';
import {
  resolveEncryptionKey,
  encryptSecret,
  decryptSecret
} from '../lib/config/crypto.mjs';
import { createConfigStore } from '../lib/config/store.mjs';

describe('token crypto', () => {
  it('round-trips with base64 key', () => {
    const key = resolveEncryptionKey({
      NR_MCP_ENCRYPTION_KEY: randomBytes(32).toString('base64')
    });
    const blob = encryptSecret('secret-token', key);
    assert.match(blob, /^v1:/);
    assert.equal(decryptSecret(blob, key), 'secret-token');
  });

  it('resolveEncryptionKey returns null when unset', () => {
    assert.equal(resolveEncryptionKey({}), null);
  });

  it('rejects wrong-length keys', () => {
    assert.throws(
      () => resolveEncryptionKey({ NR_MCP_ENCRYPTION_KEY: 'too-short' }),
      /32 bytes/
    );
  });
});

describe('config store token encryption', () => {
  it('writes nodeRedTokenEnc and not plaintext when key is set', () => {
    const prev = process.env.NR_MCP_ENCRYPTION_KEY;
    const keyB64 = randomBytes(32).toString('base64');
    process.env.NR_MCP_ENCRYPTION_KEY = keyB64;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-mcp-'));
    try {
      const store = createConfigStore(dir);
      store.load();
      store.update({ nodeRedToken: 'plain-token-value' });

      const disk = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
      assert.ok(disk.nodeRedTokenEnc);
      assert.equal(disk.nodeRedToken, undefined);
      assert.equal(store.get().nodeRedToken, 'plain-token-value');
    } finally {
      if (prev === undefined) delete process.env.NR_MCP_ENCRYPTION_KEY;
      else process.env.NR_MCP_ENCRYPTION_KEY = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates plaintext token to encrypted on load', () => {
    const prev = process.env.NR_MCP_ENCRYPTION_KEY;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-mcp-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'config.json'),
        JSON.stringify({
          secretPath: '/private_test',
          nodeRedUrl: 'http://nodered:1880',
          nodeRedToken: 'legacy-plain',
          readOnlyMode: true,
          disabledTools: [],
          ipAllowlist: ['127.0.0.1/32'],
          verbose: false,
          httpPort: 3000
        }),
        'utf8'
      );

      process.env.NR_MCP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
      const store = createConfigStore(dir);
      store.load();

      assert.equal(store.get().nodeRedToken, 'legacy-plain');
      const disk = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
      assert.ok(disk.nodeRedTokenEnc);
      assert.equal(disk.nodeRedToken, undefined);
    } finally {
      if (prev === undefined) delete process.env.NR_MCP_ENCRYPTION_KEY;
      else process.env.NR_MCP_ENCRYPTION_KEY = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when encrypted token present but key missing', () => {
    const prev = process.env.NR_MCP_ENCRYPTION_KEY;
    delete process.env.NR_MCP_ENCRYPTION_KEY;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-mcp-'));
    try {
      const key = resolveEncryptionKey({
        NR_MCP_ENCRYPTION_KEY: randomBytes(32).toString('base64')
      });
      fs.writeFileSync(
        path.join(dir, 'config.json'),
        JSON.stringify({
          secretPath: '/private_test',
          nodeRedUrl: 'http://nodered:1880',
          nodeRedTokenEnc: encryptSecret('x', key),
          readOnlyMode: true,
          disabledTools: [],
          ipAllowlist: ['127.0.0.1/32'],
          verbose: false,
          httpPort: 3000
        }),
        'utf8'
      );

      const store = createConfigStore(dir);
      assert.throws(() => store.load(), /NR_MCP_ENCRYPTION_KEY is not set/);
    } finally {
      if (prev === undefined) delete process.env.NR_MCP_ENCRYPTION_KEY;
      else process.env.NR_MCP_ENCRYPTION_KEY = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
