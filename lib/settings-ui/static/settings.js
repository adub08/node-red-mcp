const api = (path, options = {}) =>
  fetch(`./api/settings/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || data.message || r.statusText);
    return data;
  });

let state = { tools: [], ipAllowlist: [], groups: {}, clientIp: null };

/** Escape a value for safe interpolation into innerHTML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

const BARE_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Append /32 when a bare IPv4 address is given. */
function normalizeCidrEntry(entry) {
  const s = String(entry).trim();
  if (!s) return s;
  if (BARE_IPV4.test(s)) return `${s}/32`;
  return s;
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

/** True if clientIp is inside cidr (IPv4). */
function ipMatchesCidr(clientIp, cidr) {
  const client = ipv4ToInt(clientIp);
  if (client === null) return false;
  const trimmed = String(cidr).trim();
  const slash = trimmed.indexOf('/');
  const ipPart = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const bits = slash === -1 ? 32 : parseInt(trimmed.slice(slash + 1), 10);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const network = ipv4ToInt(ipPart);
  if (network === null) return false;
  const mask = bits === 0 ? 0 : ((~0 << (32 - bits)) >>> 0);
  return (client & mask) === (network & mask);
}

function isIpAllowed(clientIp, allowlist) {
  if (!clientIp || !Array.isArray(allowlist) || allowlist.length === 0) return false;
  return allowlist.some((cidr) => ipMatchesCidr(clientIp, cidr));
}

function cidrCoversClient(cidr, clientIp) {
  return Boolean(clientIp && ipMatchesCidr(clientIp, cidr));
}

function isWriteGroup(groupId) {
  return String(groupId).includes(':write');
}

function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${name}`);
  });
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

function renderOverview(info) {
  const status = document.getElementById('overview-status');
  const conn = info.nodeRedConnected
    ? `<span class="ok">Connected</span> to <code>${esc(info.nodeRedUrl)}</code>`
    : `<span class="err">Not connected</span> — ${esc(info.nodeRedError || 'check URL and token')}`;
  status.innerHTML = `
    <h2>Status</h2>
    <p>Node-RED: ${conn}</p>
    <p>Read-only mode: <span class="badge ${info.readOnlyMode ? 'readonly' : 'write'}">${info.readOnlyMode ? 'ON' : 'OFF'}</span></p>
    <p>IP allowlist entries: ${info.ipAllowlist.length}</p>
  `;
  document.getElementById('settings-url').value = info.settingsUrl;
  document.getElementById('mcp-url').value = info.mcpUrl;
}

/** Gray out write tools/groups while read-only mode is checked (live, before save). */
function applyReadOnlyUi(readOnlyMode) {
  document.querySelectorAll('[data-tool]').forEach((cb) => {
    const row = cb.closest('.tool-row');
    const isWrite = row?.dataset.write === '1';
    if (!isWrite) return;
    const lock = readOnlyMode;
    cb.disabled = lock || cb.dataset.mandatory === '1';
    row.classList.toggle('locked', lock);
  });

  document.querySelectorAll('[data-group]').forEach((cb) => {
    const row = cb.closest('.group-row');
    const isWrite = isWriteGroup(cb.dataset.group);
    if (!isWrite) return;
    cb.disabled = readOnlyMode;
    row?.classList.toggle('locked', readOnlyMode);
  });
}

