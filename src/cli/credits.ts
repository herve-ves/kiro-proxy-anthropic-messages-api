// CLI: credits subcommand
// Query Kiro usage limits and balance

import { authManager } from '../auth/manager'
import { buildKiroHeaders } from '../utils/headers'
import { getMachineId } from '../utils/machine-id'
import { logger } from '../utils/logger'

const USAGE_LIMITS_URL = 'https://q.us-east-1.amazonaws.com/getUsageLimits'
const LOW_BALANCE_THRESHOLD = 0.2

interface UsageBreakdown {
  usageLimitWithPrecision?: number
  currentUsageWithPrecision?: number
  freeTrialInfo?: {
    usageLimitWithPrecision?: number
    currentUsageWithPrecision?: number
  }
  bonuses?: Array<{
    usageLimit?: number
    currentUsage?: number
  }>
}

interface UsageLimitsResponse {
  subscriptionInfo?: {
    subscriptionTitle?: string
  }
  usageBreakdownList?: UsageBreakdown[]
}

interface UsageInfo {
  subscriptionTitle: string
  usageLimit: number
  currentUsage: number
  balance: number
  isLowBalance: boolean
  freeTrialLimit: number
  freeTrialUsage: number
  bonusLimit: number
  bonusUsage: number
}

function calculateBalance(response: UsageLimitsResponse): UsageInfo {
  const subscriptionInfo = response.subscriptionInfo || {}
  const usageBreakdownList = response.usageBreakdownList || []

  let totalLimit = 0
  let totalUsage = 0
  let freeTrialLimit = 0
  let freeTrialUsage = 0
  let bonusLimit = 0
  let bonusUsage = 0

  for (const breakdown of usageBreakdownList) {
    // Base quota
    totalLimit += breakdown.usageLimitWithPrecision || 0
    totalUsage += breakdown.currentUsageWithPrecision || 0

    // Free trial quota
    const freeTrial = breakdown.freeTrialInfo
    if (freeTrial) {
      const ftLimit = freeTrial.usageLimitWithPrecision || 0
      const ftUsage = freeTrial.currentUsageWithPrecision || 0
      totalLimit += ftLimit
      totalUsage += ftUsage
      freeTrialLimit += ftLimit
      freeTrialUsage += ftUsage
    }

    // Bonus quota
    const bonuses = breakdown.bonuses || []
    for (const bonus of bonuses) {
      const bLimit = bonus.usageLimit || 0
      const bUsage = bonus.currentUsage || 0
      totalLimit += bLimit
      totalUsage += bUsage
      bonusLimit += bLimit
      bonusUsage += bUsage
    }
  }

  const balance = totalLimit - totalUsage
  const isLowBalance = totalLimit > 0 ? (balance / totalLimit) < LOW_BALANCE_THRESHOLD : false

  return {
    subscriptionTitle: subscriptionInfo.subscriptionTitle || 'Unknown',
    usageLimit: totalLimit,
    currentUsage: totalUsage,
    balance,
    isLowBalance,
    freeTrialLimit,
    freeTrialUsage,
    bonusLimit,
    bonusUsage,
  }
}

async function fetchUsageLimits(): Promise<UsageInfo> {
  const token = await authManager.getToken()
  const machineId = getMachineId()
  const headers = buildKiroHeaders(token, machineId)

  // Build URL with query params
  const url = `${USAGE_LIMITS_URL}?origin=AI_EDITOR&resourceType=AGENTIC_REQUEST`

  const response = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to fetch usage limits: ${response.status} ${response.statusText}\n${text}`)
  }

  const data = await response.json() as UsageLimitsResponse
  return calculateBalance(data)
}

export async function runCreditsCommand(): Promise<void> {
  logger.info('Initializing authentication...')

  try {
    await authManager.initialize()
  } catch (error) {
    logger.error({ error }, 'Failed to initialize authentication')
    process.exit(1)
  }

  logger.info('')
  logger.info('='.repeat(60))
  logger.info('Kiro Credits Usage')
  logger.info('='.repeat(60))

  try {
    const usage = await fetchUsageLimits()

    logger.info('')
    logger.info(`Subscription: ${usage.subscriptionTitle}`)
    logger.info('')
    logger.info(`Total Limit:   ${usage.usageLimit.toFixed(2)} credits`)
    logger.info(`Used:          ${usage.currentUsage.toFixed(2)} credits`)
    logger.info(`Balance:       ${usage.balance.toFixed(2)} credits ${usage.isLowBalance ? '⚠️ LOW' : ''}`)
    logger.info('')

    if (usage.freeTrialLimit > 0) {
      logger.info('Free Trial:')
      logger.info(`  Limit: ${usage.freeTrialLimit.toFixed(2)}, Used: ${usage.freeTrialUsage.toFixed(2)}, Remaining: ${(usage.freeTrialLimit - usage.freeTrialUsage).toFixed(2)}`)
    }

    if (usage.bonusLimit > 0) {
      logger.info('Bonus:')
      logger.info(`  Limit: ${usage.bonusLimit.toFixed(2)}, Used: ${usage.bonusUsage.toFixed(2)}, Remaining: ${(usage.bonusLimit - usage.bonusUsage).toFixed(2)}`)
    }

    // Progress bar
    const percentage = usage.usageLimit > 0 ? (usage.currentUsage / usage.usageLimit) * 100 : 0
    const barWidth = 40
    const filled = Math.round((percentage / 100) * barWidth)
    const empty = barWidth - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    logger.info('')
    logger.info(`[${bar}] ${percentage.toFixed(1)}% used`)

  } catch (error) {
    logger.error({ error }, 'Failed to fetch usage limits')
  }

  logger.info('')
}
