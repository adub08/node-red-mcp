import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nodeRedApiUrl } from '../lib/utils.mjs';

describe('nodeRedApiUrl', () => {
  it('strips trailing slash so /flows is not //flows', () => {
    assert.equal(
      nodeRedApiUrl('http://192.168.1.10:1880/', '/flows'),
      'http://192.168.1.10:1880/flows'
    );
  });

  it('leaves a base without trailing slash unchanged', () => {
    assert.equal(
      nodeRedApiUrl('http://192.168.1.10:1880', '/flows'),
      'http://192.168.1.10:1880/flows'
    );
  });
});
