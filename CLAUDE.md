# CLAUDE.md

## Project Overview

This is a Kiro to Anthropic Messages API Gateway built with Bun + Hono + TypeScript. It converts Kiro Q API to Anthropic Messages API format, enabling tools like Claude Code to work with Kiro backend.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Language**: TypeScript

## Project Structure

```text
src/
├── index.ts              # Entry point, Hono server setup
├── config.ts             # Configuration management
├── types/                # TypeScript type definitions
├── auth/                 # Authentication modules
│   ├── manager.ts        # AuthManager - coordinates all auth methods
│   ├── kiro-desktop.ts   # Kiro Desktop + Enterprise IdC auth
│   └── aws-sso-oidc.ts   # kiro-cli SQLite auth
├── converters/           # Message format converters
├── parsers/              # AWS Event Stream binary parser
├── streaming/            # SSE streaming handlers
├── http/                 # HTTP client with retry logic
├── routes/               # API route handlers
└── utils/                # Utility functions
```

## Commands

```bash
# Install dependencies
bun install

# Start server
bun run start

# Development with hot reload
bun run dev

# Type check
bun run typecheck
```

## Authentication Methods

The gateway supports three authentication methods:

### 1. Kiro Desktop (Social Login)

- **File**: `~/.kiro/credentials.json`
- **Handler**: `src/auth/kiro-desktop.ts`
- **Refresh URL**: `https://prod.{region}.auth.desktop.kiro.dev/refreshToken`
- **Identifier**: `authMethod` is absent or `"social"`

### 2. Enterprise IdC (AWS Identity Center)

- **File**: Custom path via `KIRO_IDC_CREDS_FILE` (e.g., `~/.aws/sso/cache/kiro-auth-token.json`)
- **Handler**: `src/auth/kiro-desktop.ts` (same file, different code path)
- **Refresh URL**: `https://oidc.{region}.amazonaws.com/token`
- **Identifier**: `authMethod: "IdC"`
- **Note**: Requires `clientIdHash` field; `clientId` and `clientSecret` are loaded from `~/.aws/sso/cache/{clientIdHash}.json`

### 3. kiro-cli (AWS SSO OIDC from SQLite)

- **File**: `~/.kiro-cli/kiro-cli.db` (SQLite database)
- **Handler**: `src/auth/aws-sso-oidc.ts`
- **Refresh URL**: `https://oidc.{region}.amazonaws.com/token`
- **Note**: Reads from `credentials` table in SQLite

## Key Implementation Details

1. **Binary Stream Parsing**: Uses AWS Event Stream binary format parsing (not text-based)
2. **Message Alternation**: Kiro API requires strict user ↔ assistant message alternation
3. **Tool Limits**: Max 50 tools, 500 char description limit
4. **Path Expansion**: `~` in env vars is automatically expanded to home directory

## Environment Variables

| Variable | Auth Method | Default |
|----------|-------------|---------|
| `PORT` | - | `8000` |
| `PROXY_API_KEY` | - | `my-secret-key` |
| `KIRO_REGION` | - | `us-east-1` |
| `KIRO_DESKTOP_CREDS_FILE` | Kiro Desktop (Social) | `~/.kiro/credentials.json` |
| `KIRO_IDC_CREDS_FILE` | Enterprise IdC | (none) |
| `KIRO_CLI_DB_FILE` | kiro-cli | `~/.kiro-cli/kiro-cli.db` |
