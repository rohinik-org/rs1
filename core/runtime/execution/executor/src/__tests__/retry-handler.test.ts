import { describe, it, expect, vi } from 'vitest'
import { RetryHandler } from '../retry/retry-handler.js'

describe('RetryHandler', () => {
  it('returns result on first success', async () => {
    const handler = new RetryHandler({ maxRetries: 3, baseDelayMs: 0 })
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await handler.execute(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and succeeds on 2nd attempt', async () => {
    const handler = new RetryHandler({ maxRetries: 3, baseDelayMs: 0 })
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok')
    const result = await handler.execute(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws after maxRetries exhausted', async () => {
    const handler = new RetryHandler({ maxRetries: 2, baseDelayMs: 0 })
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(handler.execute(fn)).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)  // 1 initial + 2 retries
  })

  it('onRetry callback fires on each retry', async () => {
    const onRetry = vi.fn()
    const handler = new RetryHandler({ maxRetries: 2, baseDelayMs: 0, onRetry })
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValueOnce('ok')
    await handler.execute(fn)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('respects maxRetries: 0 — no retries, throws immediately', async () => {
    const handler = new RetryHandler({ maxRetries: 0, baseDelayMs: 0 })
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    await expect(handler.execute(fn)).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
