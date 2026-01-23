# Kiro to Anthropic Messages API Gateway

A gateway service that converts Kiro API to Anthropic Messages API format, built with Bun + Hono + TypeScript.

## Features

- **Anthropic Messages API Compatible**: Drop-in replacement for Anthropic API
- **Multiple Authentication Methods**: Supports Kiro Desktop, Enterprise IdC, and kiro-cli
- **Streaming Support**: Full SSE streaming support
- **Tool Use Support**: Converts tool definitions and tool results
- **Binary Stream Parsing**: AWS Event Stream binary format parsing
- **Auto Token Refresh**: Automatic token refresh before expiration
- **Retry Logic**: Built-in retry with exponential backoff

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Valid Kiro credentials (see Authentication section below)

## Installation

```bash
# Install dependencies
bun install
```

## Authentication

The gateway supports **three authentication methods**:

### 1. Kiro Desktop (Social Login)

For users who login via Google, GitHub, Microsoft, etc. through Kiro IDE.

| Item | Description |
|------|-------------|
| **Credentials File** | `~/.kiro/credentials.json` |
| **Auth Method** | `authMethod: "social"` or not specified |
| **Refresh Endpoint** | `https://prod.{region}.auth.desktop.kiro.dev/refreshToken` |

**Example credentials file:**

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "region": "us-east-1"
}
```

### 2. Enterprise IdC (AWS Identity Center)

For enterprise users who login via AWS IAM Identity Center through Kiro IDE.

| Item | Description |
|------|-------------|
| **Credentials File** | Custom path (e.g., `~/.aws/sso/cache/kiro-auth-token.json`) |
| **Auth Method** | `authMethod: "IdC"` |
| **Device Registration** | `~/.aws/sso/cache/{clientIdHash}.json` |
| **Refresh Endpoint** | `https://oidc.{region}.amazonaws.com/token` |

**Example credentials file:**

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": "2026-01-23T04:27:57.473904+00:00",
  "clientIdHash": "341d05a0ed0e10f2a02d22648648db8134e95a4b",
  "authMethod": "IdC",
  "provider": "Enterprise",
  "region": "us-east-1"
}
```

The gateway automatically loads `clientId` and `clientSecret` from `~/.aws/sso/cache/{clientIdHash}.json`.

### 3. kiro-cli (AWS SSO OIDC)

For users who authenticate via `kiro-cli` command line tool.

| Item | Description |
|------|-------------|
| **Credentials DB** | `~/.kiro-cli/kiro-cli.db` (SQLite) |
| **Refresh Endpoint** | `https://oidc.{region}.amazonaws.com/token` |

The gateway reads credentials from the SQLite database's `credentials` table.

### Authentication Priority

The gateway tries to load credentials in this order:

1. **Default Kiro Desktop**: `~/.kiro/credentials.json`
2. **Default kiro-cli**: `~/.kiro-cli/kiro-cli.db`
3. **Custom credentials file**: `KIRO_CREDS_FILE` environment variable
4. **Custom SQLite DB**: `KIRO_CLI_DB_FILE` environment variable

Multiple credentials can be loaded simultaneously. If one fails, the gateway automatically rotates to the next available credential.

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8000` |
| `PROXY_API_KEY` | API key for authentication | `my-secret-key` |
| `KIRO_REGION` | AWS region | `us-east-1` |
| `KIRO_DESKTOP_CREDS_FILE` | Kiro Desktop (Social) credentials | `~/.kiro/credentials.json` |
| `KIRO_IDC_CREDS_FILE` | Enterprise IdC credentials | (none) |
| `KIRO_CLI_DB_FILE` | kiro-cli SQLite database | `~/.kiro-cli/kiro-cli.db` |

### Example .env for Each Auth Method

**Kiro Desktop (Social Login):**

```bash
KIRO_DESKTOP_CREDS_FILE=~/.kiro/credentials.json
```

**Enterprise IdC:**

```bash
KIRO_IDC_CREDS_FILE=~/.aws/sso/cache/kiro-auth-token.json
```

**kiro-cli:**

```bash
KIRO_CLI_DB_FILE=~/.kiro-cli/kiro-cli.db
```

## Usage

### Start the Server

```bash
# Production
bun run start

# Development (with hot reload)
bun run dev
```

### Test with curl

```bash
# Non-streaming request
curl -X POST http://localhost:8000/v1/messages \
  -H "x-api-key: my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Streaming request
curl -X POST http://localhost:8000/v1/messages \
  -H "x-api-key: my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "max_tokens": 1024,
    "stream": true,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Use with Claude Code

```bash
ANTHROPIC_BASE_URL=http://localhost:8000 ANTHROPIC_API_KEY=my-secret-key claude
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/health` | GET | Health check |
| `/v1/messages` | POST | Anthropic Messages API |

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Claude Code, etc.)               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ Anthropic Messages API
┌─────────────────────────────────────────────────────────────────┐
│                         Hono Server                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   Routes    │→ │  Converters  │→ │     HTTP Client        │ │
│  │ /v1/messages│  │ Anthropic→   │  │ (with retry & auth)    │ │
│  └─────────────┘  │ Kiro format  │  └────────────────────────┘ │
│                   └──────────────┘              │               │
│                                                 ▼               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Auth Manager                             ││
│  │  - Kiro Desktop (Social Login)                              ││
│  │  - Enterprise IdC (AWS Identity Center)                     ││
│  │  - kiro-cli (AWS SSO OIDC from SQLite)                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼ Kiro Q API
┌─────────────────────────────────────────────────────────────────┐
│                https://q.us-east-1.amazonaws.com                │
│                    /generateAssistantResponse                   │
└─────────────────────────────────────────────────────────────────┘
```

## Limitations

- Maximum 50 tools per request
- Tool descriptions truncated to 500 characters
- Messages must strictly alternate (user ↔ assistant)

## License

MIT
