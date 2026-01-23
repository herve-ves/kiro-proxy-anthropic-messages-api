// Configuration Management

import { homedir } from 'os'
import { join } from 'path'

function expandTilde(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined
  if (filePath.startsWith('~/')) {
    return join(homedir(), filePath.slice(2))
  }
  return filePath
}

export const config = {
  // Server
  port: Number(process.env.PORT) || 8000,
  proxyApiKey: process.env.PROXY_API_KEY || 'my-secret-key',

  // Kiro Q API (KiroProxy endpoint)
  kiroApiUrl: 'https://q.us-east-1.amazonaws.com/generateAssistantResponse',
  kiroModelsUrl: 'https://q.us-east-1.amazonaws.com/ListAvailableModels',

  // Token refresh URLs
  kiroRefreshUrl: (region: string) =>
    `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`,
  awsSsoOidcUrl: (region: string) =>
    `https://oidc.${region}.amazonaws.com/token`,

  // Region
  region: process.env.KIRO_REGION || 'us-east-1',

  // Authentication credentials (three separate methods)
  // 1. Kiro Desktop (Social Login) - JSON file
  kiroDesktopCredsFile: expandTilde(process.env.KIRO_DESKTOP_CREDS_FILE) || join(homedir(), '.kiro', 'credentials.json'),
  // 2. Enterprise IdC (AWS Identity Center) - JSON file
  kiroIdcCredsFile: expandTilde(process.env.KIRO_IDC_CREDS_FILE),
  // 3. kiro-cli (AWS SSO OIDC) - SQLite database
  kiroCliDbFile: expandTilde(process.env.KIRO_CLI_DB_FILE) || join(homedir(), '.kiro-cli', 'kiro-cli.db'),

  // Timeouts
  requestTimeout: 300000, // 5 minutes in ms
  maxRetries: 2,

  // Kiro API limits
  maxTools: 50,
  maxToolDescriptionLength: 500,

  // Model mapping
  defaultModel: 'claude-sonnet-4',
  modelMapping: {
    'claude-sonnet-4': 'claude-sonnet-4',
    'claude-3-5-sonnet-20241022': 'claude-sonnet-4',
    'claude-3-5-sonnet-latest': 'claude-sonnet-4',
    'claude-3-opus-20240229': 'claude-sonnet-4',
    'claude-3-sonnet-20240229': 'claude-sonnet-4',
    'claude-3-haiku-20240307': 'claude-sonnet-4',
  } as Record<string, string>,

  // Kiro version for headers
  kiroVersion: '0.8.0',
}

export function getKiroModel(anthropicModel: string): string {
  return config.modelMapping[anthropicModel] || config.defaultModel
}
