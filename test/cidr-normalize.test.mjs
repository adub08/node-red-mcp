import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCidrEntry } from '../lib/middleware/ip-allowlist.mjs';

describe('normalizeCidrEntry', () => {
  it('appends /32 to bare IPv4', () => {
    assert.equal(normalizeCidrEntry('192.168.1.10'), '192.168.1.10/32');
    assert.equal(normalizeCidrEntry(' 10.0.0.1 '), '10.0.0.1/32');
  });

  it('leaves CIDR entries unchanged', () => {
    assert.equal(normalizeCidrEntry('192.168.1.0/24'), '192.168.1.0/24');
    assert.equal(normalizeCidrEntry('10.0.0.0/8'), '10.0.0.0/8');
  });
});
