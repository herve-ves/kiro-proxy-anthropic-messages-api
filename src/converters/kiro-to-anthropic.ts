// Kiro to Anthropic Response Converter

import { getModelMaxContextTokens } from '../config'
import type {
  AnthropicMessagesResponse,
  AnthropicContentBlock,
  AnthropicTextBlock,
  AnthropicToolUseBlock,
} from '../types/anthropic'
import type { StreamParseResult } from '../types/common'

/**
 * Estimate output tokens from text length (rough: length / 4)
 */
function estimateOutputTokens(textLength: number): number {
  return Math.max(1, Math.round(textLength / 4))
}

/**
 * Calculate token counts from contextUsagePercentage and output text
 * - totalTokens = contextUsagePercentage * maxContext
 * - outputTokens = textLength / 4 (rough estimate)
 * - inputTokens = totalTokens - outputTokens
 */
function calculateTokens(
  contextUsagePercentage: number | undefined,
  model: string,
  outputTextLength: number
): { inputTokens: number; outputTokens: number } {
  const outputTokens = estimateOutputTokens(outputTextLength)

  if (contextUsagePercentage === undefined || contextUsagePercentage <= 0) {
    return { inputTokens: 1, outputTokens }
  }

  const maxContextTokens = getModelMaxContextTokens(model)
  const totalTokens = Math.round((contextUsagePercentage / 100) * maxContextTokens)
  const inputTokens = Math.max(1, totalTokens - outputTokens)

  return { inputTokens, outputTokens }
}

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

  // Calculate token counts
  const toolInputLength = parseResult.toolUses.reduce(
    (sum, tool) => sum + JSON.stringify(tool.input).length,
    0
  )
  const totalOutputLength = textContent.length + toolInputLength
  const { inputTokens, outputTokens } = calculateTokens(
    parseResult.contextUsagePercentage,
    model,
    totalOutputLength
  )

  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: parseResult.stopReason === 'tool_use' ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  }
}
