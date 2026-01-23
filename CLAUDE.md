# CLAUDE.md

## Project Overview

This is a Kiro to Anthropic Messages API Gateway built with Bun + Hono + TypeScript. It converts Kiro Q API to Anthropic Messages API format, enabling tools like Claude Code to work with Kiro backend.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Language**: TypeScript

## Project Structure

```
src/
├── index.ts              # Entry point, Hono server setup
├── config.ts             # Configuration management
├── types/                # TypeScript type definitions
├── auth/                 # Authentication (Kiro Desktop, AWS SSO OIDC)
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

## Key Implementation Details

1. **Binary Stream Parsing**: Uses AWS Event Stream binary format parsing (not text-based)
2. **Message Alternation**: Kiro API requires strict user ↔ assistant message alternation
3. **Tool Limits**: Max 50 tools, 500 char description limit
4. **Auth**: Supports both Kiro Desktop (`~/.kiro/credentials.json`) and AWS SSO OIDC (`~/.kiro-cli/kiro-cli.db`)

## Environment Variables

- `PORT` - Server port (default: 8000)
- `PROXY_API_KEY` - API key for client authentication
- `KIRO_REGION` - AWS region (default: us-east-1)
- `KIRO_CREDS_FILE` - Custom credentials file path
- `KIRO_CLI_DB_FILE` - Custom SQLite DB path
