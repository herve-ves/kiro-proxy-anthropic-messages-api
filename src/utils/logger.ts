// Logger Utility using Pino

import pino from 'pino'

const level = (process.env.LOG_LEVEL || 'debug').toLowerCase()

export const logger = pino({
  level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
})
