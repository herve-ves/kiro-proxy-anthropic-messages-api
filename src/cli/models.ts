// CLI: models subcommand
// Lists available models from Kiro API and local config

import { config } from '../config'
import { authManager } from '../auth/manager'
import { buildKiroHeaders } from '../utils/headers'
import { getMachineId } from '../utils/machine-id'
import { logger } from '../utils/logger'

interface KiroModel {
  modelId: string
  modelName?: string
  description?: string
  rateMultiplier?: number
  tokenLimits?: {
    maxInputTokens: number | null
    maxOutputTokens: number | null
  }
}

interface ListModelsResponse {
  models?: KiroModel[]
  defaultModel?: KiroModel
}

async function fetchKiroModels(): Promise<KiroModel[]> {
  const token = await authManager.getToken()
  const machineId = getMachineId()
  const headers = buildKiroHeaders(token, machineId)

  // Use GET with query params like KiroProxy does
  const url = `${config.kiroModelsUrl}?origin=AI_EDITOR`

  const response = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}\n${text}`)
  }

  const data = await response.json() as ListModelsResponse
  return data.models || []
}

export async function runModelsCommand(): Promise<void> {
  logger.info('Initializing authentication...')

  try {
    await authManager.initialize()
  } catch (error) {
    logger.error({ error }, 'Failed to initialize authentication')
    process.exit(1)
  }

  logger.info('')
  logger.info('='.repeat(60))
  logger.info('Kiro Available Models (from ListAvailableModels API)')
  logger.info('='.repeat(60))

  try {
    const kiroModels = await fetchKiroModels()
    if (kiroModels.length === 0) {
      logger.info('No models available from Kiro API')
    } else {
      for (const model of kiroModels) {
        const tokens = model.tokenLimits?.maxInputTokens
          ? `${model.tokenLimits.maxInputTokens.toLocaleString()} tokens`
          : 'N/A'
        logger.info(`  - ${model.modelId} (${model.modelName || 'N/A'}) - rate: ${model.rateMultiplier || 1}x, context: ${tokens}`)
      }
    }
  } catch (error) {
    logger.error({ error }, 'Failed to fetch Kiro models')
  }

  logger.info('')
  logger.info('='.repeat(60))
  logger.info('Model Mapping (Anthropic -> Kiro)')
  logger.info('='.repeat(60))
  logger.info(`Default model: ${config.defaultModel}`)
  logger.info('')

  const mappingEntries = Object.entries(config.modelMapping)
  logger.info(`Total mappings: ${mappingEntries.length}`)
  logger.info('')

  for (const [anthropicModel, kiroModel] of mappingEntries) {
    logger.info(`  ${anthropicModel} -> ${kiroModel}`)
  }

  logger.info('')
  logger.info('='.repeat(60))
  logger.info('Model Max Context Tokens')
  logger.info('='.repeat(60))
  logger.info(`Default: ${config.defaultMaxContextTokens}`)
  logger.info('')

  const contextEntries = Object.entries(config.modelMaxContextTokens)
  for (const [model, tokens] of contextEntries) {
    logger.info(`  ${model}: ${tokens.toLocaleString()}`)
  }

  logger.info('')
}
