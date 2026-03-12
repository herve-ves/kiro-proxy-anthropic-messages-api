// HTTP Headers Builder (KiroProxy format)

import { release } from 'os'
import { config } from '../config'

const SDK_VERSION = '1.0.27'

/**
 * Build headers for Kiro API requests
 */
export function buildKiroHeaders(
  token: string,
  machineId: string
): Record<string, string> {
  const kiroVersion = config.kiroVersion
  const kiroTag = `KiroIDE-${kiroVersion}-${machineId}`
  const osInfo = `${process.platform}#${release()}`
  const nodeVersion = process.versions.node

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-amzn-codewhisperer-optout': 'true',
    'x-amzn-kiro-agent-mode': 'vibe',
    'x-amz-user-agent': `aws-sdk-js/${SDK_VERSION} ${kiroTag}`,
    'User-Agent': `aws-sdk-js/${SDK_VERSION} ua/2.1 os/${osInfo} lang/js md/nodejs#${nodeVersion} api/codewhispererstreaming#${SDK_VERSION} m/E ${kiroTag}`,
    'amz-sdk-invocation-id': crypto.randomUUID(),
    'amz-sdk-request': 'attempt=1; max=3',
    'Connection': 'close',
  }
}
