/**
 * Optional per-flow write allowlist for update-flow / delete-flow.
 * Off by default (restrictWritableFlows === false) → all flows writable.
 */

/**
 * @param {string} flowId
 * @param {{ restrictWritableFlows?: boolean, writableFlowIds?: string[] }} config
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function assertFlowWritable(flowId, config) {
  if (!config?.restrictWritableFlows) {
    return { allowed: true };
  }
  const id = String(flowId ?? '');
  if (!id) {
    return { allowed: false, reason: 'Flow ID is required when flow restrictions are enabled' };
  }
  const allowed = new Set(config.writableFlowIds || []);
  if (!allowed.has(id)) {
    return {
      allowed: false,
      reason: `Flow "${id}" is not in the writable-flows allowlist (Settings → Tools → Restrict writable flows)`
    };
  }
  return { allowed: true };
}
