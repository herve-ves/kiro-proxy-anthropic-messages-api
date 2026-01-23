# Kiro to Anthropic Messages API Gateway

A gateway service that converts Kiro API to Anthropic Messages API format, built with Bun + Hono + TypeScript.

## Features

- **Anthropic Messages API Compatible**: Drop-in replacement for Anthropic API
- **Dual Authentication**: Supports both Kiro Desktop Auth and AWS SSO OIDC
- **Streaming Support**: Full SSE streaming support
- **Tool Use Support**: Converts tool definitions and tool results
- **Binary Stream Parsing**: AWS Event Stream binary format parsing
- **Auto Token Refresh**: Automatic token refresh before expiration
- **Retry Logic**: Built-in retry with exponential backoff

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Valid Kiro credentials (either Kiro Desktop or AWS SSO OIDC)

## Installation

```bash
# Install dependencies
bun install
```

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
| `KIRO_CREDS_FILE` | Custom credentials file path | `~/.kiro/credentials.json` |
| `KIRO_CLI_DB_FILE` | Custom SQLite DB path | `~/.kiro-cli/kiro-cli.db` |

### Credentials

The gateway automatically looks for credentials in these locations:

1. **Kiro Desktop**: `~/.kiro/credentials.json`
2. **AWS SSO OIDC (kiro-cli)**: `~/.kiro-cli/kiro-cli.db`

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

```
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
│  │  - Token refresh (Kiro Desktop / AWS SSO OIDC)              ││
│  │  - Credentials from JSON / SQLite                           ││
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
