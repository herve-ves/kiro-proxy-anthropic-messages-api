// Converter Utility Functions

import type {
  AnthropicContentBlock,
  AnthropicTextBlock,
  AnthropicImageBlock,
  AnthropicToolUseBlock,
  AnthropicToolResultBlock,
  AnthropicSystemBlock,
  AnthropicTool,
} from '../types/anthropic'
import type {
  KiroTool,
  KiroToolResult,
  KiroToolUse,
  KiroImage,
} from '../types/kiro'
import { config } from '../config'

/**
 * Extract text content from Anthropic message content
 */
export function extractTextContent(
  content: string | AnthropicContentBlock[]
): string {
  if (typeof content === 'string') {
    return content
  }

  const textBlocks = content.filter(
    (block): block is AnthropicTextBlock => block.type === 'text'
  )

  return textBlocks.map(block => block.text).join('\n')
}

/**
 * Extract system text from system parameter
 */
export function extractSystemText(
  system: string | AnthropicSystemBlock[] | undefined
): string {
  if (!system) return ''

  if (typeof system === 'string') {
    return system
  }

  return system.map(block => block.text).join('\n')
}

/**
 * Extract tool_use blocks from assistant message content
 */
export function extractToolUses(
  content: string | AnthropicContentBlock[]
): KiroToolUse[] {
  if (typeof content === 'string') {
    return []
  }

  const toolUseBlocks = content.filter(
    (block): block is AnthropicToolUseBlock => block.type === 'tool_use'
  )

  return toolUseBlocks.map(block => ({
    toolUseId: block.id,
    name: block.name,
    input: block.input,
  }))
}

/**
 * Extract tool_result blocks from user message content
 */
export function extractToolResults(
  content: string | AnthropicContentBlock[]
): KiroToolResult[] {
  if (typeof content === 'string') {
    return []
  }

  const toolResultBlocks = content.filter(
    (block): block is AnthropicToolResultBlock => block.type === 'tool_result'
  )

  return toolResultBlocks.map(block => {
    let resultContent: string
    if (typeof block.content === 'string') {
      resultContent = block.content
    } else if (Array.isArray(block.content)) {
      resultContent = extractTextContent(block.content)
    } else {
      resultContent = ''
    }

    return {
      toolUseId: block.tool_use_id,
      content: resultContent,
      status: block.is_error ? 'error' : 'success',
    }
  })
}

/**
 * Extract images from user message content
 */
export function extractImages(
  content: string | AnthropicContentBlock[]
): KiroImage[] {
  if (typeof content === 'string') {
    return []
  }

  const imageBlocks = content.filter(
    (block): block is AnthropicImageBlock => block.type === 'image'
  )

  return imageBlocks.map(block => ({
    format: block.source.media_type.replace('image/', '') as 'png' | 'jpeg' | 'gif' | 'webp',
    source: {
      bytes: block.source.data,
    },
  }))
}

/**
 * Convert Anthropic tools to Kiro tools format
 */
export function convertTools(tools: AnthropicTool[] | undefined): KiroTool[] {
  if (!tools || tools.length === 0) {
    return []
  }

  // Limit to max tools
  const limitedTools = tools.slice(0, config.maxTools)

  return limitedTools.map(tool => {
    // Truncate description if too long
    let description = tool.description || ''
    if (description.length > config.maxToolDescriptionLength) {
      description = description.slice(0, config.maxToolDescriptionLength - 3) + '...'
    }

    // Convert input_schema properties to Kiro parameters format
    const parameters = convertSchemaToParameters(tool.input_schema)

    return {
      name: tool.name,
      description,
      parameters,
    }
  })
}

/**
 * Convert JSON Schema to Kiro tool parameters
 */
function convertSchemaToParameters(
  schema: AnthropicTool['input_schema']
): KiroTool['parameters'] {
  if (!schema.properties) {
    return []
  }

  const required = new Set(schema.required || [])

  return Object.entries(schema.properties).map(([name, prop]) => {
    const propObj = prop as Record<string, unknown>
    return {
      name,
      type: (propObj.type as string) || 'string',
      description: propObj.description as string | undefined,
      required: required.has(name),
    }
  })
}

/**
 * Check if content has tool results
 */
export function hasToolResults(content: string | AnthropicContentBlock[]): boolean {
  if (typeof content === 'string') {
    return false
  }
  return content.some(block => block.type === 'tool_result')
}

/**
 * Check if content has tool uses
 */
export function hasToolUses(content: string | AnthropicContentBlock[]): boolean {
  if (typeof content === 'string') {
    return false
  }
  return content.some(block => block.type === 'tool_use')
}
