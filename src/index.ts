// Kiro to Anthropic API Gateway
// Main Entry Point

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config'
import { authManager } from './auth/manager'
import { messagesRouter } from './routes/messages'

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
  console.log('Initializing authentication...')

  try {
    await authManager.initialize()
    console.log('Authentication initialized successfully')
  } catch (error) {
    console.error('Failed to initialize authentication:', error)
    console.error('Please ensure you have valid Kiro credentials configured.')
    process.exit(1)
  }

  console.log(`Starting server on port ${config.port}...`)
  console.log(`API Key: ${config.proxyApiKey.slice(0, 4)}...${config.proxyApiKey.slice(-4)}`)

  Bun.serve({
    port: config.port,
    fetch: app.fetch,
  })

  console.log(`Server running at http://localhost:${config.port}`)
  console.log('')
  console.log('Usage with Claude Code:')
  console.log(`  ANTHROPIC_BASE_URL=http://localhost:${config.port} ANTHROPIC_API_KEY=${config.proxyApiKey} claude`)
  console.log('')
  console.log('Test with curl:')
  console.log(`  curl -X POST http://localhost:${config.port}/v1/messages \\`)
  console.log(`    -H "x-api-key: ${config.proxyApiKey}" \\`)
  console.log(`    -H "Content-Type: application/json" \\`)
  console.log(`    -d '{"model":"claude-sonnet-4","max_tokens":1024,"messages":[{"role":"user","content":"Hello!"}]}'`)
}

main().catch(console.error)
