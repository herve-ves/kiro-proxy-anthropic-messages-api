// Anthropic Messages API Types

export interface AnthropicTextBlock {
  type: 'text'
  text: string
}

export interface AnthropicImageSource {
  type: 'base64'
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string
}

export interface AnthropicImageBlock {
  type: 'image'
  source: AnthropicImageSource
}

export interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | AnthropicContentBlock[]
  is_error?: boolean
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export interface AnthropicSystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface AnthropicToolInputSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

export interface AnthropicTool {
  name: string
  description: string
  input_schema: AnthropicToolInputSchema
}

export interface AnthropicMessagesRequest {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  system?: string | AnthropicSystemBlock[]
  tools?: AnthropicTool[]
  stream?: boolean
  temperature?: number
  top_p?: number
  top_k?: number
  stop_sequences?: string[]
  metadata?: Record<string, unknown>
}

export interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
}

export interface AnthropicMessagesResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: AnthropicContentBlock[]
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null
  stop_sequence: string | null
  usage: AnthropicUsage
}

// SSE Event Types
export interface MessageStartEvent {
  type: 'message_start'
  message: AnthropicMessagesResponse
}

export interface ContentBlockStartEvent {
  type: 'content_block_start'
  index: number
  content_block: AnthropicTextBlock | Omit<AnthropicToolUseBlock, 'input'> & { input: Record<string, never> }
}

export interface TextDelta {
  type: 'text_delta'
  text: string
}

export interface InputJsonDelta {
  type: 'input_json_delta'
  partial_json: string
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta'
  index: number
  delta: TextDelta | InputJsonDelta
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop'
  index: number
}

export interface MessageDeltaEvent {
  type: 'message_delta'
  delta: {
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null
    stop_sequence: string | null
  }
  usage: {
    output_tokens: number
  }
}

export interface MessageStopEvent {
  type: 'message_stop'
}

export type AnthropicSSEEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
