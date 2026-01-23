// Usage Tracking Database Service

import { Database } from 'bun:sqlite'
import { config } from '../config'
import { logger } from './logger'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

export interface UsageRecord {
  id?: number
  timestamp: number
  messageId: string
  accountId: string
  model: string
  credits: number | null
  contextUsagePercentage: number | null
}

let db: Database | null = null

/**
 * Initialize the usage database
 */
export function initUsageDb(): void {
  if (db) return

  // Ensure directory exists
  const dbDir = dirname(config.usageDbFile)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(config.usageDbFile)

  // Create table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      model TEXT NOT NULL,
      credits REAL,
      context_usage_percentage REAL
    )
  `)

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_account ON usage(account_id)`)

  logger.info({ dbFile: config.usageDbFile }, 'Usage database initialized')
}

/**
 * Record usage data
 */
export function recordUsage(record: Omit<UsageRecord, 'id'>): void {
  if (!db) {
    initUsageDb()
  }

  try {
    const stmt = db!.prepare(`
      INSERT INTO usage (timestamp, message_id, account_id, model, credits, context_usage_percentage)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      record.timestamp,
      record.messageId,
      record.accountId,
      record.model,
      record.credits,
      record.contextUsagePercentage
    )

    logger.trace({ record }, 'Usage recorded')
  } catch (error) {
    logger.error({ error }, 'Failed to record usage')
  }
}

/**
 * Get usage summary for a time range
 */
export function getUsageSummary(startTime?: number, endTime?: number, accountId?: string): {
  totalCredits: number
  requestCount: number
} {
  if (!db) {
    initUsageDb()
  }

  let query = `
    SELECT
      COALESCE(SUM(credits), 0) as totalCredits,
      COUNT(*) as requestCount
    FROM usage
  `

  const conditions: string[] = []
  const params: (number | string)[] = []

  if (startTime !== undefined) {
    conditions.push('timestamp >= ?')
    params.push(startTime)
  }
  if (endTime !== undefined) {
    conditions.push('timestamp <= ?')
    params.push(endTime)
  }
  if (accountId !== undefined) {
    conditions.push('account_id = ?')
    params.push(accountId)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }

  const result = db!.prepare(query).get(...params) as {
    totalCredits: number
    requestCount: number
  }

  return result
}

/**
 * Get recent usage records
 */
export function getRecentUsage(limit: number = 100, accountId?: string): UsageRecord[] {
  if (!db) {
    initUsageDb()
  }

  let query = `
    SELECT
      id,
      timestamp,
      message_id as messageId,
      account_id as accountId,
      model,
      credits,
      context_usage_percentage as contextUsagePercentage
    FROM usage
  `

  const params: (number | string)[] = []

  if (accountId !== undefined) {
    query += ' WHERE account_id = ?'
    params.push(accountId)
  }

  query += ' ORDER BY timestamp DESC LIMIT ?'
  params.push(limit)

  const rows = db!.prepare(query).all(...params) as UsageRecord[]

  return rows
}

/**
 * Close the database connection
 */
export function closeUsageDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
