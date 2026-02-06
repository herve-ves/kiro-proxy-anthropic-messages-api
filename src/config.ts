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

// Kiro supported models
const KIRO_MODELS = new Set([
  'auto',
  'claude-sonnet-4.5',
  'claude-sonnet-4',
  'claude-haiku-4.5',
  'claude-opus-4.5',
  'claude-opus-4.6'
])

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

  // Model mapping (Anthropic model -> Kiro model)
  defaultModel: 'claude-sonnet-4',
  modelMapping: {
    // Claude 4 Sonnet
    'claude-sonnet-4-20250514': 'claude-sonnet-4',
    'claude-sonnet-4-0': 'claude-sonnet-4',
    'claude-sonnet-4-5-20250929': 'claude-sonnet-4.5',
    'claude-sonnet-4-5': 'claude-sonnet-4.5',
    // Claude 4 Opus
    'claude-opus-4-20250514': 'claude-opus-4.5',
    'claude-opus-4-0': 'claude-opus-4.5',
    'claude-opus-4-1-20250805': 'claude-opus-4.5',
    'claude-opus-4-1': 'claude-opus-4.5',
    'claude-opus-4-5-20251101': 'claude-opus-4.5',
    'claude-opus-4-5': 'claude-opus-4.5',
    'claude-opus-4-6': 'claude-opus-4.6',
    'claude-opus-4-6-v1': 'claude-opus-4.6',
    // Claude 4 Haiku
    'claude-haiku-4-5-20251001': 'claude-haiku-4.5',
    'claude-haiku-4-5': 'claude-haiku-4.5',
    // Aliases
    'sonnet': 'claude-sonnet-4',
    'haiku': 'claude-haiku-4.5',
    'opus': 'claude-opus-4.5',
  } as Record<string, string>,

  // Model max context tokens
  modelMaxContextTokens: {
    'claude-sonnet-4': 200000,
    'claude-sonnet-4.5': 200000,
    'claude-opus-4.5': 200000,
    'claude-opus-4.6': 200000,
    'claude-haiku-4.5': 200000,
  } as Record<string, number>,
  defaultMaxContextTokens: 200000,

  // Usage tracking database
  usageDbFile: expandTilde(process.env.USAGE_DB_FILE) || join(homedir(), '.kiro-proxy', 'usage.db'),

  // Kiro version for headers
  kiroVersion: '0.8.0',
}

export function getKiroModel(anthropicModel: string): string {
  if (!anthropicModel) {
    return config.defaultModel
  }

  // Check explicit mapping first
  if (config.modelMapping[anthropicModel]) {
    return config.modelMapping[anthropicModel]
  }

  // Already a Kiro model
  if (KIRO_MODELS.has(anthropicModel)) {
    return anthropicModel
  }

  // Smart fallback based on model name
  const modelLower = anthropicModel.toLowerCase()
  if (modelLower.includes('opus')) {
    return 'claude-opus-4.6'
  }
  if (modelLower.includes('haiku')) {
    return 'claude-haiku-4.5'
  }
  if (modelLower.includes('sonnet')) {
    return modelLower.includes('4.5') || modelLower.includes('4-5')
      ? 'claude-sonnet-4.5'
      : 'claude-sonnet-4'
  }

  return config.defaultModel
}

export function getModelMaxContextTokens(model: string): number {
  return config.modelMaxContextTokens[model] || config.defaultMaxContextTokens
}
