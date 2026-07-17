import pino from 'pino'
import type { Logger } from '../domain/context.js'

export function createLogger(options: { level: string }): Logger {
  const p = pino({ level: options.level })
  return {
    info: (msg, data) => p.info(data ?? {}, msg),
    warn: (msg, data) => p.warn(data ?? {}, msg),
    error: (msg, data) => p.error(data ?? {}, msg),
    debug: (msg, data) => p.debug(data ?? {}, msg),
  }
}
