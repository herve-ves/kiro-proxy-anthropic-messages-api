// Common Types

export interface ParsedToolUse {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolInputBuffer {
  id: string
  name: string
  inputChunks: string[]
}

export interface StreamParseResult {
  content: string[]
  toolUses: ParsedToolUse[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
}

export interface ConvertResult {
  userContent: string
  history: import('./kiro').KiroHistoryItem[]
  toolResults: import('./kiro').KiroToolResult[]
  tools: import('./kiro').KiroTool[]
  images: import('./kiro').KiroImage[]
}

export interface AuthToken {
  accessToken: string
  expiresAt: number
  type: 'kiro-desktop' | 'aws-sso-oidc'
  region: string
}

export interface HttpClientOptions {
  timeout?: number
  maxRetries?: number
}

export interface ApiError {
  type: 'error'
  error: {
    type: string
    message: string
  }
}
