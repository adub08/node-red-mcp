import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAllowedOrigins,
  isOriginAllowed,
  createOriginGuard
} from '../lib/middleware/origin-guard.mjs';

describe('parseAllowedOrigins', () => {
  it('splits comma-separated origins and trims', () => {
    assert.deepEqual(
      parseAllowedOrigins('http://a.local, http://b.local'),
      ['http://a.local', 'http://b.local']
    );
  });
  it('returns empty list when unset', () => {
    assert.deepEqual(parseAllowedOrigins(''), []);
    assert.deepEqual(parseAllowedOrigins(undefined), []);
  });
});

describe('isOriginAllowed', () => {
  it('allows requests with no Origin (non-browser clients)', () => {
    assert.equal(isOriginAllowed(undefined, []), true);
    assert.equal(isOriginAllowed(null, ['http://a.local']), true);
  });
  it('blocks a cross-site Origin not in the allowlist', () => {
    assert.equal(isOriginAllowed('http://evil.example', []), false);
    assert.equal(isOriginAllowed('http://evil.example', ['http://ok.local']), false);
  });
  it('allows an explicitly allowlisted Origin', () => {
    assert.equal(isOriginAllowed('http://ok.local', ['http://ok.local']), true);
  });
});

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

describe('createOriginGuard middleware', () => {
  it('calls next() for a rebinding attacker with no allowlist match (no Origin)', () => {
    const guard = createOriginGuard(() => []);
    let called = false;
    guard({ headers: {}, socket: {} }, fakeRes(), () => {
      called = true;
    });
    assert.equal(called, true);
  });

  it('rejects a cross-site Origin with 403', () => {
    const guard = createOriginGuard(() => []);
    const res = fakeRes();
    let called = false;
    guard(
      { headers: { origin: 'http://evil.example' }, socket: {}, method: 'POST', url: '/mcp' },
      res,
      () => {
        called = true;
      }
    );
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });
});
