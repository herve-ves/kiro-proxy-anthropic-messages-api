// Anthropic SSE Formatter

import type { StreamParseResult } from '../types/common'

/**
 * Format a message_start SSE event
 */
export function formatMessageStart(messageId: string, model: string): string {
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
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  }
  return `data: ${JSON.stringify(event)}\n\n`
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
  return `data: ${JSON.stringify(event)}\n\n`
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
  return `data: ${JSON.stringify(event)}\n\n`
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
  return `data: ${JSON.stringify(event)}\n\n`
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
  return `data: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a content_block_stop SSE event
 */
export function formatContentBlockStop(index: number): string {
  const event = {
    type: 'content_block_stop',
    index,
  }
  return `data: ${JSON.stringify(event)}\n\n`
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
  return `data: ${JSON.stringify(event)}\n\n`
}

/**
 * Format a message_stop SSE event
 */
export function formatMessageStop(): string {
  return `data: {"type":"message_stop"}\n\n`
}

/**
 * Generate complete SSE stream from Kiro response
 */
export async function* generateAnthropicSSE(
  kiroStream: AsyncGenerator<{ type: 'content' | 'done'; data: string | StreamParseResult }>,
  messageId: string,
  model: string
): AsyncGenerator<string> {
  // Emit message_start
  yield formatMessageStart(messageId, model)

  // Emit text content_block_start
  yield formatTextBlockStart(0)

  let finalResult: StreamParseResult | null = null

  // Stream content deltas
  for await (const event of kiroStream) {
    if (event.type === 'content') {
      yield formatTextDelta(0, event.data as string)
    } else if (event.type === 'done') {
      finalResult = event.data as StreamParseResult
    }
  }

  // Close text block
  yield formatContentBlockStop(0)

  // Emit tool_use blocks if present
  if (finalResult && finalResult.toolUses.length > 0) {
    for (let i = 0; i < finalResult.toolUses.length; i++) {
      const tool = finalResult.toolUses[i]
      const index = i + 1

      // Start tool_use block
      yield formatToolUseBlockStart(index, tool.id, tool.name)

      // Emit input as JSON delta
      const inputJson = JSON.stringify(tool.input)
      yield formatInputJsonDelta(index, inputJson)

      // Close tool_use block
      yield formatContentBlockStop(index)
    }
  }

  // Emit message_delta with stop reason
  const stopReason = finalResult?.stopReason || 'end_turn'
  yield formatMessageDelta(stopReason)

  // Emit message_stop
  yield formatMessageStop()
}

/**
 * Generate SSE stream from already parsed result (non-streaming fallback)
 */
export function* generateAnthropicSSEFromResult(
  result: StreamParseResult,
  messageId: string,
  model: string
): Generator<string> {
  // Emit message_start
  yield formatMessageStart(messageId, model)

  // Emit text content
  const textContent = result.content.join('')
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

  // Emit message_delta
  yield formatMessageDelta(result.stopReason)

  // Emit message_stop
  yield formatMessageStop()
}
