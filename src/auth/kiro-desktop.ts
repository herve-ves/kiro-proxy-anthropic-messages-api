// Kiro Desktop Authentication

import { config } from '../config'
import type { KiroDesktopCredentials } from '../types/kiro'
import type { AuthToken } from '../types/common'

export async function refreshKiroDesktopToken(
  credentials: KiroDesktopCredentials
): Promise<AuthToken> {
  const region = credentials.region || config.region

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
    }

    if (!content.accessToken || !content.refreshToken) {
      return null
    }

    return {
      accessToken: content.accessToken,
      refreshToken: content.refreshToken,
      region: content.region,
    }
  } catch {
    return null
  }
}
