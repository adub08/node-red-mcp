# Security Review — node-red-mcp

**Scope:** Source audit of this repository for high/critical vulnerabilities.
**Date:** 2026-07-07
**Reviewer:** Automated security review (source-level).

## Threat model (as agreed)

Explicitly **out of scope / accepted** by the project owner:

- No transport encryption (plain HTTP).
- No user authentication on the MCP/admin interface; access is gated only by a
  128-bit random "secret path" plus an IP allowlist.
- Deployment is assumed to be on a **protected internal network**, never the
  public internet.

Findings below therefore focus on flaws *within* the controls that remain in
scope: credential handling, the secret-path/allowlist gate, permission
enforcement, input handling, and the container/supply chain. Where the accepted
architecture is the root cause, it is noted and not counted as a finding.

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **High** | `POST /api/settings/tools` returns the full runtime config, including the plaintext Node-RED token and the secret path, in its HTTP response | **Fixed** |
| 2 | Medium | Node-RED admin token = remote code execution; the only guard against it is the accepted secret-path/allowlist gate (design awareness) | Open (by design) |
| 3 | Medium | DOM-based XSS in the settings UI (`nodeRedUrl` / `nodeRedError` / allowlist entries injected via `innerHTML`) | **Fixed** |
| 4 | Medium | Docker image is built without the lockfile (`npm install --no-package-lock`), so shipped dependency versions are non-reproducible | **Fixed** |
| 5 | Medium | Default IP allowlist covers all RFC1918 space (10/8, 172.16/12, 192.168/16) — not least-privilege | Open |
| 6 | Low | No CSRF protection on state-changing settings endpoints (largely mitigated by secret path + JSON content-type) | Open |
| 7 | Low | MCP HTTP transport has no DNS-rebinding / Origin / Host validation (mitigated by secret path) | **Fixed** |
| 8 | Low | `ipAllowlist` entries are not validated as CIDR before being persisted | **Fixed** |

No unauthenticated remote code execution or unauthenticated data-disclosure
path was found: every sensitive route sits behind the secret-path gate, which
uses a cryptographically strong 128-bit random value.

---

## 1. High — Plaintext Node-RED token disclosed in the tools-save response

**Files:** `lib/settings-ui/handlers.mjs` (`postTools`, ~line 144), `lib/config/store.mjs` (`get()`, lines 149–152)

`postTools` echoes the entire runtime config back to the caller:

```133:146:lib/settings-ui/handlers.mjs
      configStore.update(patch);
      res.json({ ok: true, config: configStore.get() });
```

`configStore.get()` returns the in-memory config, which always holds the
**plaintext** `nodeRedToken` (encryption-at-rest only affects the file on disk,
not this object):

```149:152:lib/config/store.mjs
  function get() {
    if (!config) load();
    return { ...config };
  }
```

So a `POST /api/settings/tools` response contains `nodeRedToken` (the Node-RED
admin bearer token), `secretPath`, and the full `ipAllowlist` in cleartext.

This directly contradicts the token-confidentiality design used everywhere
else: `getConnection` and `getInfo` deliberately expose only
`nodeRedTokenSet: Boolean(...)`, never the value, and the project added
AES-256-GCM encryption specifically so the token is not stored in the clear.

**Impact:**
- The Node-RED admin token lands in the browser's network log / devtools /
  history, any intermediary access logs, and screen-shares.
- With the raw token, a client can call the Node-RED Admin API **directly**,
  bypassing this server's permission guard entirely — including read-only mode
  and any disabled tools. A deployment configured "read-only" still hands out a
  token that grants full write (and therefore RCE — see finding 2) to Node-RED.

**Recommendation:** return only non-sensitive fields (or a boolean
acknowledgement) from `postTools`, mirroring `getConnection`. Never serialize
`nodeRedToken` to any HTTP response.

