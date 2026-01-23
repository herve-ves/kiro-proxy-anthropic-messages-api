// History Message Alternation Fix

import type { KiroHistoryItem, KiroUserHistoryItem, KiroAssistantHistoryItem } from '../types/kiro'

/**
 * Check if a history item is a user message
 */
function isUserMessage(item: KiroHistoryItem): item is KiroUserHistoryItem {
  return 'userInputMessage' in item
}

/**
 * Check if a history item is an assistant message
 */
function isAssistantMessage(item: KiroHistoryItem): item is KiroAssistantHistoryItem {
  return 'assistantResponseMessage' in item
}

/**
 * Create a placeholder user message
 */
function createPlaceholderUser(): KiroUserHistoryItem {
  return {
    userInputMessage: {
      content: 'Continue',
      modelId: 'claude-sonnet-4',
      origin: 'AI_EDITOR',
    },
  }
}

/**
 * Create a placeholder assistant message
 */
function createPlaceholderAssistant(): KiroAssistantHistoryItem {
  return {
    assistantResponseMessage: {
      content: 'I understand.',
    },
  }
}

/**
 * Fix history alternation to ensure strict user → assistant → user → ... pattern
 * Kiro API requires messages to strictly alternate between user and assistant
 */
export function fixHistoryAlternation(history: KiroHistoryItem[]): KiroHistoryItem[] {
  if (history.length === 0) {
    return []
  }

  const fixed: KiroHistoryItem[] = []

  for (const item of history) {
    if (isUserMessage(item)) {
      // If last was also user, insert placeholder assistant
      if (fixed.length > 0 && isUserMessage(fixed[fixed.length - 1])) {
        fixed.push(createPlaceholderAssistant())
      }
      fixed.push(item)
    } else if (isAssistantMessage(item)) {
      // If last was also assistant, insert placeholder user
      if (fixed.length > 0 && isAssistantMessage(fixed[fixed.length - 1])) {
        fixed.push(createPlaceholderUser())
      }
      // If history is empty, start with user
      if (fixed.length === 0) {
        fixed.push(createPlaceholderUser())
      }
      fixed.push(item)
    }
  }

  return fixed
}

/**
 * Ensure history ends with assistant message (for proper continuation)
 */
export function ensureEndsWithAssistant(history: KiroHistoryItem[]): KiroHistoryItem[] {
  if (history.length === 0) {
    return []
  }

  const lastItem = history[history.length - 1]
  if (isUserMessage(lastItem)) {
    return [...history, createPlaceholderAssistant()]
  }

  return history
}

/**
 * Ensure history starts with user message
 */
export function ensureStartsWithUser(history: KiroHistoryItem[]): KiroHistoryItem[] {
  if (history.length === 0) {
    return []
  }

  const firstItem = history[0]
  if (isAssistantMessage(firstItem)) {
    return [createPlaceholderUser(), ...history]
  }

  return history
}
