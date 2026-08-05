import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KernelRuntime } from '../runtime/kernel-runtime.js'
import type { RuntimeRegistry } from '../runtime/runtime-registry.js'
import type { RuntimeServices } from '../domain/context.js'
import type { ActivationPlan } from '../runtime/types.js'
import type { AiosManifest } from '@rohinik-org/foundation'

const VALID_MANIFEST: AiosManifest = {
  schemaVersion: '1.0',
  runtimeVersion: '^0.1',
  type: 'capability',
  compatibility: 'stable',
  id: 'test-ext',
  name: 'Test Extension',
  version: '1.0.0',
  contractVersion: '1.0',
  entry: './src/index.js',
}

const makeEmptyPlan = (manifests: AiosManifest[] = []): ActivationPlan => ({
  manifests,
  errors: [],
  warnings: [],
})

const makePlanWithError = (): ActivationPlan => ({
  manifests: [],
  errors: [{ type: 'CYCLE', message: 'cycle', involvedIds: ['a'] }],
  warnings: [],
})

const makeRegistry = (): RuntimeRegistry => ({
  registerCapability: vi.fn(),
  registerProvider: vi.fn(),
} as unknown as RuntimeRegistry)

// makeServices matches the actual RuntimeServices interface from domain/context.ts:
//   Logger: info, warn, error, debug (all with optional data?: Record<string, unknown>)
//   MetricsCollector: increment, histogram, getCounter
//   ConfigService: get<T>(key, defaultValue): T
//   CacheService: get<T>(key): Promise<T | undefined>, set<T>(key, value, ttlMs?): Promise<void>
//   EventBus: emit, on, off
const makeServices = (): RuntimeServices => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  metrics: { increment: vi.fn(), histogram: vi.fn(), getCounter: vi.fn() },
  config: { get: vi.fn() },
  cache: { get: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined) },
  events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
})

describe('KernelRuntime', () => {
  let runtime: KernelRuntime
  let registry: RuntimeRegistry
  let services: RuntimeServices

  beforeEach(() => {
    registry = makeRegistry()
    services = makeServices()
    runtime = new KernelRuntime(registry, services)
  })

  describe('state transitions', () => {
    it('starts in STOPPED state', () => {
      expect(runtime.state).toBe('STOPPED')
    })

    it('transitions to READY on successful activate()', async () => {
      await runtime.activate(makeEmptyPlan())
      expect(runtime.state).toBe('READY')
    })

    it('transitions to FAILED when plan has errors', async () => {
      await expect(runtime.activate(makePlanWithError())).rejects.toThrow()
      expect(runtime.state).toBe('FAILED')
    })

    it('transitions READY → STOPPED on shutdown()', async () => {
      await runtime.activate(makeEmptyPlan())
      await runtime.shutdown()
      expect(runtime.state).toBe('STOPPED')
    })
  })

  describe('version', () => {
    it('exposes version 0.1.0', () => {
      expect(runtime.version).toBe('0.1.0')
    })
  })

  describe('services', () => {
    it('exposes logger through services', () => {
      expect(runtime.services.logger).toBeDefined()
      expect(typeof runtime.services.logger.info).toBe('function')
    })
  })

  describe('registerCapability() and registerProvider()', () => {
    it('delegates registerCapability to registry', () => {
      const cap = {
        metadata: {
          capabilityId: 'x',
          name: 'x',
          version: '1.0',
          contractVersion: '1.0',
          description: 'test capability',
          category: 'utility' as const,
          tags: [],
        },
        skills: [],
      }
      runtime.registerCapability(cap)
      expect(registry.registerCapability).toHaveBeenCalledWith(cap)
    })

    it('delegates registerProvider to registry', () => {
      const prov = { metadata: { providerId: 'x', name: 'x', version: '1.0' }, isAvailable: async () => true }
      runtime.registerProvider(prov)
      expect(registry.registerProvider).toHaveBeenCalledWith(prov)
    })
  })

  describe('onShutdown()', () => {
    it('calls shutdown handlers in reverse registration order', async () => {
      const order: number[] = []
      runtime.onShutdown(() => { order.push(1) })
      runtime.onShutdown(() => { order.push(2) })
      runtime.onShutdown(() => { order.push(3) })
      await runtime.activate(makeEmptyPlan())
      await runtime.shutdown()
      expect(order).toEqual([3, 2, 1])
    })

    it('calls async shutdown handlers', async () => {
      const called: boolean[] = []
      runtime.onShutdown(async () => {
        await new Promise(r => setTimeout(r, 10))
        called.push(true)
      })
      await runtime.activate(makeEmptyPlan())
      await runtime.shutdown()
      expect(called).toEqual([true])
    })
  })

  describe('activate() with extensions', () => {
    it('calls module.activate(context) for each manifest in the plan', async () => {
      const activatedContexts: unknown[] = []
      const manifest: AiosManifest = { ...VALID_MANIFEST }
      const plan: ActivationPlan = { manifests: [manifest], errors: [], warnings: [] }

      const importSpy = vi.spyOn(runtime as any, '_dynamicImport').mockResolvedValue({
        activate: (ctx: unknown) => { activatedContexts.push(ctx) },
      })

      await runtime.activate(plan)
      expect(activatedContexts).toHaveLength(1)
      expect(importSpy).toHaveBeenCalledWith(manifest.entry)
    })

    it('passes the runtime directly to activate()', async () => {
      const receivedContexts: any[] = []
      const manifest: AiosManifest = { ...VALID_MANIFEST }
      const plan: ActivationPlan = { manifests: [manifest], errors: [], warnings: [] }

      vi.spyOn(runtime as any, '_dynamicImport').mockResolvedValue({
        activate: (ctx: unknown) => { receivedContexts.push(ctx) },
      })

      await runtime.activate(plan)
      expect(receivedContexts[0]).toBe(runtime)
    })

    it('throws when activate() called on non-STOPPED runtime', async () => {
      await runtime.activate(makeEmptyPlan())
      expect(runtime.state).toBe('READY')
      await expect(runtime.activate(makeEmptyPlan())).rejects.toThrow(/READY/)
    })

    it('transitions to FAILED when extension has no activate export', async () => {
      const manifest: AiosManifest = { ...VALID_MANIFEST }
      const plan: ActivationPlan = { manifests: [manifest], errors: [], warnings: [] }

      vi.spyOn(runtime as any, '_dynamicImport').mockResolvedValue({
        // no activate function
      })

      await expect(runtime.activate(plan)).rejects.toThrow(/activate/)
      expect(runtime.state).toBe('FAILED')
    })

    it('transitions to FAILED when extension activate() throws', async () => {
      const manifest: AiosManifest = { ...VALID_MANIFEST }
      const plan: ActivationPlan = { manifests: [manifest], errors: [], warnings: [] }

      vi.spyOn(runtime as any, '_dynamicImport').mockResolvedValue({
        activate: () => { throw new Error('activation failed') },
      })

      await expect(runtime.activate(plan)).rejects.toThrow('activation failed')
      expect(runtime.state).toBe('FAILED')
    })
  })

  describe('shutdown() error handling', () => {
    it('completes shutdown even when a handler throws, state becomes STOPPED', async () => {
      runtime.onShutdown(() => { throw new Error('handler error') })
      runtime.onShutdown(() => { /* ok */ })
      await runtime.activate(makeEmptyPlan())
      await expect(runtime.shutdown()).rejects.toThrow('handler error')
      expect(runtime.state).toBe('STOPPED')
    })
  })
})
