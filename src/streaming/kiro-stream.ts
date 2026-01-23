// Kiro Stream Processing

import { parseEventStream, concatUint8Arrays, parseChunkForContent } from '../parsers/aws-event-stream'
import type { StreamParseResult } from '../types/common'

/**
 * Collect all chunks from a response stream
 */
export async function collectStreamChunks(
  response: Response
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []

  if (!response.body) {
    return new Uint8Array(0)
  }

  const reader = response.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
      }
    }
  } finally {
    reader.releaseLock()
  }

  return concatUint8Arrays(chunks)
}

/**
 * Parse collected stream data
 */
export function parseCollectedStream(data: Uint8Array): StreamParseResult {
  return parseEventStream(data)
}

/**
 * Stream processor that yields content chunks as they arrive
 */
export async function* streamKiroResponse(
  response: Response
): AsyncGenerator<{ type: 'content' | 'done'; data: string | StreamParseResult }> {
  if (!response.body) {
    yield { type: 'done', data: { content: [], toolUses: [], stopReason: 'end_turn' } }
    return
  }

  const chunks: Uint8Array[] = []
  const reader = response.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      if (value) {
        chunks.push(value)

        // Try to extract content from this chunk for streaming
        const contents = parseChunkForContent(value)
        for (const content of contents) {
          yield { type: 'content', data: content }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  // Parse the complete stream for final result (including tool calls)
  const fullData = concatUint8Arrays(chunks)
  const result = parseEventStream(fullData)

  yield { type: 'done', data: result }
}
