// HTTP Client with Retry Logic

import { config } from '../config'
import { authManager } from '../auth/manager'
import { buildKiroHeaders } from '../utils/headers'
import { getMachineId } from '../utils/machine-id'

export interface KiroRequestOptions {
  payload: Record<string, unknown>
  signal?: AbortSignal
}

export interface KiroResponse {
  response: Response
  retried: boolean
}

/**
 * Make a request to Kiro API with automatic retry and auth refresh
 */
export async function makeKiroRequest(
  options: KiroRequestOptions
): Promise<KiroResponse> {
  const { payload, signal } = options
  let retried = false

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const token = await authManager.getToken()
      const machineId = getMachineId()
      const headers = buildKiroHeaders(token, machineId)

      const response = await fetch(config.kiroApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      })

      // Handle auth errors
      if (response.status === 401 || response.status === 403) {
        if (attempt < config.maxRetries) {
          console.log(`Auth error (${response.status}), refreshing token...`)
          await authManager.handleAuthError()
          retried = true
          continue
        }
      }

      // Handle rate limiting
      if (response.status === 429) {
        if (attempt < config.maxRetries) {
          const retryAfter = response.headers.get('Retry-After')
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000
          console.log(`Rate limited, waiting ${waitMs}ms...`)
          await sleep(waitMs)
          retried = true
          continue
        }
      }

      // Handle server errors
      if (response.status >= 500 && attempt < config.maxRetries) {
        console.log(`Server error (${response.status}), retrying...`)
        await sleep(1000 * (attempt + 1)) // Exponential backoff
        retried = true
        continue
      }

      return { response, retried }
    } catch (error) {
      // Handle network errors
      if (attempt < config.maxRetries) {
        console.log(`Network error, retrying...`, error)
        await sleep(1000 * (attempt + 1))
        retried = true
        continue
      }
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Create an AbortController with timeout
 */
export function createTimeoutController(timeoutMs: number = config.requestTimeout): {
  controller: AbortController
  timeoutId: ReturnType<typeof setTimeout>
} {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Request timeout'))
  }, timeoutMs)

  return { controller, timeoutId }
}

/**
 * Clear timeout and return response
 */
export function clearRequestTimeout(timeoutId: ReturnType<typeof setTimeout>): void {
  clearTimeout(timeoutId)
}
