// Colorized Terminal Output + JSON File Saving for Captured Traffic

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parseEventStream } from '../parsers/aws-event-stream'

// ANSI color helpers
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

interface CapturedRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
}

interface CapturedResponse {
  statusCode: number
  headers: Record<string, string>
  body: Buffer
}

let outputDir = 'captures'

export function setOutputDir(dir: string) {
  outputDir = dir
}

function ensureOutputDir() {
  mkdirSync(outputDir, { recursive: true })
}

/**
 * Log a captured request/response pair to terminal and save to JSON file.
 */
export function logCapture(req: CapturedRequest, res: CapturedResponse) {
  const separator = dim('─'.repeat(80))

  // Terminal output
  console.log('')
  console.log(separator)
  console.log(cyan(`${bold(req.method)} ${req.url}`))
  console.log(separator)

  // Request headers
  console.log(green('Request Headers:'))
  for (const [k, v] of Object.entries(req.headers)) {
    // Mask authorization tokens
    const displayValue = k.toLowerCase().includes('authorization') || k.toLowerCase().includes('token')
      ? v.substring(0, 20) + '...[redacted]'
      : v
    console.log(green(`  ${k}: ${displayValue}`))
  }

  // Request body
  let parsedRequestBody: unknown = undefined
  if (req.body) {
    try {
      parsedRequestBody = JSON.parse(req.body)
      console.log(green('Request Body:'))
      console.log(green(JSON.stringify(parsedRequestBody, null, 2)))
    } catch {
      console.log(green(`Request Body: (${req.body.length} bytes, non-JSON)`))
    }
  }

  // Response status
  console.log(yellow(`Response: ${res.statusCode}`))
  console.log(yellow('Response Headers:'))
  for (const [k, v] of Object.entries(res.headers)) {
    console.log(yellow(`  ${k}: ${v}`))
  }

  // Try to parse as event stream if it's a generateAssistantResponse endpoint
  let parsedEvents: ReturnType<typeof parseEventStream> | undefined
  const isEventStream = req.url.includes('generateAssistantResponse')
  const contentType = res.headers['content-type'] || ''

  if (isEventStream && res.body.length > 0) {
    try {
      const raw = new Uint8Array(res.body)
      parsedEvents = parseEventStream(raw)

      console.log(magenta('Parsed Event Stream:'))
      if (parsedEvents.content.length > 0) {
        console.log(magenta(`  Content chunks: ${parsedEvents.content.length}`))
        for (const chunk of parsedEvents.content) {
          const preview = chunk.length > 200 ? chunk.substring(0, 200) + '...' : chunk
          console.log(magenta(`    ${preview}`))
        }
      }
      if (parsedEvents.toolUses.length > 0) {
        console.log(magenta(`  Tool uses: ${parsedEvents.toolUses.length}`))
        for (const tool of parsedEvents.toolUses) {
          console.log(magenta(`    ${tool.name} (${tool.id})`))
        }
      }
      console.log(magenta(`  Stop reason: ${parsedEvents.stopReason}`))
      if (parsedEvents.credits !== undefined) {
        console.log(magenta(`  Credits: ${parsedEvents.credits}`))
      }
    } catch {
      console.log(yellow(`  Response body: ${res.body.length} bytes (event stream parse failed)`))
    }
  } else if (contentType.includes('json') && res.body.length > 0) {
    try {
      const json = JSON.parse(res.body.toString('utf-8'))
      console.log(yellow('Response Body:'))
      console.log(yellow(JSON.stringify(json, null, 2)))
    } catch {
      console.log(yellow(`  Response body: ${res.body.length} bytes`))
    }
  } else {
    console.log(yellow(`  Response body: ${res.body.length} bytes`))
  }

  console.log(separator)

  // Save to JSON file
  saveCapture(req, res, parsedRequestBody, parsedEvents)
}

function saveCapture(
  req: CapturedRequest,
  res: CapturedResponse,
  parsedRequestBody: unknown,
  parsedEvents?: ReturnType<typeof parseEventStream>,
) {
  ensureOutputDir()

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const urlPath = new URL(req.url).pathname.replace(/\//g, '_').replace(/^_/, '')
  const filename = `${timestamp}_${req.method}_${urlPath}.json`

  // Build response body representation
  let responseBody: unknown
  if (parsedEvents) {
    responseBody = {
      _type: 'event_stream',
      content: parsedEvents.content,
      toolUses: parsedEvents.toolUses,
      stopReason: parsedEvents.stopReason,
      credits: parsedEvents.credits,
      contextUsagePercentage: parsedEvents.contextUsagePercentage,
      rawLength: res.body.length,
    }
  } else {
    try {
      responseBody = JSON.parse(res.body.toString('utf-8'))
    } catch {
      responseBody = { _type: 'binary', length: res.body.length }
    }
  }

  const capture = {
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: parsedRequestBody,
    },
    response: {
      statusCode: res.statusCode,
      headers: res.headers,
      body: responseBody,
    },
  }

  const filePath = join(outputDir, filename)
  writeFileSync(filePath, JSON.stringify(capture, null, 2))
  console.log(dim(`  Saved to ${filePath}`))
}
