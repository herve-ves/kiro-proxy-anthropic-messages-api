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

    // 1. Load Kiro Desktop (Social Login) credentials
    const kiroDesktopCreds = await loadKiroDesktopCredentials(config.kiroDesktopCredsFile)
    if (kiroDesktopCreds && kiroDesktopCreds.authMethod !== 'IdC') {
      try {
        const token = await refreshKiroDesktopToken(kiroDesktopCreds)
        this.cachedTokens.push({
          ...token,
          credentials: kiroDesktopCreds,
        })
        console.log('Loaded Kiro Desktop (Social) credentials')
      } catch (error) {
        console.error('Failed to refresh Kiro Desktop token:', error)
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
          })
          console.log('Loaded Enterprise IdC credentials')
        } catch (error) {
          console.error('Failed to refresh Enterprise IdC token:', error)
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
        })
        console.log('Loaded kiro-cli credentials')
      } catch (error) {
        console.error('Failed to refresh kiro-cli token:', error)
      }
    }

    if (this.cachedTokens.length === 0) {
      throw new Error('No valid credentials found. Please configure one of: KIRO_DESKTOP_CREDS_FILE, KIRO_IDC_CREDS_FILE, or KIRO_CLI_DB_FILE')
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