**Status: Fixed.** `postTools` now returns only `{ ok, readOnlyMode,
disabledTools }`; no handler serializes the token to any response. Covered by
`test/settings-handlers.test.mjs` ("postTools response (Finding 1)"), which
asserts the token and secret path never appear in the response body.

---

## 2. Medium — Flow-write tools are equivalent to RCE on the Node-RED host

**Files:** `lib/tools/flows.mjs` (`update-flows`, `create-flow`, `update-flow`), `lib/tools/nodes.mjs` (`inject`)

Node-RED `function` nodes execute arbitrary JavaScript in the Node-RED runtime,
and nodes such as `exec` run shell commands. The write tools push arbitrary flow
JSON to Node-RED, so any client that can invoke them effectively has code
execution on the Node-RED host.

This is inherent to the product's purpose, so it is not a code defect. It is
flagged so operators understand that the secret-path + allowlist gate is the
*entire* barrier against RCE. Mitigating factors already present and worth
keeping: `readOnlyMode` defaults to `true` (`lib/config/store.mjs:57`) and write
tools are enforced server-side in the guard (`lib/permissions/guard.mjs:52–60`),
not just greyed out in the UI. Finding 1 partially undermines this by leaking a
token that sidesteps the guard.

---

## 3. Medium — DOM-based XSS in the settings UI

**File:** `lib/settings-ui/static/settings.js`

Server-supplied strings are inserted into the DOM via `innerHTML` without
escaping:

```74:84:lib/settings-ui/static/settings.js
  const conn = info.nodeRedConnected
    ? `<span class="ok">Connected</span> to <code>${info.nodeRedUrl}</code>`
    : `<span class="err">Not connected</span> — ${info.nodeRedError || 'check URL and token'}`;
  status.innerHTML = `
    ...
