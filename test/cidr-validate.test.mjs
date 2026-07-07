import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCidr } from '../lib/middleware/ip-allowlist.mjs';

describe('isValidCidr', () => {
  it('accepts bare IPv4 and CIDR ranges', () => {
    assert.equal(isValidCidr('192.168.1.10'), true);
    assert.equal(isValidCidr('10.0.0.0/8'), true);
    assert.equal(isValidCidr('192.168.1.10/32'), true);
    assert.equal(isValidCidr('0.0.0.0/0'), true);
  });

  it('rejects junk, HTML, and out-of-range values', () => {
    assert.equal(isValidCidr('<img src=x onerror=alert(1)>'), false);
    assert.equal(isValidCidr('192.168.1.10/33'), false);
    assert.equal(isValidCidr('999.1.1.1'), false);
    assert.equal(isValidCidr('not-an-ip'), false);
    assert.equal(isValidCidr(''), false);
    assert.equal(isValidCidr(42), false);
  });
});
