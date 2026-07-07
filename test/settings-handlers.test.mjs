import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSettingsHandlers } from '../lib/settings-ui/handlers.mjs';

function fakeStore(initial) {
  let config = { ...initial };
  return {
    get: () => ({ ...config }),
    update: (patch) => {
      config = { ...config, ...patch };
      return { ...config };
    },
    toMcpConfig: () => ({ ...config })
  };
}

function fakeReq(body, remoteAddress = '192.168.1.50') {
  return { body, socket: { remoteAddress }, headers: {} };
}

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

const baseConfig = {
  secretPath: '/private_deadbeef',
  nodeRedUrl: 'http://localhost:1880',
  nodeRedToken: 'super-secret-token',
  readOnlyMode: true,
  disabledTools: [],
  ipAllowlist: ['192.168.1.0/24'],
  verbose: false,
  httpPort: 3000
};

describe('postTools response (Finding 1)', () => {
  it('never leaks nodeRedToken or secretPath in the response', () => {
    const store = fakeStore(baseConfig);
    const handlers = buildSettingsHandlers(store, 3000);
    const res = fakeRes();
    handlers.postTools(fakeReq({ readOnlyMode: false, disabledTools: [] }), res);

    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('super-secret-token'), 'token leaked in response');
    assert.ok(!serialized.includes('/private_deadbeef'), 'secret path leaked in response');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.readOnlyMode, false);
    assert.equal(store.get().nodeRedToken, 'super-secret-token');
  });
});

describe('postSecurity CIDR validation (Finding 8)', () => {
  it('rejects invalid / HTML allowlist entries with 400 and does not persist them', () => {
    const store = fakeStore(baseConfig);
    const handlers = buildSettingsHandlers(store, 3000);
    const res = fakeRes();
    handlers.postSecurity(
      fakeReq({ ipAllowlist: ['192.168.1.0/24', '<img src=x onerror=alert(1)>'] }),
      res
    );
    assert.equal(res.statusCode, 400);
    assert.deepEqual(store.get().ipAllowlist, ['192.168.1.0/24']);
  });

  it('accepts valid entries and normalizes bare IPv4 to /32', () => {
    const store = fakeStore(baseConfig);
    const handlers = buildSettingsHandlers(store, 3000);
    const res = fakeRes();
    handlers.postSecurity(fakeReq({ ipAllowlist: ['10.0.0.5', '172.16.0.0/12'] }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(store.get().ipAllowlist, ['10.0.0.5/32', '172.16.0.0/12']);
  });
});
