import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyProbeResult, probeNodeRed } from '../lib/node-red-probe.mjs';

describe('classifyProbeResult', () => {
  it('treats 2xx as connected and authorized', () => {
    assert.deepEqual(classifyProbeResult({ status: 200, hasToken: true }), {
      ok: true,
      reachable: true,
      authorized: true,
      status: 200,
      error: null
    });
  });

  it('treats 401 with token as auth failure (not success)', () => {
    const result = classifyProbeResult({ status: 401, hasToken: true });
    assert.equal(result.ok, false);
    assert.equal(result.reachable, true);
    assert.equal(result.authorized, false);
    assert.match(result.error, /Authorization failed/);
  });

  it('treats 401 without token as missing token', () => {
    const result = classifyProbeResult({ status: 401, hasToken: false });
    assert.equal(result.ok, false);
    assert.equal(result.authorized, false);
    assert.match(result.error, /Set an access token/);
  });

  it('treats network failures as unreachable', () => {
    const result = classifyProbeResult({
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED',
      hasToken: true
    });
    assert.equal(result.ok, false);
    assert.equal(result.reachable, false);
    assert.equal(result.authorized, false);
    assert.match(result.error, /Cannot reach Node-RED/);
  });
});

describe('probeNodeRed', () => {
  it('probes /settings and classifies 401 as unauthorized', async () => {
    const calls = [];
    const request = {
      async get(url, opts) {
        calls.push({ url, opts });
        return { status: 401 };
      }
    };

    const result = await probeNodeRed(
      { nodeRedUrl: 'http://192.168.1.10:1880/', nodeRedToken: 'bad' },
      { request }
    );

    assert.equal(calls[0].url, 'http://192.168.1.10:1880/settings');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer bad');
    assert.equal(result.ok, false);
    assert.equal(result.reachable, true);
    assert.equal(result.authorized, false);
    assert.equal(result.status, 401);
  });

  it('does not treat a bare editor-root 200 as success — uses Admin API path', async () => {
    const request = {
      async get(url) {
        if (url.endsWith('/settings')) return { status: 401 };
        return { status: 200 };
      }
    };
    const result = await probeNodeRed(
      { nodeRedUrl: 'http://nodered.local:1880', nodeRedToken: 'x' },
      { request }
    );
    assert.equal(result.ok, false);
    assert.equal(result.authorized, false);
  });
});
