// HTTP Headers Builder (KiroProxy format)

import { config } from '../config'

/**
 * Build headers for Kiro API requests
 */
export function buildKiroHeaders(
  token: string,
  machineId: string
): Record<string, string> {
  const kiroVersion = config.kiroVersion

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-amzn-codewhisperer-optout': 'true',
    'x-amzn-kiro-agent-mode': 'vibe',
    'x-amz-user-agent': `aws-sdk-js/1.0.0 KiroIDE-${kiroVersion}-${machineId}`,
    'User-Agent': `aws-sdk-js/1.0.0 ua/2.1 os/${getOsName()} lang/js md/nodejs api/codewhispererruntime#1.0.0 m/E KiroIDE-${kiroVersion}-${machineId}`,
    'amz-sdk-invocation-id': crypto.randomUUID(),
    'amz-sdk-request': 'attempt=1; max=1',
    'Connection': 'close',
  }
}

/**
 * Get OS name for User-Agent
 */
function getOsName(): string {
  const platform = process.platform
  switch (platform) {
    case 'darwin':
      return 'macos'
    case 'win32':
      return 'windows'
    case 'linux':
      return 'linux'
    default:
      return platform
  }
}