function renderTools(data) {
  state.tools = data.tools;
  state.groups = data.groups;
  document.getElementById('read-only-mode').checked = data.readOnlyMode;

  const groupsEl = document.getElementById('tool-groups');
  groupsEl.innerHTML = '<h2>Tool groups</h2>';
  for (const [id, group] of Object.entries(data.groups)) {
    const allEnabled = group.tools.every((name) => {
      const t = data.tools.find((x) => x.name === name);
      return t && !t.disabled;
    });
    const writeGroup = isWriteGroup(id);
    const row = document.createElement('div');
    row.className = 'group-row';
    row.innerHTML = `
      <span>${esc(group.label)} <span class="badge">${esc(group.risk)}</span></span>
      <label><input type="checkbox" data-group="${esc(id)}" ${allEnabled ? 'checked' : ''}> Enabled</label>
    `;
    if (writeGroup) row.dataset.write = '1';
    groupsEl.appendChild(row);
  }

  const list = document.getElementById('tool-list');
  list.innerHTML = '';
  data.tools.forEach((tool) => {
    const row = document.createElement('label');
    row.className = 'tool-row';
    if (!tool.readOnly) row.dataset.write = '1';
    row.innerHTML = `
      <input type="checkbox" data-tool="${esc(tool.name)}" data-mandatory="${tool.mandatory ? '1' : '0'}"
        ${tool.disabled ? '' : 'checked'} ${tool.mandatory ? 'disabled' : ''}>
      <span>${esc(tool.name)}</span>
      <span class="badge ${tool.readOnly ? 'readonly' : 'write'}">${tool.readOnly ? 'read' : 'write'}</span>
      ${tool.mandatory ? '<span class="badge">required</span>' : ''}
    `;
    list.appendChild(row);
  });

  applyReadOnlyUi(data.readOnlyMode);
}

function renderSecurity(data) {
  state.ipAllowlist = [...data.ipAllowlist];
  state.clientIp = data.clientIp ?? state.clientIp;
  document.getElementById('secret-path').textContent = data.secretPath;
  document.getElementById('client-ip').textContent = state.clientIp || 'unknown';

  const list = document.getElementById('ip-list');
  list.innerHTML = '';
  state.ipAllowlist.forEach((cidr, i) => {
    const li = document.createElement('li');
    const isCurrent = cidrCoversClient(cidr, state.clientIp);
    li.innerHTML = `<span>${esc(cidr)}${isCurrent ? ' <span class="badge readonly">you</span>' : ''}</span><button type="button" data-remove="${i}">Remove</button>`;
    list.appendChild(li);
  });
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.remove);
      const cidr = state.ipAllowlist[idx];
      const coversMe = cidrCoversClient(cidr, state.clientIp);
      const remaining = state.ipAllowlist.filter((_, i) => i !== idx);
      const stillAllowed = isIpAllowed(state.clientIp, remaining);

      if (coversMe) {
        const msg = stillAllowed
          ? `Remove ${cidr}?\n\nThis entry covers your current IP (${state.clientIp}). Other allowlist entries still cover you.`
          : `Remove ${cidr}?\n\nWARNING: This is the only allowlist entry covering your current IP (${state.clientIp}).\nSaving without it will lock you out of the settings UI and MCP until another allowlisted client restores access.`;
        if (!confirm(msg)) return;
      }

      state.ipAllowlist.splice(idx, 1);
      renderSecurity({
        secretPath: document.getElementById('secret-path').textContent,
        ipAllowlist: state.ipAllowlist,
        clientIp: state.clientIp
      });
    });
  });
  document.getElementById('cf-access-status').textContent = data.cfAccessTeamDomain
    ? `Cloudflare Access JWT validation is configured (${data.cfAccessTeamDomain}).`
    : 'Cloudflare Access not configured (set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD on the container).';
}

async function loadAll() {
  const info = await api('info');
  renderOverview(info);

  const conn = await api('connection');
  document.querySelector('[name="nodeRedUrl"]').value = conn.nodeRedUrl;

  const tools = await api('tools');
  renderTools(tools);

  const sec = await api('security');
  renderSecurity(sec);

  const adv = await api('advanced');
  document.getElementById('verbose-mode').checked = adv.verbose;
}

document.getElementById('copy-settings-url').addEventListener('click', () => {
  const input = document.getElementById('settings-url');
  input.select();
  navigator.clipboard.writeText(input.value);
});

