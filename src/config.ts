// Configuration Management

import { homedir } from 'os'
import { join } from 'path'

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

  // Credentials
  region: process.env.KIRO_REGION || 'us-east-1',
  credsFile: process.env.KIRO_CREDS_FILE || join(homedir(), '.kiro', 'credentials.json'),
  sqliteDb: process.env.KIRO_CLI_DB_FILE,

  // Default paths for credentials
  kiroDesktopCredsPath: join(homedir(), '.kiro', 'credentials.json'),
  awsSsoOidcDbPath: join(homedir(), '.kiro-cli', 'kiro-cli.db'),

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
