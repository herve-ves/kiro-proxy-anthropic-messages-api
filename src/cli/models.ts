// CLI: models subcommand
// Lists available models from Kiro API and local config

import { config } from '../config'
import { authManager } from '../auth/manager'
import { buildKiroHeaders } from '../utils/headers'
import { getMachineId } from '../utils/machine-id'

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
  console.log('Initializing authentication...')

  try {
    await authManager.initialize()
  } catch (error) {
    console.error('Failed to initialize authentication:', error)
    process.exit(1)
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('Kiro Available Models (from ListAvailableModels API)')
  console.log('='.repeat(60))

  try {
    const kiroModels = await fetchKiroModels()
    if (kiroModels.length === 0) {
      console.log('No models available from Kiro API')
    } else {
      for (const model of kiroModels) {
        const tokens = model.tokenLimits?.maxInputTokens
          ? `${model.tokenLimits.maxInputTokens.toLocaleString()} tokens`
          : 'N/A'
        console.log(`  - ${model.modelId} (${model.modelName || 'N/A'}) - rate: ${model.rateMultiplier || 1}x, context: ${tokens}`)
      }
    }
  } catch (error) {
    console.error('Failed to fetch Kiro models:', error)
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('Model Mapping (Anthropic -> Kiro)')
  console.log('='.repeat(60))
  console.log(`Default model: ${config.defaultModel}`)
  console.log('')

  const mappingEntries = Object.entries(config.modelMapping)
  console.log(`Total mappings: ${mappingEntries.length}`)
  console.log('')

  for (const [anthropicModel, kiroModel] of mappingEntries) {
    console.log(`  ${anthropicModel} -> ${kiroModel}`)
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('Model Max Context Tokens')
  console.log('='.repeat(60))
  console.log(`Default: ${config.defaultMaxContextTokens}`)
  console.log('')

  const contextEntries = Object.entries(config.modelMaxContextTokens)
  for (const [model, tokens] of contextEntries) {
    console.log(`  ${model}: ${tokens.toLocaleString()}`)
  }

  console.log('')
}
