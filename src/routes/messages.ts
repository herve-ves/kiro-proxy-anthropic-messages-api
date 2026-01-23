// Messages Route Handler

import { Hono, Context } from 'hono'
import { getKiroModel } from '../config'
import { convertAnthropicToKiro, buildKiroPayload } from '../converters/anthropic-to-kiro'
import { buildAnthropicResponse } from '../converters/kiro-to-anthropic'
import { makeKiroRequest, createTimeoutController, clearRequestTimeout } from '../http/client'
import { collectStreamChunks, parseCollectedStream } from '../streaming/kiro-stream'
import { generateAnthropicSSEFromResult } from '../streaming/anthropic-sse'
import { generateMessageId, generateConversationId, generateAgentContinuationId } from '../utils/ids'
import { logger } from '../utils/logger'
import { recordUsage } from '../utils/usage-db'
import { authManager } from '../auth/manager'
import type { AnthropicMessagesRequest } from '../types/anthropic'

const messagesRouter = new Hono()

/**
 * POST /v1/messages - Anthropic Messages API compatible endpoint
 */
messagesRouter.post('/', async (c) => {
  try {
    // Parse request body
    const body = await c.req.json<AnthropicMessagesRequest>()

    logger.info({ model: body.model, stream: body.stream, messages: body.messages.length }, 'Request received')

    // Validate required fields
    if (!body.messages || body.messages.length === 0) {
      return c.json(
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'messages is required and must not be empty',
          },
        },
        400
      )
    }

    // Generate IDs
    const messageId = generateMessageId()
    const conversationId = generateConversationId()
    const agentContinuationId = generateAgentContinuationId()

    // Get Kiro model
    const kiroModel = getKiroModel(body.model)

    // Convert Anthropic format to Kiro format
    const convertResult = convertAnthropicToKiro(body.messages, body.system, body.tools)

    // Build Kiro payload
    const kiroPayload = buildKiroPayload(
      convertResult,
      conversationId,
      agentContinuationId,
      kiroModel
    )

    // Debug: Log the full payload being sent to Kiro
    logger.trace({ payload: kiroPayload }, 'Kiro payload')

    // Create timeout controller
    const { controller, timeoutId } = createTimeoutController()

    try {
      // Make request to Kiro API
      const { response } = await makeKiroRequest({
        payload: kiroPayload,
        signal: controller.signal,
      })

      clearRequestTimeout(timeoutId)

      // Check for errors
      if (!response.ok) {
        const errorText = await response.text()
        logger.error({ status: response.status, error: errorText }, 'Kiro API error')
        logger.trace({ payload: kiroPayload }, 'Request payload')
        return c.json(
          {
            type: 'error',
            error: {
              type: 'api_error',
              message: `Kiro API error: ${response.status}`,
            },
          },
          response.status as 400 | 401 | 403 | 404 | 429 | 500
        )
      }

      // Handle streaming response
      if (body.stream) {
        return handleStreamingResponse(c, response, messageId, body.model, authManager.getCurrentAccountId())
      }

      // Handle non-streaming response
      return await handleNonStreamingResponse(c, response, messageId, body.model, authManager.getCurrentAccountId())
    } catch (error) {
      clearRequestTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    logger.error({ error }, 'Error processing request')

    if (error instanceof Error && error.message === 'Request timeout') {
      return c.json(
        {
          type: 'error',
          error: {
            type: 'timeout_error',
            message: 'Request timed out',
          },
        },
        408
      )
    }

    return c.json(
      {
        type: 'error',
        error: {
          type: 'api_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    )
  }
})

/**
 * Handle streaming response
 * Buffers the entire Kiro response first, calculates tokens, then streams SSE
 */
async function handleStreamingResponse(
  c: Context,
  response: Response,
  messageId: string,
  model: string,
  accountId: string
) {
  // Collect all stream chunks first
  const streamData = await collectStreamChunks(response)

  // Parse the collected data
  const parseResult = parseCollectedStream(streamData)

  logger.debug({ credits: parseResult.credits, contextUsage: parseResult.contextUsagePercentage }, 'Usage')
  logger.trace({ parseResult }, 'Parsed Kiro response')

  // Record usage to SQLite
  recordUsage({
    timestamp: Date.now(),
    messageId,
    accountId,
    model,
    credits: parseResult.credits ?? null,
    contextUsagePercentage: parseResult.contextUsagePercentage ?? null,
  })

  // Create readable stream from parsed result
  const stream = new ReadableStream({
    start(controller) {
      try {
        const sseGenerator = generateAnthropicSSEFromResult(parseResult, messageId, model)

        for (const chunk of sseGenerator) {
          logger.trace({ chunk: chunk.trim() }, 'SSE chunk')
          controller.enqueue(new TextEncoder().encode(chunk))
        }

        logger.debug('Stream completed')
        controller.close()
      } catch (error) {
        logger.error({ error }, 'Streaming error')
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

/**
 * Handle non-streaming response
 */
async function handleNonStreamingResponse(
  c: Context,
  response: Response,
  messageId: string,
  model: string,
  accountId: string
) {
  // Collect all stream chunks
  const streamData = await collectStreamChunks(response)

  // Parse the collected data
  const parseResult = parseCollectedStream(streamData)

  logger.debug({ credits: parseResult.credits, contextUsage: parseResult.contextUsagePercentage }, 'Usage')
  logger.trace({ parseResult }, 'Parsed Kiro response')

  // Record usage to SQLite
  recordUsage({
    timestamp: Date.now(),
    messageId,
    accountId,
    model,
    credits: parseResult.credits ?? null,
    contextUsagePercentage: parseResult.contextUsagePercentage ?? null,
  })

  // Build Anthropic response
  const anthropicResponse = buildAnthropicResponse(parseResult, messageId, model)
  logger.trace({ anthropicResponse }, 'Anthropic response')

  return c.json(anthropicResponse)
}

export { messagesRouter }