```

`renderSecurity` similarly injects allowlist entries (`line 160`,
`<span>${cidr}...`). `nodeRedUrl` and allowlist entries are attacker-influenced
if a malicious/compromised value is saved; `nodeRedError` is partly derived from
whatever host `nodeRedUrl` points at.

Because all settings writers share one trust tier (secret path + allowlist),
this is effectively stored *self*-XSS and does not cross a privilege boundary
today. It is still a defense-in-depth defect that would become serious if any
lower-privilege write path is ever introduced. **Recommendation:** render via
`textContent` / escape before interpolation.

**Status: Fixed.** Added an `esc()` HTML-escaping helper in `settings.js` and
applied it to every server-supplied value interpolated into `innerHTML`
(`nodeRedUrl`, `nodeRedError`, group/tool labels, allowlist CIDRs, and the
load-error message). The escaping runs in the browser, so the stored-data
vector is additionally closed server-side by finding 8: the only
attacker-influenced persisted field flagged here (allowlist entries) can no
longer store HTML because non-CIDR values are now rejected — verified by
`test/settings-handlers.test.mjs` ("rejects invalid / HTML allowlist entries").

---

## 4. Medium — Non-reproducible dependency install in the image

**File:** `Dockerfile` (line 7)

```7:7:Dockerfile
RUN npm install --omit=dev --no-package-lock
```

The build ignores `package-lock.json` and re-resolves semver ranges at build
time. The audited, patched versions pinned in the lockfile (express 4.22.2,
axios 1.18.1, path-to-regexp 0.1.13, jose 5.10.0, sdk 1.29.0, etc.) are **not
guaranteed** in the produced image, and a future compromised patch release could
be pulled in silently. **Recommendation:** use `npm ci` (copy the lockfile
first). No known-CVE dependency was found in the current lockfile.

**Status: Fixed.** The `Dockerfile` now `COPY`s `package-lock.json` and runs
`npm ci --omit=dev`, giving a reproducible install pinned to the audited
lockfile. Verified by a full `docker build`, which completed successfully.

---

## 5. Medium — Default IP allowlist is maximally permissive

**File:** `lib/config/store.mjs` (lines 15–20)

```15:20:lib/config/store.mjs
export const DEFAULT_IP_ALLOWLIST = [
  '127.0.0.1/32',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16'
];
```

On first boot the allowlist admits the entire private address space. Given the
accepted no-auth model, the secret path becomes the sole barrier for every host
on the internal network — so any compromised device that learns the secret path
gains full control (and RCE via finding 2). This is defensible under the
"protected network" assumption but is not least-privilege.
**Recommendation:** default to loopback only (or force explicit configuration on
first run) and let the operator widen it deliberately.

---

## 6. Low — No CSRF protection on settings mutations

**Files:** `lib/settings-ui/routes.mjs`, `handlers.mjs`

State-changing endpoints (`connection`, `tools`, `security`,
`regenerate-secret`, `advanced`) have no CSRF token or Origin/Host check.
Practically mitigated because (a) the endpoints require the unguessable secret
path in the URL, and (b) `express.json()` requires `Content-Type:
application/json`, which forces a CORS preflight that no configured origin
satisfies. Worth an explicit Origin/Host check if hardening is desired.

---

## 7. Low — MCP HTTP transport lacks DNS-rebinding protection

**File:** `lib/server.mjs` (lines 128–133)

`StreamableHTTPServerTransport` is created without
`enableDnsRebindingProtection` / `allowedHosts` / `allowedOrigins`. The MCP SDK
recommends enabling these for HTTP servers so a malicious website cannot use DNS
rebinding to drive a locally/LAN-reachable MCP server from a victim's browser.
Mitigated here because the MCP endpoint lives under the secret path, which the
attacker's page does not know. Enabling Origin/Host allowlisting is a cheap
hardening step.

**Status: Fixed.** Added `lib/middleware/origin-guard.mjs` and mounted it on the
MCP path. Requests with no `Origin` header (non-browser clients such as Cursor
and curl) pass through unchanged; any cross-site browser `Origin` is rejected
with 403 unless explicitly allowlisted via the new `NR_MCP_ALLOWED_ORIGINS`
env var. Covered by `test/origin-guard.test.mjs`.

---

## 8. Low — Allowlist entries are not validated as CIDR on save

**File:** `lib/settings-ui/handlers.mjs` (`postSecurity`, lines 159–177)

`postSecurity` stores any non-empty strings (after bare-IPv4 `/32`
normalization) without confirming they parse as CIDR. Invalid entries are
fail-closed at match time (`ipMatchesCidr` returns `false`), so this is not an
allowlist bypass, but junk/HTML strings persist and feed finding 3.
**Recommendation:** reject entries that do not parse via the existing
`parseCidr` helper.

**Status: Fixed.** Exported `isValidCidr()` from `ip-allowlist.mjs` (built on the
existing `parseCidr`) and `postSecurity` now returns 400 if any submitted entry
fails to parse, persisting nothing. Covered by `test/cidr-validate.test.mjs` and
`test/settings-handlers.test.mjs`.

---

## Notes on things checked and found OK

- Read-only mode and per-tool disabling are enforced **server-side** in the
  guard, not only in the UI (`lib/permissions/guard.mjs:52–63`).
- The IP allowlist uses `req.socket.remoteAddress` and does **not** trust
  `X-Forwarded-For` (`lib/middleware/ip-allowlist.mjs`), correctly avoiding
  header-spoofed allowlist bypass. IPv6 clients fail closed.
- Secret path uses `crypto.randomBytes(16)` (128-bit) — not guessable.
- AES-256-GCM at-rest encryption is used correctly (random IV per encryption,
  auth tag verified on decrypt) in `lib/config/crypto.mjs`.
- `settings.html` loads no third-party resources, so the secret path is not
  leaked to external origins via `Referer`.
- Config mutations build fixed-key patch objects and never spread raw
  `req.body`, so no mass-assignment / prototype-pollution via the API.
- `redactSensitive` masks tokens/passwords in `get-settings` / `get-diagnostics`
  MCP output.
- Container runs as non-root (`USER node`).
