// Authentication Manager

import { config } from '../config'
import type { AuthToken } from '../types/common'
import type { KiroDesktopCredentials, AwsSsoOidcCredentials } from '../types/kiro'
import { refreshKiroDesktopToken, loadKiroDesktopCredentials } from './kiro-desktop'
import { refreshAwsSsoOidcToken, loadAwsSsoOidcCredentials } from './aws-sso-oidc'

interface CachedToken extends AuthToken {
  credentials: KiroDesktopCredentials | AwsSsoOidcCredentials
}

class AuthManager {
  private cachedTokens: CachedToken[] = []
  private currentTokenIndex = 0
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    // Load Kiro Desktop credentials
    const kiroDesktopCreds = await loadKiroDesktopCredentials(config.kiroDesktopCredsPath)
    if (kiroDesktopCreds) {
      try {
        const token = await refreshKiroDesktopToken(kiroDesktopCreds)
        this.cachedTokens.push({
          ...token,
          credentials: kiroDesktopCreds,
        })
        console.log('Loaded Kiro Desktop credentials')
      } catch (error) {
        console.error('Failed to refresh Kiro Desktop token:', error)
      }
    }

    // Load AWS SSO OIDC credentials
    const awsSsoOidcCreds = await loadAwsSsoOidcCredentials(config.awsSsoOidcDbPath)
    for (const creds of awsSsoOidcCreds) {
      try {
        const token = await refreshAwsSsoOidcToken(creds)
        this.cachedTokens.push({
          ...token,
          credentials: creds,
        })
        console.log('Loaded AWS SSO OIDC credentials')
      } catch (error) {
        console.error('Failed to refresh AWS SSO OIDC token:', error)
      }
    }

    // Also try custom credentials file if specified
    if (config.credsFile && config.credsFile !== config.kiroDesktopCredsPath) {
      const customCreds = await loadKiroDesktopCredentials(config.credsFile)
      if (customCreds) {
        try {
          const token = await refreshKiroDesktopToken(customCreds)
          this.cachedTokens.push({
            ...token,
            credentials: customCreds,
          })
          console.log('Loaded custom credentials file')
        } catch (error) {
          console.error('Failed to refresh custom credentials:', error)
        }
      }
    }

    // Try custom SQLite DB if specified
    if (config.sqliteDb && config.sqliteDb !== config.awsSsoOidcDbPath) {
      const customSsoCreds = await loadAwsSsoOidcCredentials(config.sqliteDb)
      for (const creds of customSsoCreds) {
        try {
          const token = await refreshAwsSsoOidcToken(creds)
          this.cachedTokens.push({
            ...token,
            credentials: creds,
          })
          console.log('Loaded custom SQLite credentials')
        } catch (error) {
          console.error('Failed to refresh custom SQLite credentials:', error)
        }
      }
    }

    if (this.cachedTokens.length === 0) {
      throw new Error('No valid credentials found. Please configure Kiro Desktop or AWS SSO OIDC credentials.')
    }

    this.initialized = true
    console.log(`Initialized with ${this.cachedTokens.length} credential(s)`)
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
        console.error('Failed to refresh token, trying next credential:', error)
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
    }
  }

  rotateToNextToken(): void {
    if (this.cachedTokens.length > 1) {
      this.currentTokenIndex = (this.currentTokenIndex + 1) % this.cachedTokens.length
      console.log(`Rotated to credential ${this.currentTokenIndex + 1}/${this.cachedTokens.length}`)
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
}

export const authManager = new AuthManager()
