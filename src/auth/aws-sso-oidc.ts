// AWS SSO OIDC Authentication

import { config } from '../config'
import { logger } from '../utils/logger'
import type { AwsSsoOidcCredentials } from '../types/kiro'
import type { AuthToken } from '../types/common'

export async function refreshAwsSsoOidcToken(
  credentials: AwsSsoOidcCredentials
): Promise<AuthToken> {
  const region = credentials.region || config.region

  const response = await fetch(config.awsSsoOidcUrl(region), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to refresh AWS SSO OIDC token: ${response.status} ${text}`)
  }

  const data = await response.json() as {
    access_token: string
    expires_in?: number
    refresh_token?: string
  }

  // Calculate expiration time (default 1 hour if not provided)
  const expiresIn = data.expires_in || 3600
  const expiresAt = Date.now() + expiresIn * 1000

  return {
    accessToken: data.access_token,
    expiresAt,
    type: 'aws-sso-oidc',
    region,
  }
}

export async function loadAwsSsoOidcCredentials(
  dbPath: string
): Promise<AwsSsoOidcCredentials[]> {
  try {
    const file = Bun.file(dbPath)
    if (!(await file.exists())) {
      return []
    }

    // Use Bun's SQLite support
    const { Database } = await import('bun:sqlite')
    const db = new Database(dbPath, { readonly: true })

    try {
      // Query the credentials table
      const rows = db.query(`
        SELECT
          access_token as accessToken,
          refresh_token as refreshToken,
          expires_at as expiresAt,
          client_id as clientId,
          client_secret as clientSecret,
          region,
          start_url as startUrl
        FROM credentials
        WHERE refresh_token IS NOT NULL
        ORDER BY expires_at DESC
      `).all() as AwsSsoOidcCredentials[]

      return rows.map(row => ({
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        expiresAt: typeof row.expiresAt === 'string'
          ? new Date(row.expiresAt).getTime()
          : row.expiresAt,
        clientId: row.clientId,
        clientSecret: row.clientSecret,
        region: row.region || config.region,
        startUrl: row.startUrl,
      }))
    } finally {
      db.close()
    }
  } catch (error) {
    logger.error({ error }, 'Failed to load AWS SSO OIDC credentials')
    return []
  }
}
