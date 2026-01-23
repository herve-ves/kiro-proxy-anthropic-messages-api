// Kiro Stream Processing

import { parseEventStream, concatUint8Arrays } from '../parsers/aws-event-stream'
import { logger } from '../utils/logger'
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
        logger.trace({ chunkSize: value.length }, 'Kiro stream chunk received')
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
