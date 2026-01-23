// Anthropic SSE Formatter

import { getModelMaxContextTokens } from '../config'
import type { StreamParseResult } from '../types/common'

/**
 * Estimate output tokens from text length (rough: length / 4)
 */
function estimateOutputTokens(textLength: number): number {
  return Math.max(1, Math.round(textLength / 4))
}

/**
 * Calculate token counts from contextUsagePercentage and output text
 * Returns { inputTokens, outputTokens, totalTokens }
 */
function calculateTokens(
  contextUsagePercentage: number | undefined,
  model: string,
  outputTextLength: number
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const outputTokens = estimateOutputTokens(outputTextLength)

  if (contextUsagePercentage === undefined || contextUsagePercentage <= 0) {
    return { inputTokens: 1, outputTokens, totalTokens: outputTokens + 1 }
  }

  const maxContextTokens = getModelMaxContextTokens(model)
  const totalTokens = Math.round((contextUsagePercentage / 100) * maxContextTokens)
  const inputTokens = Math.max(1, totalTokens - outputTokens)

  return { inputTokens, outputTokens, totalTokens }
}

/**
 * Format a message_start SSE event
 */
export function formatMessageStart(messageId: string, model: string, inputTokens: number = 1): string {
  const event = {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 1 },
    },
  }
  return `event: message_start\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a content_block_start SSE event for text
 */
export function formatTextBlockStart(index: number): string {
  const event = {
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text: '' },
  }
  return `event: content_block_start\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a content_block_start SSE event for tool_use
 */
export function formatToolUseBlockStart(
  index: number,
  toolId: string,
  toolName: string
): string {
  const event = {
    type: 'content_block_start',
    index,
    content_block: { type: 'tool_use', id: toolId, name: toolName, input: {} },
  }
  return `event: content_block_start\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a content_block_delta SSE event for text
 */
export function formatTextDelta(index: number, text: string): string {
  const event = {
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  }
  return `event: content_block_delta\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a content_block_delta SSE event for tool input JSON
 */
export function formatInputJsonDelta(index: number, partialJson: string): string {
  const event = {
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: partialJson },
  }
  return `event: content_block_delta\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a content_block_stop SSE event
 */
export function formatContentBlockStop(index: number): string {
  const event = {
    type: 'content_block_stop',
    index,
  }
  return `event: content_block_stop\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a message_delta SSE event
 */
export function formatMessageDelta(
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens',
  outputTokens: number = 100
): string {
  const event = {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  }
  return `event: message_delta\ndata: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a message_stop SSE event
 */
export function formatMessageStop(): string {
  return `event: message_stop\ndata: {"type":"message_stop"}\n\n`
}

/**
 * Generate SSE stream from already parsed result
 * This buffers the entire Kiro response first, calculates tokens, then streams SSE
 */
export function* generateAnthropicSSEFromResult(
  result: StreamParseResult,
  messageId: string,
  model: string
): Generator<string> {
  // Calculate token counts from the complete result
  const textContent = result.content.join('')
  const toolInputLength = result.toolUses.reduce(
    (sum, tool) => sum + JSON.stringify(tool.input).length,
    0
  )
  const totalOutputLength = textContent.length + toolInputLength
  const { inputTokens, outputTokens } = calculateTokens(
    result.contextUsagePercentage,
    model,
    totalOutputLength
  )

  // Emit message_start with calculated input_tokens
  yield formatMessageStart(messageId, model, inputTokens)

  // Emit text content
  if (textContent || result.toolUses.length === 0) {
    yield formatTextBlockStart(0)
    if (textContent) {
      yield formatTextDelta(0, textContent)
    }
    yield formatContentBlockStop(0)
  }

  // Emit tool_use blocks
  const startIndex = textContent || result.toolUses.length === 0 ? 1 : 0
  for (let i = 0; i < result.toolUses.length; i++) {
    const tool = result.toolUses[i]
    const index = startIndex + i

    yield formatToolUseBlockStart(index, tool.id, tool.name)
    yield formatInputJsonDelta(index, JSON.stringify(tool.input))
    yield formatContentBlockStop(index)
  }

  // Emit message_delta with output_tokens
  yield formatMessageDelta(result.stopReason, outputTokens)

  // Emit message_stop
  yield formatMessageStop()
}
