// Messages Route Handler

import { Hono, Context } from 'hono'
import { getKiroModel } from '../config'
import { convertAnthropicToKiro, buildKiroPayload } from '../converters/anthropic-to-kiro'
import { buildAnthropicResponse } from '../converters/kiro-to-anthropic'
import { makeKiroRequest, createTimeoutController, clearRequestTimeout } from '../http/client'
import { collectStreamChunks, parseCollectedStream } from '../streaming/kiro-stream'
import { streamKiroResponse } from '../streaming/kiro-stream'
import { generateAnthropicSSE } from '../streaming/anthropic-sse'
import { generateMessageId, generateConversationId, generateAgentContinuationId } from '../utils/ids'
import type { AnthropicMessagesRequest } from '../types/anthropic'

const messagesRouter = new Hono()

/**
 * POST /v1/messages - Anthropic Messages API compatible endpoint
 */
messagesRouter.post('/', async (c) => {
  try {
    // Parse request body
    const body = await c.req.json<AnthropicMessagesRequest>()

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
        console.error(`Kiro API error: ${response.status} ${errorText}`)
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
        return handleStreamingResponse(c, response, messageId, body.model)
      }

      // Handle non-streaming response
      return await handleNonStreamingResponse(c, response, messageId, body.model)
    } catch (error) {
      clearRequestTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error('Error processing request:', error)

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
 */
function handleStreamingResponse(
  c: Context,
  response: Response,
  messageId: string,
  model: string
) {
  // Create readable stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const kiroStream = streamKiroResponse(response)
        const sseGenerator = generateAnthropicSSE(kiroStream, messageId, model)

        for await (const chunk of sseGenerator) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }

        controller.close()
      } catch (error) {
        console.error('Streaming error:', error)
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
  model: string
) {
  // Collect all stream chunks
  const streamData = await collectStreamChunks(response)

  // Parse the collected data
  const parseResult = parseCollectedStream(streamData)

  // Build Anthropic response
  const anthropicResponse = buildAnthropicResponse(parseResult, messageId, model)

  return c.json(anthropicResponse)
}

export { messagesRouter }
