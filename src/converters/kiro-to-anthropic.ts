// Kiro to Anthropic Response Converter

import type {
  AnthropicMessagesResponse,
  AnthropicContentBlock,
  AnthropicTextBlock,
  AnthropicToolUseBlock,
} from '../types/anthropic'
import type { ParsedToolUse, StreamParseResult } from '../types/common'

/**
 * Build Anthropic response from parsed Kiro stream result
 */
export function buildAnthropicResponse(
  parseResult: StreamParseResult,
  messageId: string,
  model: string
): AnthropicMessagesResponse {
  const content: AnthropicContentBlock[] = []

  // Add text content if present
  const textContent = parseResult.content.join('')
  if (textContent) {
    content.push({
      type: 'text',
      text: textContent,
    } as AnthropicTextBlock)
  }

  // Add tool uses if present
  for (const toolUse of parseResult.toolUses) {
    content.push({
      type: 'tool_use',
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    } as AnthropicToolUseBlock)
  }

  // Ensure at least empty text block if no content
  if (content.length === 0) {
    content.push({
      type: 'text',
      text: '',
    } as AnthropicTextBlock)
  }

  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: parseResult.stopReason === 'tool_use' ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  }
}

/**
 * Convert a single tool use to Anthropic format
 */
export function convertToolUseToAnthropic(toolUse: ParsedToolUse): AnthropicToolUseBlock {
  return {
    type: 'tool_use',
    id: toolUse.id,
    name: toolUse.name,
    input: toolUse.input,
  }
}

/**
 * Create an error response in Anthropic format
 */
export function createErrorResponse(
  error: string,
  messageId: string,
  model: string
): AnthropicMessagesResponse {
  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: `Error: ${error}`,
      },
    ],
    model,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  }
}
