// Kiro Desktop Authentication

import { homedir } from 'os'
import { join } from 'path'
import { config } from '../config'
import { logger } from '../utils/logger'
import type { KiroDesktopCredentials } from '../types/kiro'
import type { AuthToken } from '../types/common'

export async function refreshKiroDesktopToken(
  credentials: KiroDesktopCredentials
): Promise<AuthToken> {
  const region = credentials.region || config.region

  // Check if this is IdC (Enterprise) authentication
  if (credentials.authMethod === 'IdC' && credentials.clientId && credentials.clientSecret) {
    return refreshIdcToken(credentials, region)
  }

  // Standard Kiro Desktop refresh
  const response = await fetch(config.kiroRefreshUrl(region), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refreshToken: credentials.refreshToken,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to refresh Kiro Desktop token: ${response.status} ${text}`)
  }

  const data = await response.json() as {
    accessToken: string
    expiresIn?: number
  }

  // Calculate expiration time (default 1 hour if not provided)
  const expiresIn = data.expiresIn || 3600
  const expiresAt = Date.now() + expiresIn * 1000

  return {
    accessToken: data.accessToken,
    expiresAt,
    type: 'kiro-desktop',
    region,
  }
}

async function refreshIdcToken(
  credentials: KiroDesktopCredentials,
  region: string
): Promise<AuthToken> {
  const url = config.awsSsoOidcUrl(region)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grantType: 'refresh_token',
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: credentials.refreshToken,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to refresh IdC token: ${response.status} ${text}`)
  }

  const data = await response.json() as {
    accessToken: string
    expiresIn?: number
  }

  const expiresIn = data.expiresIn || 3600
  const expiresAt = Date.now() + expiresIn * 1000

  return {
    accessToken: data.accessToken,
    expiresAt,
    type: 'kiro-desktop',
    region,
  }
}

export async function loadKiroDesktopCredentials(
  filePath: string
): Promise<KiroDesktopCredentials | null> {
  try {
    const file = Bun.file(filePath)
    if (!(await file.exists())) {
      return null
    }

    const content = await file.json() as {
      accessToken?: string
      refreshToken?: string
      region?: string
      authMethod?: 'IdC' | 'social'
      clientIdHash?: string
      provider?: string
    }

    if (!content.accessToken || !content.refreshToken) {
      return null
    }

    const credentials: KiroDesktopCredentials = {
      accessToken: content.accessToken,
      refreshToken: content.refreshToken,
      region: content.region,
      authMethod: content.authMethod,
      clientIdHash: content.clientIdHash,
      provider: content.provider,
    }

    // For IdC authentication, load clientId and clientSecret from device registration file
    if (content.authMethod === 'IdC' && content.clientIdHash) {
      const deviceRegPath = join(homedir(), '.aws', 'sso', 'cache', `${content.clientIdHash}.json`)
      const deviceRegFile = Bun.file(deviceRegPath)

      if (await deviceRegFile.exists()) {
        const deviceReg = await deviceRegFile.json() as {
          clientId?: string
          clientSecret?: string
        }

        if (deviceReg.clientId && deviceReg.clientSecret) {
          credentials.clientId = deviceReg.clientId
          credentials.clientSecret = deviceReg.clientSecret
          logger.debug('Loaded IdC device registration')
        }
      } else {
        logger.warn({ path: deviceRegPath }, 'IdC device registration file not found')
      }
    }

    return credentials
  } catch {
    return null
  }
}
