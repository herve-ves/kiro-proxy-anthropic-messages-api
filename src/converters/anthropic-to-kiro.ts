// Anthropic to Kiro Message Converter

import type { AnthropicMessage, AnthropicTool, AnthropicSystemBlock } from '../types/anthropic'
import type {
  KiroHistoryItem,
  KiroToolResult,
  KiroImage,
  KiroUserHistoryItem,
  KiroAssistantHistoryItem,
} from '../types/kiro'
import type { ConvertResult } from '../types/common'
import {
  extractTextContent,
  extractSystemText,
  extractToolUses,
  extractToolResults,
  extractImages,
  convertTools,
} from './utils'
import { fixHistoryAlternation } from './history'

/**
 * Convert Anthropic Messages API format to Kiro format
 */
export function convertAnthropicToKiro(
  messages: AnthropicMessage[],
  system: string | AnthropicSystemBlock[] | undefined,
  tools: AnthropicTool[] | undefined
): ConvertResult {
  const history: KiroHistoryItem[] = []
  let userContent = ''
  let currentToolResults: KiroToolResult[] = []
  let currentImages: KiroImage[] = []

  // Extract system text
  const systemText = extractSystemText(system)

  // Convert tools
  const kiroTools = convertTools(tools)

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const isLast = i === messages.length - 1

    if (msg.role === 'user') {
      // Extract tool_result blocks
      const toolResults = extractToolResults(msg.content)
      const textContent = extractTextContent(msg.content)
      const images = extractImages(msg.content)

      if (toolResults.length > 0) {
        if (isLast) {
          // Last message with tool results
          currentToolResults = toolResults
          currentImages = images
          userContent = textContent || 'Tool results provided.'
        } else {
          // Historical message with tool results
          const historyItem: KiroUserHistoryItem = {
            userInputMessage: {
              content: textContent || 'Tool results provided.',
              modelId: 'claude-sonnet-4',
              origin: 'AI_EDITOR',
              userInputMessageContext: { toolResults },
            },
          }
          if (images.length > 0) {
            historyItem.userInputMessage.images = images
          }
          history.push(historyItem)
        }
        continue
      }

      // Regular user message
      let content = textContent

      // Prepend system message to first user message
      if (systemText && history.length === 0) {
        content = `${systemText}\n\n${content}`
      }

      if (isLast) {
        userContent = content || 'Continue'
        currentImages = images
      } else {
        const historyItem: KiroUserHistoryItem = {
          userInputMessage: {
            content: content || 'Continue',
            modelId: 'claude-sonnet-4',
            origin: 'AI_EDITOR',
          },
        }
        if (images.length > 0) {
          historyItem.userInputMessage.images = images
        }
        history.push(historyItem)
      }
    } else if (msg.role === 'assistant') {
      // Assistant message
      const toolUses = extractToolUses(msg.content)
      const textContent = extractTextContent(msg.content) || 'I understand.'

      const assistantItem: KiroAssistantHistoryItem = {
        assistantResponseMessage: {
          content: textContent,
        },
      }

      if (toolUses.length > 0) {
        assistantItem.assistantResponseMessage.toolUses = toolUses
      }

      history.push(assistantItem)
    }
  }

  // Fix history alternation (critical for Kiro API)
  const fixedHistory = fixHistoryAlternation(history)

  return {
    userContent: userContent || 'Hello',
    history: fixedHistory,
    toolResults: currentToolResults,
    tools: kiroTools,
    images: currentImages,
  }
}

/**
 * Build the complete Kiro payload
 */
export function buildKiroPayload(
  convertResult: ConvertResult,
  conversationId: string,
  agentContinuationId: string,
  modelId: string
): Record<string, unknown> {
  const currentMessage: Record<string, unknown> = {
    userInputMessage: {
      content: convertResult.userContent,
      modelId,
      origin: 'AI_EDITOR',
    },
  }

  // Add images if present
  if (convertResult.images.length > 0) {
    (currentMessage.userInputMessage as Record<string, unknown>).images = convertResult.images
  }

  // Add tools and tool results to context
  const userInputMessageContext: Record<string, unknown> = {}

  if (convertResult.tools.length > 0) {
    userInputMessageContext.tools = convertResult.tools
  }

  if (convertResult.toolResults.length > 0) {
    userInputMessageContext.toolResults = convertResult.toolResults
  }

  if (Object.keys(userInputMessageContext).length > 0) {
    (currentMessage.userInputMessage as Record<string, unknown>).userInputMessageContext =
      userInputMessageContext
  }

  return {
    conversationState: {
      agentContinuationId,
      agentTaskType: 'vibe',
      chatTriggerType: 'MANUAL',
      conversationId,
      currentMessage,
      history: convertResult.history,
    },
  }
}
