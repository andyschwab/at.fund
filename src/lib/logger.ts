/**
 * Structured logging for Vercel.
 *
 * Vercel captures `console.log/warn/error` as structured JSON when the
 * output is a single JSON object. We wrap calls to ensure context fields
 * (stewardUri, step, did, etc.) are always included.
 */

type LogContext = Record<string, unknown>

function log(level: 'info' | 'warn' | 'error', message: string, ctx?: LogContext) {
  const payload = { level, message, timestamp: new Date().toISOString(), ...ctx }
  if (level === 'error') {
    console.error(JSON.stringify(payload))
  } else if (level === 'warn') {
    console.warn(JSON.stringify(payload))
  } else {
    console.log(JSON.stringify(payload))
  }
}

export const logger = {
  info: (message: string, ctx?: LogContext) => log('info', message, ctx),
  warn: (message: string, ctx?: LogContext) => log('warn', message, ctx),
  error: (message: string, ctx?: LogContext) => log('error', message, ctx),
}
