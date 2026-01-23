// Authentication Manager

import { config } from '../config'
import { logger } from '../utils/logger'
import type { AuthToken } from '../types/common'
import type { KiroDesktopCredentials, AwsSsoOidcCredentials } from '../types/kiro'
import { refreshKiroDesktopToken, loadKiroDesktopCredentials } from './kiro-desktop'
import { refreshAwsSsoOidcToken, loadAwsSsoOidcCredentials } from './aws-sso-oidc'
import { createHash } from 'crypto'

interface CachedToken extends AuthToken {
  credentials: KiroDesktopCredentials | AwsSsoOidcCredentials
  accountId: string  // Stable identifier for the account
}

/**
 * Generate a stable account ID from credentials
 */
function generateAccountId(creds: KiroDesktopCredentials | AwsSsoOidcCredentials, type: string): string {
  // Use a hash of stable credential fields
  let identifier: string

  if ('clientIdHash' in creds && creds.clientIdHash) {
    // Enterprise IdC - use clientIdHash
    identifier = `idc-${creds.clientIdHash.slice(0, 8)}`
  } else if ('startUrl' in creds && creds.startUrl) {
    // AWS SSO OIDC - use hash of startUrl + clientId
    const hash = createHash('sha256').update(`${creds.startUrl}:${creds.clientId}`).digest('hex').slice(0, 8)
    identifier = `sso-${hash}`
  } else if ('provider' in creds && creds.provider) {
    // Kiro Desktop with provider
    identifier = `desktop-${creds.provider}`
  } else {
    // Fallback: hash of refreshToken (stable per account)
    const hash = createHash('sha256').update(creds.refreshToken).digest('hex').slice(0, 8)
    identifier = `${type}-${hash}`
  }

  return identifier
}

class AuthManager {
  private cachedTokens: CachedToken[] = []
  private currentTokenIndex = 0
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    // 1. Load Kiro Desktop (Social Login) credentials
    const kiroDesktopCreds = await loadKiroDesktopCredentials(config.kiroDesktopCredsFile)
    if (kiroDesktopCreds && kiroDesktopCreds.authMethod !== 'IdC') {
      try {
        const token = await refreshKiroDesktopToken(kiroDesktopCreds)
        this.cachedTokens.push({
          ...token,
          credentials: kiroDesktopCreds,
          accountId: generateAccountId(kiroDesktopCreds, token.type),
        })
        logger.info('Loaded Kiro Desktop (Social) credentials')
      } catch (error) {
        logger.error({ error }, 'Failed to refresh Kiro Desktop token')
      }
    }

    // 2. Load Enterprise IdC credentials (if configured)
    if (config.kiroIdcCredsFile) {
      const idcCreds = await loadKiroDesktopCredentials(config.kiroIdcCredsFile)
      if (idcCreds) {
        try {
          const token = await refreshKiroDesktopToken(idcCreds)
          this.cachedTokens.push({
            ...token,
            credentials: idcCreds,
            accountId: generateAccountId(idcCreds, token.type),
          })
          logger.info('Loaded Enterprise IdC credentials')
        } catch (error) {
          logger.error({ error }, 'Failed to refresh Enterprise IdC token')
        }
      }
    }

    // 3. Load kiro-cli (AWS SSO OIDC) credentials from SQLite
    const kiroCliCreds = await loadAwsSsoOidcCredentials(config.kiroCliDbFile)
    for (const creds of kiroCliCreds) {
      try {
        const token = await refreshAwsSsoOidcToken(creds)
        this.cachedTokens.push({
          ...token,
          credentials: creds,
          accountId: generateAccountId(creds, token.type),
        })
        logger.info('Loaded kiro-cli credentials')
      } catch (error) {
        logger.error({ error }, 'Failed to refresh kiro-cli token')
      }
    }

    if (this.cachedTokens.length === 0) {
      throw new Error('No valid credentials found. Please configure one of: KIRO_DESKTOP_CREDS_FILE, KIRO_IDC_CREDS_FILE, or KIRO_CLI_DB_FILE')
    }

    this.initialized = true
    logger.info({ count: this.cachedTokens.length }, 'Initialized credentials')
  }

  async getToken(): Promise<string> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (this.cachedTokens.length === 0) {
      throw new Error('No credentials available')
    }

    const cached = this.cachedTokens[this.currentTokenIndex]

    // Check if token is about to expire (5 minutes buffer)
    const bufferMs = 5 * 60 * 1000
    if (cached.expiresAt - Date.now() < bufferMs) {
      try {
        await this.refreshCurrentToken()
      } catch (error) {
        logger.error({ error }, 'Failed to refresh token, trying next credential')
        this.rotateToNextToken()
        return this.getToken()
      }
    }

    return this.cachedTokens[this.currentTokenIndex].accessToken
  }

  private async refreshCurrentToken(): Promise<void> {
    const cached = this.cachedTokens[this.currentTokenIndex]

    let newToken: AuthToken
    if (cached.type === 'kiro-desktop') {
      newToken = await refreshKiroDesktopToken(cached.credentials as KiroDesktopCredentials)
    } else {
      newToken = await refreshAwsSsoOidcToken(cached.credentials as AwsSsoOidcCredentials)
    }

    this.cachedTokens[this.currentTokenIndex] = {
      ...newToken,
      credentials: cached.credentials,
      accountId: cached.accountId,
    }
  }

  rotateToNextToken(): void {
    if (this.cachedTokens.length > 1) {
      this.currentTokenIndex = (this.currentTokenIndex + 1) % this.cachedTokens.length
      logger.debug({ current: this.currentTokenIndex + 1, total: this.cachedTokens.length }, 'Rotated to next credential')
    }
  }

  async handleAuthError(): Promise<void> {
    // Try to refresh current token first
    try {
      await this.refreshCurrentToken()
      return
    } catch {
      // If refresh fails, rotate to next token
      this.rotateToNextToken()
    }
  }

  getRegion(): string {
    if (this.cachedTokens.length === 0) {
      return config.region
    }
    return this.cachedTokens[this.currentTokenIndex].region
  }

  getCurrentAccountId(): string {
    if (this.cachedTokens.length === 0) {
      return 'unknown'
    }
    const cached = this.cachedTokens[this.currentTokenIndex]
    return cached.accountId
  }
}

export const authManager = new AuthManager()
