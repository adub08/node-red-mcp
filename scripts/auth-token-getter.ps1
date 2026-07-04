# Fetch a Node-RED Admin API access token (password grant).
# Prompts for URL, username, and password — nothing is stored in this script.
#
# Usage:
#   pwsh ./scripts/auth-token-getter.ps1
#   # or: powershell -File ./scripts/auth-token-getter.ps1
#
# Paste the printed token into NODE_RED_TOKEN in .env (or Settings → Connection).

$nodeRedUrl = Read-Host "Node-RED URL (e.g. http://192.168.1.10:1880)"
$nodeRedUrl = $nodeRedUrl.TrimEnd('/')
if (-not $nodeRedUrl) {
  Write-Error "Node-RED URL is required."
  exit 1
}

$username = Read-Host "Username"
if (-not $username) {
  Write-Error "Username is required."
  exit 1
}

$securePassword = Read-Host "Password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$body = @{
  client_id  = "node-red-admin"
  grant_type = "password"
  scope      = "*"
  username   = $username
  password   = $password
} | ConvertTo-Json

$resp = Invoke-RestMethod -Method Post -Uri "$nodeRedUrl/auth/token" `
  -ContentType "application/json" -Body $body

$resp.access_token
