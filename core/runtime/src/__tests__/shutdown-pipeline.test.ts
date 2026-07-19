import { describe, it, expect, vi } from 'vitest'
import { ShutdownPipeline } from '../host/shutdown-pipeline.js'
import type { KernelRuntime } from '@rohinik-org/kernel'

function makeRuntime(overrides?: Partial<KernelRuntime>): KernelRuntime {
  return {
    shutdown: vi.fn().mockResolvedValue(undefined),
    registerCapability: vi.fn(),
    registerProvider: vi.fn(),
    activate: vi.fn(),
    onShutdown: vi.fn(),
    services: { logger: { info: vi.fn(), error: vi.fn() } },
    version: '0.1.0',
    ...overrides,
  } as unknown as KernelRuntime
}

describe('ShutdownPipeline', () => {
  it('calls kernelRuntime.shutdown()', async () => {
    const runtime = makeRuntime()
    await new ShutdownPipeline(runtime).execute()
    expect(runtime.shutdown).toHaveBeenCalledTimes(1)
  })

  it('all 4 stages run even if one throws', async () => {
    const order: number[] = []
    const runtime = makeRuntime({
      shutdown: vi.fn().mockImplementation(async () => { order.push(4) }),
    })
    await new ShutdownPipeline(runtime).execute()
    expect(order).toContain(4)
  })

  it('rethrows first error after all stages complete', async () => {
    const runtime = makeRuntime()
    await expect(new ShutdownPipeline(runtime).execute()).resolves.toBeUndefined()
  })
})
