# node-red-mcp

Model Context Protocol (MCP) server for Node-RED with an admin web UI, tool permissions, read-only mode, and IP allowlisting.

Fork of [CamSoper/node-red-mcp-server](https://github.com/CamSoper/node-red-mcp-server), extended with an admin UI, permissions, and IP allowlisting.

Repository: [adub08/node-red-mcp](https://github.com/adub08/node-red-mcp)

## Features

- **Streamable HTTP MCP** at `{secretPath}/mcp` for Cursor and other remote clients
- **Settings web UI** at `{secretPath}/settings` (Overview, Connection, Tools, Security, Advanced)
- **Permissions** — disable tools, read-only mode, tool group presets
- **IP allowlist** — CIDR-based client filtering (uses `req.socket.remoteAddress`, not `X-Forwarded-For`)
- **Secret path** — auto-generated on first boot; regenerate from Security tab
- **Optional Cloudflare Access** JWT validation on MCP routes (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`)
- **Docker** — persistent config in `/data` volume; **macvlan** for production LAN peer IPs

## Which deployment do I want?

| | [Production (macvlan)](#production-linux-macvlan--recommended) | [Local / Docker Desktop](#local--docker-desktop) |
|--|--|--|
| Host | Linux only | Any (incl. Windows/Mac Docker Desktop) |
| Client IP seen by allowlist | Real LAN address | Docker gateway (`172.x`) |
| Good for | Always-on server, LAN-wide access | Development, single-machine testing |
| Compose file | `docker-compose.macvlan.yml` (create network) or `docker-compose.macvlan-external.yml` (join existing) | `docker-compose.yml` |

## Production (Linux macvlan) — recommended

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
| `NODE_RED_TOKEN` | … | Node-RED Admin API token ([how to get one](#getting-a-node-red-access-token)) |

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

Open the settings URL from a LAN client, check **Security → Your current IP** — it should be that client’s LAN address. Tighten the allowlist to `/32` entries as needed.

### 3. Cursor

```json
{
  "mcpServers": {
    "node-red": {
      "url": "http://192.168.1.50:3000/private_<token>/mcp"
    }
  }
}
```

Your workstation’s LAN IP must be in the allowlist.

### Node-RED reachability

Macvlan containers often **cannot** reach the Docker host’s bridge-published ports. Point `NODE_RED_URL` at:

- Node-RED’s own **macvlan LAN IP** (most reliable — if Node-RED is on the same macvlan, both are LAN peers), or
- Node-RED’s own LAN IP/port if it runs outside Docker.

If Node-RED is on macvlan and node-red-mcp is on a bridge network, traffic hairpins through the host and **times out** — put both on the same macvlan (join variant) instead.

### Host cannot ping the macvlan IP

By design, the Linux host usually cannot talk to its own macvlan children. Manage the UI from another LAN device, or add a host macvlan shim if you need host access (distro-specific; not required for LAN clients).

---

## Local / Docker Desktop

For development only. Peer IP is the Docker gateway (`172.x`), not a LAN address — allowlist defaults still work.

```bash
cp .env.example .env
# Use the "Local / Docker Desktop" block in .env.example

docker compose up -d --build
docker compose logs
```

Default publish: `127.0.0.1:3001` → container `:3000`. Node-RED via `host.docker.internal:1880`.

```
Settings UI: http://127.0.0.1:3001/private_<token>/settings
MCP endpoint: http://127.0.0.1:3001/private_<token>/mcp
```

### Cursor (local)

| OS | Path |
|----|------|
| Windows | `%USERPROFILE%\.cursor\mcp.json` |
| macOS / Linux | `~/.cursor/mcp.json` |

```json
{
  "mcpServers": {
    "node-red": {
      "url": "http://127.0.0.1:3001/private_a1b2c3d4e5f6789012345678901234567890abcd/mcp"
    }
  }
}
```

### Remote access via SSH tunnel (local bind)

```bash
ssh -L 3001:127.0.0.1:3001 user@docker-host
```

Then use the same `127.0.0.1:3001` URL in Cursor.

### Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| MCP server shows disconnected | Wrong secret path, or URL missing `/mcp` suffix |
| `403` / connection refused | Client IP not in allowlist — add your LAN `/32` (macvlan) or subnet |
| Tools fail but MCP connects | Node-RED URL/token wrong — fix under **Settings → Connection** |
| Secret path leaked | **Settings → Security → Regenerate secret path**, then update `mcp.json` |
| Current IP is `172.x` | Using published ports (local compose), not macvlan |

## Getting a Node-RED access token

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

## Security

- Protection is **secret path + IP allowlist** (no login in v1)
- **Production:** macvlan + allowlist real LAN `/32` (or tight CIDRs); do not publish the port on the host
- **Local:** bind `127.0.0.1` only; peer IP is not a LAN identity
- Optional **`NR_MCP_ENCRYPTION_KEY`** encrypts the Node-RED token in `config.json` (disk/backup protection only; key must stay outside `/data`)
- Default **read-only mode** is enabled on first install
- Write tools (`update-flows`, `inject`, etc.) grant Node-RED editor-level access
- Do **not** trust `X-Forwarded-For` — peer address only
- Security events (IP denials, wrong secret path, CF JWT failures) and errors are written to **stdout** (`docker logs`) as `[security] …` / `[error] …`

## Environment variables

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

## Development

```bash
npm install
npm test
npm start
```

## License

MIT
