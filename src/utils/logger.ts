// Logger Utility using Pino

import pino from 'pino'
import pretty from 'pino-pretty'

const level = (process.env.LOG_LEVEL || 'debug').toLowerCase()
const prettyEnabled = (process.env.LOG_PRETTY || 'true').toLowerCase() !== 'false'

function createLogger() {
  if (!prettyEnabled) {
    return pino({ level })
  }

  // Avoid pino transport worker threads to keep bun --compile binaries runnable.
  const prettyStream = pretty({
    colorize: process.stdout.isTTY,
    translateTime: 'SYS:HH:MM:ss',
    ignore: 'pid,hostname',
  })

  return pino({ level }, prettyStream)
}

export const logger = createLogger()
