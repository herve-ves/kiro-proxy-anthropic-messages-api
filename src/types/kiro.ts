// Kiro Q API Types (based on KiroProxy implementation)

export interface KiroImage {
  format: 'png' | 'jpeg' | 'gif' | 'webp'
  source: {
    bytes: string // base64 encoded
  }
}

export interface KiroToolParameter {
  name: string
  type: string
  description?: string
  required?: boolean
}

export interface KiroTool {
  name: string
  description: string
  parameters?: KiroToolParameter[]
}

export interface KiroToolResult {
  toolUseId: string
  content: string
  status: 'success' | 'error'
}

export interface KiroToolUse {
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

export interface KiroUserInputMessageContext {
  tools?: KiroTool[]
  toolResults?: KiroToolResult[]
}

export interface KiroUserInputMessage {
  content: string
  modelId: string
  origin: 'AI_EDITOR'
  images?: KiroImage[]
  userInputMessageContext?: KiroUserInputMessageContext
}

export interface KiroAssistantResponseMessage {
  content: string
  toolUses?: KiroToolUse[]
}

export interface KiroUserHistoryItem {
  userInputMessage: KiroUserInputMessage
}

export interface KiroAssistantHistoryItem {
  assistantResponseMessage: KiroAssistantResponseMessage
}

export type KiroHistoryItem = KiroUserHistoryItem | KiroAssistantHistoryItem

export interface KiroCurrentMessage {
  userInputMessage: KiroUserInputMessage
}

export interface KiroConversationState {
  agentContinuationId: string
  agentTaskType: 'vibe'
  chatTriggerType: 'MANUAL'
  conversationId: string
  currentMessage: KiroCurrentMessage
  history: KiroHistoryItem[]
}

export interface KiroPayload {
  conversationState: KiroConversationState
}

// Kiro Response Event Types
export interface KiroAssistantResponseEvent {
  assistantResponseEvent?: {
    content?: string
  }
  content?: string
}

export interface KiroToolUseEvent {
  toolUseId: string
  name?: string
  input?: string // JSON string chunk
}

export interface KiroStreamEvent {
  assistantResponseEvent?: {
    content?: string
  }
  content?: string
  toolUseId?: string
  name?: string
  input?: string
}

// Credentials Types
export interface KiroDesktopCredentials {
  accessToken: string
  refreshToken: string
  expiresAt?: number
  region?: string
}

export interface AwsSsoOidcCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  clientId: string
  clientSecret: string
  region: string
  startUrl?: string
}

export type KiroCredentials = KiroDesktopCredentials | AwsSsoOidcCredentials

export interface KiroCredentialsFile {
  kiro?: KiroDesktopCredentials
  awsSsoOidc?: AwsSsoOidcCredentials[]
}
