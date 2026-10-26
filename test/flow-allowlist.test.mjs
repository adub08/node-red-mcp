import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFlowWritable } from '../lib/permissions/flow-allowlist.mjs';

describe('assertFlowWritable', () => {
  it('allows any flow when restriction is off', () => {
    assert.deepEqual(
      assertFlowWritable('tab1', { restrictWritableFlows: false, writableFlowIds: [] }),
      { allowed: true }
    );
  });

  it('allows listed flows when restriction is on', () => {
    assert.equal(
      assertFlowWritable('tab1', {
        restrictWritableFlows: true,
        writableFlowIds: ['tab1', 'tab2']
      }).allowed,
      true
    );
  });

  it('denies unlisted flows when restriction is on', () => {
    const result = assertFlowWritable('other', {
      restrictWritableFlows: true,
      writableFlowIds: ['tab1']
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /not in the writable-flows allowlist/);
  });

  it('denies empty id when restriction is on', () => {
    const result = assertFlowWritable('', {
      restrictWritableFlows: true,
      writableFlowIds: ['tab1']
    });
    assert.equal(result.allowed, false);
  });
});
