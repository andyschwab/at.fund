import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs info as structured JSON to console.log', () => {
    logger.info('test message', { key: 'value' })
    expect(console.log).toHaveBeenCalledOnce()
    const payload = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(payload.level).toBe('info')
    expect(payload.message).toBe('test message')
    expect(payload.key).toBe('value')
    expect(payload.timestamp).toBeTruthy()
  })

  it('logs warn as structured JSON to console.warn', () => {
    logger.warn('warning', { stewardUri: 'test.com' })
    expect(console.warn).toHaveBeenCalledOnce()
    const payload = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(payload.level).toBe('warn')
    expect(payload.stewardUri).toBe('test.com')
  })

  it('logs error as structured JSON to console.error', () => {
    logger.error('fail', { error: 'boom' })
    expect(console.error).toHaveBeenCalledOnce()
    const payload = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(payload.level).toBe('error')
    expect(payload.error).toBe('boom')
  })

  it('works without context', () => {
    logger.info('bare message')
    const payload = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(payload.message).toBe('bare message')
    expect(payload.level).toBe('info')
  })
})
