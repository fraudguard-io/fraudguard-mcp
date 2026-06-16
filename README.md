# FraudGuard MCP Server

FraudGuard MCP Server exposes FraudGuard ACE v2 IP Intelligence to MCP-compatible clients.

This MVP is a thin read-only wrapper around the existing FraudGuard REST APIs:

- `POST /ace/v2/ip/check`
- `POST /ace/v2/ip/check/bulk`

It does not reimplement ACE logic locally. Successful tool responses preserve the structured FraudGuard API response.

## Tools

### `check_ip`

Checks one IPv4 address, IPv6 address, or resolvable hostname.

Input:

```json
{
  "ip": "8.216.12.173"
}
```

CIDR ranges and arrays are rejected.

### `bulk_check_ips`

Checks multiple IPv4 addresses, IPv6 addresses, or resolvable hostnames.

Input:

```json
{
  "ips": ["8.8.8.8", "8.216.12.173", "app.fraudguard.io"]
}
```

Empty string values are removed before submission. CIDR ranges are rejected. Requests with more than 100 non-empty submitted values are rejected.

## Requirements

- Node.js 20 or newer
- FraudGuard API credentials with ACE v2 IP Intelligence access

## Environment Variables

Required:

```sh
FRAUDGUARD_API_USERNAME=your_username
FRAUDGUARD_API_PASSWORD=your_password
```

Optional:

```sh
FRAUDGUARD_API_BASE_URL=https://api.fraudguard.io
FRAUDGUARD_MCP_TRANSPORT=stdio
FRAUDGUARD_MCP_HOST=127.0.0.1
FRAUDGUARD_MCP_PORT=3000
FRAUDGUARD_MCP_PATH=/mcp
```

Do not log or commit API passwords.

## Local Development

```sh
npm install
npm run build
```

Run in local stdio mode:

```sh
FRAUDGUARD_API_USERNAME=your_username \
FRAUDGUARD_API_PASSWORD=your_password \
npm start
```

Run in Streamable HTTP mode:

```sh
FRAUDGUARD_API_USERNAME=your_username \
FRAUDGUARD_API_PASSWORD=your_password \
npm start -- --transport http --host 127.0.0.1 --port 3000 --path /mcp
```

Health check:

```sh
curl http://127.0.0.1:3000/health
```

HTTP mode is intended for local development or trusted self-hosted environments. Do not expose it directly to the public internet without adding authentication and normal production controls in front of it.

## Claude Desktop Example

After building the project, add a server entry to your Claude Desktop MCP configuration.

```json
{
  "mcpServers": {
    "fraudguard": {
      "command": "node",
      "args": ["/absolute/path/to/fraudguard-mcp/dist/index.js"],
      "env": {
        "FRAUDGUARD_API_USERNAME": "your_username",
        "FRAUDGUARD_API_PASSWORD": "your_password"
      }
    }
  }
}
```

## Hermes Agent Example

Hermes Agent reads MCP configuration from `~/.hermes/config.yaml`. Add this under the top-level `mcp_servers` key. If your config already has an `mcp_servers` section, add only the `fraudguard` block under it.

```yaml
mcp_servers:
  fraudguard:
    command: "node"
    args:
      - "C:/path/to/fraudguard-mcp/dist/index.js"
    env:
      FRAUDGUARD_API_USERNAME: "your_username"
      FRAUDGUARD_API_PASSWORD: "your_password"
    tools:
      include:
        - check_ip
        - bulk_check_ips
      resources: false
      prompts: false
```

Replace the `args` path with the real path to `dist/index.js` after running `npm run build`. On Windows, use forward slashes in the YAML path, for example `C:/Users/you/Code/fraudguard-mcp/dist/index.js`.

The `tools.include` block limits Hermes to the two read-only FraudGuard MCP tools. `resources: false` and `prompts: false` keep Hermes from registering extra MCP utility wrappers that this server does not need.

## OpenAI Codex Example

OpenAI Codex CLI and the Codex IDE extension read MCP configuration from `~/.codex/config.toml`. Add this to connect Codex to the local FraudGuard MCP server over stdio.

```toml
[mcp_servers.fraudguard]
command = "node"
args = ["/absolute/path/to/fraudguard-mcp/dist/index.js"]
enabled_tools = ["check_ip", "bulk_check_ips"]

[mcp_servers.fraudguard.env]
FRAUDGUARD_API_USERNAME = "your_username"
FRAUDGUARD_API_PASSWORD = "your_password"
```

On Windows, use forward slashes in the path:

```toml
args = ["C:/path/to/fraudguard-mcp/dist/index.js"]
```

After saving the config, start Codex and run `/mcp` to verify the server is connected. The tools should appear as `check_ip` and `bulk_check_ips`.

## Example Prompts

- "Check the risk of 8.216.12.173"
- "Analyze these IPs and tell me which should be blocked"
- "Summarize the observed attack behavior for this IP"

## Billing And Usage

This MCP server does not create separate MCP billing.

MCP tool calls use the existing FraudGuard API plan, billing, and rate limits:

- A single `check_ip` call maps to one ACE v2 single IP lookup.
- A `bulk_check_ips` call maps to the ACE v2 bulk endpoint.
- Bulk usage counts by accepted unique resolved IP lookups, matching the existing FraudGuard API behavior.

## Error Handling

The server returns structured MCP tool errors for:

- missing credentials
- invalid input
- FraudGuard API `401` and `403`
- FraudGuard API `429`
- FraudGuard API `5xx`
- network timeout
- invalid JSON response

Requests to FraudGuard use a 30 second timeout.

By default, logs are written to stderr and include request path, status code, timing, and request ID when available. Full customer responses and API passwords are not logged.
