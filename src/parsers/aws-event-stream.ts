// AWS Event Stream Binary Parser
// Based on KiroProxy implementation

import type { StreamParseResult, ParsedToolUse, ToolInputBuffer } from '../types/common'

/**
 * AWS Event Stream binary format:
 * [total_len: 4 bytes, big-endian]
 * [headers_len: 4 bytes, big-endian]
 * [prelude_crc: 4 bytes]
 * [headers: headers_len bytes]
 * [payload: variable]
 * [message_crc: 4 bytes]
 */

/**
 * Parse AWS Event Stream binary data
 */
export function parseEventStream(raw: Uint8Array): StreamParseResult {
  const result: StreamParseResult = {
    content: [],
    toolUses: [],
    stopReason: 'end_turn',
  }

  const toolInputBuffer: Map<string, ToolInputBuffer> = new Map()
  let pos = 0

  while (pos < raw.length) {
    // Need at least 12 bytes for prelude (total_len + headers_len + prelude_crc)
    if (pos + 12 > raw.length) break

    // Read prelude
    const view = new DataView(raw.buffer, raw.byteOffset + pos)
    const totalLen = view.getUint32(0, false) // big-endian
    const headersLen = view.getUint32(4, false) // big-endian

    // Validate total length
    if (totalLen === 0 || totalLen > raw.length - pos) break

    // Parse headers to detect event type
    const headerStart = pos + 12
    const headerEnd = headerStart + headersLen
    const headersData = raw.slice(headerStart, headerEnd)
    const eventType = detectEventType(headersData)

    // Parse payload
    const payloadStart = pos + 12 + headersLen
    const payloadEnd = pos + totalLen - 4 // exclude message_crc

    if (payloadStart < payloadEnd) {
      try {
        const payloadBytes = raw.slice(payloadStart, payloadEnd)
        const payloadText = new TextDecoder().decode(payloadBytes)
        const payload = JSON.parse(payloadText)

        // Handle different event types
        processPayload(payload, eventType, result, toolInputBuffer)
      } catch {
        // Skip malformed payloads
      }
    }

    pos += totalLen
  }

  // Assemble tool calls from buffer
  result.toolUses = assembleToolCalls(toolInputBuffer)
  if (result.toolUses.length > 0) {
    result.stopReason = 'tool_use'
  }

  return result
}

/**
 * Detect event type from headers
 */
function detectEventType(headersData: Uint8Array): string {
  // Headers format: [name_len: 1 byte][name][type: 1 byte][value_len: 2 bytes][value]
  // We're looking for :event-type header

  let pos = 0
  while (pos < headersData.length) {
    if (pos + 1 > headersData.length) break

    const nameLen = headersData[pos]
    pos += 1

    if (pos + nameLen > headersData.length) break
    const name = new TextDecoder().decode(headersData.slice(pos, pos + nameLen))
    pos += nameLen

    if (pos + 1 > headersData.length) break
    const valueType = headersData[pos]
    pos += 1

    // Type 7 = string
    if (valueType === 7) {
      if (pos + 2 > headersData.length) break
      const valueLen = (headersData[pos] << 8) | headersData[pos + 1]
      pos += 2

      if (pos + valueLen > headersData.length) break
      const value = new TextDecoder().decode(headersData.slice(pos, pos + valueLen))
      pos += valueLen

      if (name === ':event-type') {
        return value
      }
    } else {
      // Skip other types (simplified)
      break
    }
  }

  return 'unknown'
}

/**
 * Process a parsed payload
 */
function processPayload(
  payload: Record<string, unknown>,
  eventType: string,
  result: StreamParseResult,
  toolInputBuffer: Map<string, ToolInputBuffer>
): void {
  // Handle assistantResponseEvent
  const assistantEvent = payload.assistantResponseEvent as Record<string, unknown> | undefined
  if (assistantEvent?.content) {
    result.content.push(assistantEvent.content as string)
  } else if (payload.content && eventType !== 'toolUseEvent') {
    result.content.push(payload.content as string)
  }

  // Handle toolUseEvent
  if (eventType === 'toolUseEvent' || payload.toolUseId) {
    handleToolUseEvent(payload, toolInputBuffer)
  }
}

/**
 * Handle tool use event and accumulate input chunks
 */
function handleToolUseEvent(
  payload: Record<string, unknown>,
  toolInputBuffer: Map<string, ToolInputBuffer>
): void {
  const toolUseId = payload.toolUseId as string | undefined
  if (!toolUseId) return

  // Get or create buffer for this tool
  let buffer = toolInputBuffer.get(toolUseId)
  if (!buffer) {
    buffer = {
      id: toolUseId,
      name: (payload.name as string) || '',
      inputChunks: [],
    }
    toolInputBuffer.set(toolUseId, buffer)
  }

  // Update name if provided
  if (payload.name) {
    buffer.name = payload.name as string
  }

  // Accumulate input chunks
  if (payload.input) {
    buffer.inputChunks.push(payload.input as string)
  }
}

/**
 * Assemble complete tool calls from accumulated chunks
 */
function assembleToolCalls(
  toolInputBuffer: Map<string, ToolInputBuffer>
): ParsedToolUse[] {
  const toolUses: ParsedToolUse[] = []

  for (const buffer of toolInputBuffer.values()) {
    if (!buffer.name) continue

    // Join all input chunks and parse as JSON
    const inputJson = buffer.inputChunks.join('')
    let input: Record<string, unknown> = {}

    if (inputJson) {
      try {
        input = JSON.parse(inputJson)
      } catch {
        // If parsing fails, try to use as-is or empty object
        input = {}
      }
    }

    toolUses.push({
      id: buffer.id,
      name: buffer.name,
      input,
    })
  }

  return toolUses
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }

  return result
}

/**
 * Parse a single chunk for streaming (extracts content deltas)
 */
export function parseChunkForContent(chunk: Uint8Array): string[] {
  const contents: string[] = []
  let pos = 0

  while (pos < chunk.length) {
    if (pos + 12 > chunk.length) break

    const view = new DataView(chunk.buffer, chunk.byteOffset + pos)
    const totalLen = view.getUint32(0, false)
    const headersLen = view.getUint32(4, false)

    if (totalLen === 0 || totalLen > chunk.length - pos) break

    const payloadStart = pos + 12 + headersLen
    const payloadEnd = pos + totalLen - 4

    if (payloadStart < payloadEnd) {
      try {
        const payloadBytes = chunk.slice(payloadStart, payloadEnd)
        const payloadText = new TextDecoder().decode(payloadBytes)
        const payload = JSON.parse(payloadText)

        // Extract content from assistantResponseEvent
        const assistantEvent = payload.assistantResponseEvent as Record<string, unknown> | undefined
        if (assistantEvent?.content) {
          contents.push(assistantEvent.content as string)
        } else if (payload.content && !payload.toolUseId) {
          contents.push(payload.content as string)
        }
      } catch {
        // Skip malformed payloads
      }
    }

    pos += totalLen
  }

  return contents
}
