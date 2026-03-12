// Profile ARN Discovery via ListAvailableProfiles API

import { buildKiroHeaders } from '../utils/headers'
import { getMachineId } from '../utils/machine-id'
import { logger } from '../utils/logger'

const REGIONS = ['us-east-1', 'eu-central-1']

interface ProfileResponse {
  nextToken: string | null
  profiles: Array<{
    arn: string
    profileName: string
  }>
}

/**
 * Discover the user's profile ARN by calling ListAvailableProfiles across regions.
 * Returns the first profile ARN found, or undefined if none.
 */
export async function discoverProfileArn(token: string): Promise<string | undefined> {
  const machineId = getMachineId()
  const headers = buildKiroHeaders(token, machineId)

  for (const region of REGIONS) {
    const url = `https://q.${region}.amazonaws.com/ListAvailableProfiles`
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        logger.debug({ region, status: response.status }, 'ListAvailableProfiles failed')
        continue
      }

      const data = await response.json() as ProfileResponse
      if (data.profiles && data.profiles.length > 0) {
        const arn = data.profiles[0].arn
        logger.info({ region, profileArn: arn }, 'Discovered profile ARN')
        return arn
      }
    } catch (error) {
      logger.debug({ region, error }, 'ListAvailableProfiles error')
    }
  }

  logger.warn('No profile ARN found in any region')
  return undefined
}
