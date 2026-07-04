#!/usr/bin/env bash
# Fetch a Node-RED Admin API access token (password grant).
# Prompts for URL, username, and password — nothing is stored in this script.
#
# Usage: ./scripts/auth-token-getter.sh
# Requires: curl
# Paste the printed token into NODE_RED_TOKEN in .env (or Settings → Connection).

set -euo pipefail

read -r -p "Node-RED URL (e.g. http://192.168.1.10:1880): " NODE_RED_URL
NODE_RED_URL="${NODE_RED_URL%/}"
[[ -n "$NODE_RED_URL" ]] || { echo "Node-RED URL is required." >&2; exit 1; }

read -r -p "Username: " USERNAME
[[ -n "$USERNAME" ]] || { echo "Username is required." >&2; exit 1; }

read -r -s -p "Password: " PASSWORD
echo
[[ -n "$PASSWORD" ]] || { echo "Password is required.Passwords containing " or \ will break the script." >&2; exit 1; }

RESP=$(curl -sS -f -X POST "${NODE_RED_URL}/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"node-red-admin\",\"grant_type\":\"password\",\"scope\":\"*\",\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}")

echo "$RESP" | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