document.getElementById('connection-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = { nodeRedUrl: fd.get('nodeRedUrl') };
  const token = fd.get('nodeRedToken');
  if (token) body.nodeRedToken = token;
  try {
    const res = await api('connection', { method: 'POST', body: JSON.stringify(body) });
    const el = document.getElementById('connection-result');
    el.className = res.nodeRedConnected ? 'hint ok' : 'hint err';
    el.textContent = res.nodeRedConnected ? 'Connected successfully.' : `Save failed test: ${res.nodeRedError}`;
    await loadAll();
  } catch (err) {
    document.getElementById('connection-result').textContent = err.message;
  }
});

document.getElementById('read-only-mode').addEventListener('change', (e) => {
  applyReadOnlyUi(e.target.checked);
  document.getElementById('tools-result').textContent = '';
});

document.getElementById('save-tools').addEventListener('click', async () => {
  const result = document.getElementById('tools-result');
  result.className = 'hint';
  result.textContent = 'Saving…';
  try {
    const disabledTools = [];
    document.querySelectorAll('[data-tool]').forEach((cb) => {
      if (!cb.checked) disabledTools.push(cb.dataset.tool);
    });
    await api('tools', {
      method: 'POST',
      body: JSON.stringify({
        readOnlyMode: document.getElementById('read-only-mode').checked,
        disabledTools
      })
    });
    await loadAll();
    result.className = 'hint ok';
    result.textContent =
      'Tool settings saved. Changes apply immediately to live MCP sessions.';
  } catch (err) {
    result.className = 'hint err';
    result.textContent = err.message;
  }
});

document.getElementById('tool-groups').addEventListener('change', async (e) => {
  const cb = e.target.closest('[data-group]');
  if (!cb || cb.disabled) return;
  const groupEnabled = { [cb.dataset.group]: cb.checked };
  await api('tools', { method: 'POST', body: JSON.stringify({ groupEnabled }) });
  await loadAll();
});

document.getElementById('add-cidr').addEventListener('click', () => {
  const val = normalizeCidrEntry(document.getElementById('new-cidr').value);
  if (!val) return;
  if (!state.ipAllowlist.includes(val)) {
    state.ipAllowlist.push(val);
  }
  document.getElementById('new-cidr').value = '';
  renderSecurity({
    secretPath: document.getElementById('secret-path').textContent,
    ipAllowlist: state.ipAllowlist,
    clientIp: state.clientIp
  });
});

document.getElementById('save-ip').addEventListener('click', async () => {
  const result = document.getElementById('ip-result');
  const list = state.ipAllowlist.map(normalizeCidrEntry);

  if (state.clientIp && !isIpAllowed(state.clientIp, list)) {
    const ok = confirm(
      `WARNING: Your current IP (${state.clientIp}) is not covered by the allowlist you are about to save.\n\n` +
        'You will lose access to the settings UI and MCP from this browser until an allowlisted client restores access.\n\n' +
        'Save anyway?'
    );
    if (!ok) return;
  }

  result.className = 'hint';
  result.textContent = 'Saving…';
  try {
    const res = await api('security', {
      method: 'POST',
      body: JSON.stringify({ ipAllowlist: list })
    });
    await loadAll();
    result.className = 'hint ok';
    result.textContent = `Allowlist saved (${res.ipAllowlist.length} entries).`;
  } catch (err) {
    result.className = 'hint err';
    result.textContent = err.message;
  }
});

document.getElementById('regenerate-secret').addEventListener('click', async () => {
  if (!confirm('Regenerate secret path? Old URLs will stop working.')) return;
  const res = await fetch('./api/settings/regenerate-secret', { method: 'POST' });
  const data = await res.json();
  alert(`New settings URL:\n${data.settingsUrl}`);
  await loadAll();
});

document.getElementById('save-advanced').addEventListener('click', async () => {
  await api('advanced', {
    method: 'POST',
    body: JSON.stringify({ verbose: document.getElementById('verbose-mode').checked })
  });
});

loadAll().catch((err) => {
  document.getElementById('overview-status').innerHTML = `<p class="err">${esc(err.message)}</p>`;
});
