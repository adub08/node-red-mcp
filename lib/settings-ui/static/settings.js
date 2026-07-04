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

const BARE_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Append /32 when a bare IPv4 address is given. */
function normalizeCidrEntry(entry) {
  const s = String(entry).trim();
  if (!s) return s;
  if (BARE_IPV4.test(s)) return `${s}/32`;
  return s;
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
    ? `<span class="ok">Connected</span> to <code>${info.nodeRedUrl}</code>`
    : `<span class="err">Not connected</span> — ${info.nodeRedError || 'check URL and token'}`;
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
      <span>${group.label} <span class="badge">${group.risk}</span></span>
      <label><input type="checkbox" data-group="${id}" ${allEnabled ? 'checked' : ''}> Enabled</label>
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
      <input type="checkbox" data-tool="${tool.name}" data-mandatory="${tool.mandatory ? '1' : '0'}"
        ${tool.disabled ? '' : 'checked'} ${tool.mandatory ? 'disabled' : ''}>
      <span>${tool.name}</span>
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
    const isCurrent =
      state.clientIp &&
      (cidr === state.clientIp || cidr === `${state.clientIp}/32`);
    li.innerHTML = `<span>${cidr}${isCurrent ? ' <span class="badge readonly">you</span>' : ''}</span><button type="button" data-remove="${i}">Remove</button>`;
    list.appendChild(li);
  });
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ipAllowlist.splice(Number(btn.dataset.remove), 1);
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
  result.className = 'hint';
  result.textContent = 'Saving…';
  try {
    const res = await api('security', {
      method: 'POST',
      body: JSON.stringify({
        ipAllowlist: state.ipAllowlist.map(normalizeCidrEntry)
      })
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
  document.getElementById('overview-status').innerHTML = `<p class="err">${err.message}</p>`;
});
