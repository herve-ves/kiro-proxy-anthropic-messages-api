// Machine ID Generation

import { createHash } from 'crypto'
import { hostname } from 'os'

let cachedMachineId: string | null = null

/**
 * Get or generate a stable machine ID
 */
export function getMachineId(): string {
  if (cachedMachineId) {
    return cachedMachineId
  }

  cachedMachineId = generateMachineId()
  return cachedMachineId
}

/**
 * Generate a machine ID based on hostname and environment
 */
function generateMachineId(): string {
  // Try to create a stable ID from hostname
  const host = hostname()
  const user = process.env.USER || process.env.USERNAME || 'unknown'

  // Create a hash of hostname + user for stability
  const hash = createHash('sha256')
    .update(`${host}-${user}`)
    .digest('hex')
    .slice(0, 16)

  return hash
}

/**
 * Reset cached machine ID (for testing)
 */
export function resetMachineId(): void {
  cachedMachineId = null
}
