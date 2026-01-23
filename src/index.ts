// Kiro to Anthropic API Gateway
// Main Entry Point

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config'
import { authManager } from './auth/manager'
import { messagesRouter } from './routes/messages'
import { logger } from './utils/logger'
import { initUsageDb, closeUsageDb } from './utils/usage-db'

const app = new Hono()

// CORS middleware
app.use('*', cors())

// API Key validation middleware
app.use('/v1/*', async (c, next) => {
  const apiKey = c.req.header('x-api-key') || c.req.header('authorization')?.replace('Bearer ', '')

  if (!apiKey || apiKey !== config.proxyApiKey) {
    return c.json(
      {
        type: 'error',
        error: {
          type: 'authentication_error',
          message: 'Invalid API key',
        },
      },
      401
    )
  }

  await next()
})

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Kiro to Anthropic API Gateway',
    version: '1.0.0',
    endpoints: {
      messages: '/v1/messages',
      health: '/health',
    },
  })
})

// Mount messages router
app.route('/v1/messages', messagesRouter)

// Initialize auth and start server
async function main() {
  logger.info('Initializing authentication...')

  try {
    await authManager.initialize()
    logger.info('Authentication initialized successfully')
  } catch (error) {
    logger.error({ error }, 'Failed to initialize authentication')
    logger.error('Please ensure you have valid Kiro credentials configured.')
    process.exit(1)
  }

  // Initialize usage tracking database
  initUsageDb()

  logger.info({ port: config.port }, 'Starting server...')
  logger.debug({ apiKey: `...${config.proxyApiKey.slice(-4)}` }, 'API Key')

  Bun.serve({
    port: config.port,
    fetch: app.fetch,
  })

  logger.info({ url: `http://localhost:${config.port}` }, 'Server running')
  logger.info('')
  logger.info('Usage with Claude Code:')
  logger.info(`  ANTHROPIC_BASE_URL=http://localhost:${config.port} ANTHROPIC_AUTH_TOKEN=${config.proxyApiKey} claude`)
  logger.info('')
  logger.info('Test with curl:')
  logger.info(`  curl -X POST http://localhost:${config.port}/v1/messages \\`)
  logger.info(`    -H "x-api-key: ${config.proxyApiKey}" \\`)
  logger.info(`    -H "Content-Type: application/json" \\`)
  logger.info(`    -d '{"model":"claude-sonnet-4","max_tokens":1024,"messages":[{"role":"user","content":"Hello!"}]}'`)

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...')
    closeUsageDb()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => logger.error({ err }, 'Fatal error'))
