// ID Generation Utilities

/**
 * Generate a unique message ID in Anthropic format
 */
export function generateMessageId(): string {
  return `msg_${generateRandomId(24)}`
}

/**
 * Generate a unique conversation ID
 */
export function generateConversationId(): string {
  return crypto.randomUUID()
}

/**
 * Generate a unique agent continuation ID
 */
export function generateAgentContinuationId(): string {
  return crypto.randomUUID()
}

/**
 * Generate a random alphanumeric ID
 */
function generateRandomId(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return result
}
