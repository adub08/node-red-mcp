# node-red-mcp

**Let AI assistants read, build, and debug your Node-RED flows.**

A Model Context Protocol (MCP) server for Node-RED with an admin web UI, tool permissions, read-only mode, and IP allowlisting. Connect Cursor, Claude, or any MCP client and manage your flows with natural language.

Fork of [CamSoper/node-red-mcp-server](https://github.com/CamSoper/node-red-mcp-server), extended with an admin UI, permissions, and IP allowlisting.

---

## 🚀 Get Started

The recommended way to run node-red-mcp is **Docker Compose**. Config persists in a `/data` volume, and a secret URL is generated on first boot.

**Quick start:**

1. Clone this repository and create your `.env`:

   ```bash
   git clone https://github.com/adub08/node-red-mcp.git
   cd node-red-mcp
   cp .env.example .env
   ```

2. Edit `.env` — at minimum set `NODE_RED_URL`, and `NODE_RED_TOKEN` if Node-RED has admin auth ([how to get a token](#-getting-a-node-red-access-token)).

3. Start the container:

   ```bash
   docker compose up -d --build
   docker compose logs
   ```

4. Copy your unique URLs from the logs:

   ```
   Settings UI:  http://127.0.0.1:3001/private_<token>/settings
   MCP endpoint: http://127.0.0.1:3001/private_<token>/mcp
   ```

5. Paste the MCP URL into your AI client — done. For Cursor, add to `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`):

   ```json
   {
     "mcpServers": {
       "node-red": {
         "url": "http://127.0.0.1:3001/private_<token>/mcp"
       }
     }
   }
   ```

Open the **Settings UI** in a browser to manage the connection, enable/disable tools, toggle read-only mode, and edit the IP allowlist.

### Which deployment do I want?

| | [Production (macvlan)](#-production-linux-macvlan--recommended) | [Local / Docker Desktop](#-local--docker-desktop) |
|--|--|--|
| Host | Linux only | Any (incl. Windows/Mac Docker Desktop) |
| Client IP seen by allowlist | Real LAN address | Docker gateway (`172.x`) |
| Good for | Always-on server, LAN-wide access | Development, single-machine testing |
| Compose file | `docker-compose.macvlan.yml` (create network) or `docker-compose.macvlan-external.yml` (join existing) | `docker-compose.yml` |

The quick start above uses the **Local / Docker Desktop** profile. For an always-on LAN server where the IP allowlist sees real client addresses, use the [macvlan deployment](#-production-linux-macvlan--recommended) below.

---

## 💬 What Can You Do With It?

Just talk to your AI assistant naturally:

| You Say | What Happens |
|---------|--------------|
| *"Show me an overview of my Node-RED flows"* | Summarizes every tab and its node types |
| *"Create a flow that logs a message every morning at 7"* | Builds a new tab with an inject node wired to your logic |
| *"Find every MQTT node across my flows"* | Searches all flows by node type and returns the matches |
| *"Trigger the 'test payload' inject node"* | Fires the inject node as if you clicked its button |
| *"Why isn't my motion-light flow working? Check the wiring"* | Reads the flow JSON and spots broken wires or misconfigured nodes |
| *"Rename that tab and clean up the unused nodes"* | Updates the flow in place |

---

## ✨ Features

| Category | Capabilities |
|----------|--------------|
| **🔍 Read & explore** | Full flow JSON, per-tab views, formatted summaries, node search by type/property |
| **🔧 Build & edit** | Create, update, and delete flows; start/stop the runtime; trigger inject nodes |
| **📊 Inspect** | Runtime settings and diagnostics (sensitive values redacted), installed node modules |
| **🔒 Safety** | Read-only mode (default on), per-tool and per-group enable/disable, MCP risk annotations (`readOnlyHint`/`destructiveHint`) |
| **🌐 Access control** | Secret URL path, CIDR IP allowlist, optional Cloudflare Access JWT |
| **⚙️ Admin UI** | Web settings panel: Overview, Connection, Tools, Security, Advanced |

<details>
<summary><b>Complete Tool List (21 tools)</b></summary>

| Group | Tools |
|-------|-------|
| **Flows (read)** | `get-flows`, `get-flow`, `list-tabs`, `get-flows-formatted`, `visualize-flows`, `get-flows-state` |
| **Flows (write)** | `update-flows`, `update-flow`, `create-flow`, `delete-flow`, `set-flows-state` |
| **Nodes (read)** | `get-nodes`, `get-node-info`, `find-nodes-by-type`, `search-nodes` |
| **Nodes (write)** | `inject`, `toggle-node-module` |
| **Runtime (read)** | `get-settings`, `get-diagnostics` |
| **Meta** | `api-help`, `nr_get_overview` (always available) |

Every tool ships a description and MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so clients can apply per-category approval policies. Write tools are blocked in read-only mode.

</details>

---

## 🏭 Production (Linux macvlan) — recommended

Gives the container its own LAN IP. Clients connect to that IP directly, so the allowlist and **Your current IP** see **real LAN addresses** (no Docker NAT, no trusted headers).

Requires a Linux Docker host (not Docker Desktop) and an unused static IP on your LAN.

Two variants:

| | Compose file | When |
|--|--|--|
| **Create** a macvlan network | `docker-compose.macvlan.yml` | No macvlan network exists yet for your subnet |
| **Join** an existing macvlan network | `docker-compose.macvlan-external.yml` | Node-RED (or anything else) already has a macvlan network on that subnet |

Docker allows only **one** network per address pool. If one already exists, creating a second fails with `Pool overlaps with other one on this address space` — use the **join** variant instead.

### 1. Configure `.env`

```bash
cp .env.example .env
```

Both variants:

| Variable | Example | Notes |
|----------|---------|--------|
| `MACVLAN_IP` | `192.168.1.50` | Unused static IP for this container |
| `MCP_PUBLIC_HOST` | `192.168.1.50` | Same as `MACVLAN_IP` (or DNS pointing at it) |
| `MCP_PUBLIC_PORT` | `3000` | Listen port (no host port publish) |
| `NODE_RED_URL` | `http://192.168.1.10:1880` | Address **reachable from the container** |
| `NODE_RED_TOKEN` | … | Node-RED Admin API token ([how to get one](#-getting-a-node-red-access-token)) |

Create variant only:

| Variable | Example | Notes |
|----------|---------|--------|
| `MACVLAN_PARENT` | `eth0` | Host NIC (`ip -br link`) |
| `MACVLAN_SUBNET` | `192.168.1.0/24` | LAN subnet |
| `MACVLAN_GATEWAY` | `192.168.1.1` | LAN gateway |

Join variant only:

| Variable | Example | Notes |
|----------|---------|--------|
| `MACVLAN_NETWORK` | `nodered_macvlan` | Existing network name — `docker network ls` (driver `macvlan`) |

### 2. Start

Create variant:

```bash
docker compose -f docker-compose.macvlan.yml up -d --build
docker compose -f docker-compose.macvlan.yml logs
```

Join variant (Node-RED already on macvlan):

```bash
docker network ls   # find the macvlan network name, set MACVLAN_NETWORK
docker compose -f docker-compose.macvlan-external.yml up -d --build
docker compose -f docker-compose.macvlan-external.yml logs
```

Logs (example):

```
Settings UI: http://192.168.1.50:3000/private_<token>/settings
MCP endpoint: http://192.168.1.50:3000/private_<token>/mcp
```

Open the settings URL from a LAN client, check **Security → Your current IP** — it should be that client's LAN address. Tighten the allowlist to `/32` entries as needed. Your workstation's LAN IP must be in the allowlist before Cursor can connect.

### Node-RED reachability

Macvlan containers often **cannot** reach the Docker host's bridge-published ports. Point `NODE_RED_URL` at:

- Node-RED's own **macvlan LAN IP** (most reliable — if Node-RED is on the same macvlan, both are LAN peers), or
- Node-RED's own LAN IP/port if it runs outside Docker.

If Node-RED is on macvlan and node-red-mcp is on a bridge network, traffic hairpins through the host and **times out** — put both on the same macvlan (join variant) instead.

### Host cannot ping the macvlan IP

By design, the Linux host usually cannot talk to its own macvlan children. Manage the UI from another LAN device, or add a host macvlan shim if you need host access (distro-specific; not required for LAN clients).

---

## 💻 Local / Docker Desktop

For development only (this is the quick-start profile). Peer IP is the Docker gateway (`172.x`), not a LAN address — allowlist defaults still work.

Default publish: `127.0.0.1:3001` → container `:3000`. Node-RED via `host.docker.internal:1880`.

### Remote access via SSH tunnel

```bash
ssh -L 3001:127.0.0.1:3001 user@docker-host
```

Then use the same `127.0.0.1:3001` URL in Cursor.

---

## 🔑 Getting a Node-RED access token

If Node-RED has admin auth enabled, set `NODE_RED_TOKEN` in `.env` (or under **Settings → Connection** in the UI). Helper scripts prompt for URL, username, and password — credentials are not stored in the scripts.

**Linux / macOS** (needs `curl`):

```bash
chmod +x scripts/auth-token-getter.sh
./scripts/auth-token-getter.sh
```

**Windows** (PowerShell):

```powershell
pwsh ./scripts/auth-token-getter.ps1
# or: powershell -File .\scripts\auth-token-getter.ps1
```

Copy the printed token into `NODE_RED_TOKEN` in `.env`, or paste it under **Settings → Connection** (preferred when encryption is enabled). Recreate or restart the container if you only changed `.env`. Tokens expire; re-run the script when Node-RED starts rejecting requests.

If Node-RED has no authentication, leave `NODE_RED_TOKEN` empty.

### Encrypting the token at rest

Set `NR_MCP_ENCRYPTION_KEY` to a 32-byte secret (base64 or hex):

```bash
openssl rand -base64 32
```

Put the value in `.env` (not in the data volume). With the key set, `config.json` stores `nodeRedTokenEnc` (AES-256-GCM) instead of plaintext `nodeRedToken`. Existing plaintext tokens are migrated on the next load. Prefer entering the token in the Admin UI so it is never written to disk in cleartext.

If `config.json` already has `nodeRedTokenEnc` and the key is missing or wrong, the server will not start until you restore the key or clear the encrypted field and set a new token.

---

## 🔒 Security

- Protection is **secret path + IP allowlist** (no login in v1)
- **Production:** macvlan + allowlist real LAN `/32` (or tight CIDRs); do not publish the port on the host
- **Local:** bind `127.0.0.1` only; peer IP is not a LAN identity
- Optional **`NR_MCP_ENCRYPTION_KEY`** encrypts the Node-RED token in `config.json` (disk/backup protection only; key must stay outside `/data`)
- Default **read-only mode** is enabled on first install
- Write tools (`update-flows`, `inject`, etc.) grant Node-RED editor-level access
- Optional **Cloudflare Access** JWT validation on MCP routes (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`)
- Do **not** trust `X-Forwarded-For` — peer address only
- Security events (IP denials, wrong secret path, CF JWT failures) and errors are written to **stdout** (`docker logs`) as `[security] …` / `[error] …`

---

## 🛠️ Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| MCP server shows disconnected | Wrong secret path, or URL missing `/mcp` suffix |
| `403` / connection refused | Client IP not in allowlist — add your LAN `/32` (macvlan) or subnet |
| Tools fail but MCP connects | Node-RED URL/token wrong — fix under **Settings → Connection** |
| Secret path leaked | **Settings → Security → Regenerate secret path**, then update `mcp.json` |
| Current IP is `172.x` | Using published ports (local compose), not macvlan |
| Connection times out to Node-RED | Macvlan/bridge mismatch — see [Node-RED reachability](#node-red-reachability) |

---

## ⚙️ Environment variables

| Variable | Description |
|----------|-------------|
| `NODE_RED_URL` | Node-RED base URL (seed on first boot) |
| `NODE_RED_TOKEN` | Node-RED Admin API token (seed on first boot; prefer UI when encryption is on) |
| `NR_MCP_ENCRYPTION_KEY` | Optional 32-byte key (base64/hex) to encrypt the token at rest |
| `NR_MCP_DATA_DIR` | Config directory (default `/data` in Docker) |
| `MCP_HTTP_PORT` | Listen port inside the container (default `3000`) |
| `MCP_PUBLIC_HOST` | Host shown in logs/settings URLs |
| `MCP_PUBLIC_PORT` | Port shown in logs/settings URLs |
| `MACVLAN_PARENT` | Host NIC for macvlan (production) |
| `MACVLAN_SUBNET` | LAN subnet (production) |
| `MACVLAN_GATEWAY` | LAN gateway (production) |
| `MACVLAN_IP` | Static LAN IP for the container (production, both variants) |
| `MACVLAN_NETWORK` | Existing macvlan network name to join (production, join variant) |
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team domain |
| `CF_ACCESS_AUD` | Cloudflare Access AUD tag |

All variables are set via `.env` (copy from `.env.example`); see that file for full comments and which profile each belongs to.

---

## 🤝 Development

```bash
npm install
npm test
npm start
```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **[CamSoper/node-red-mcp-server](https://github.com/CamSoper/node-red-mcp-server)** — the original MCP server this project is forked from
- **[Node-RED](https://nodered.org/)** — low-code programming for event-driven applications
- **[ha-mcp](https://github.com/homeassistant-ai/ha-mcp)** — inspiration for the admin UI, permissions, and security model
- **[Model Context Protocol](https://modelcontextprotocol.io/)** — standardized AI-application communication
