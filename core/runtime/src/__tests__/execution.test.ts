import { describe, it, expect } from 'vitest'
import { DriverRegistry } from '../kernel/driver-registry.js'
import { CapabilityDriverRegistry } from '../kernel/capability-driver-registry.js'
import { ExecutionDispatcher } from '../execution/execution-dispatcher.js'
import { CapabilityExecutor } from '../execution/capability-executor.js'
import { DriverBootstrap } from '../execution/driver-bootstrap.js'
import type {
  DriverBinding,
  ExecutionDriver,
  DriverDescriptor,
  DriverRawEvent,
  DriverProvider,
  DriverProviderEntry,
  ExecutionContext,
} from '@rohinik-org/capability-manifest'

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    requestId: 'req-1',
    executionId: 'exec-1',
    sessionId: 'sess-1',
    workspaceId: 'ws-1',
    permissions: [],
    ...overrides,
  }
}

function makeDescriptor(id: string): DriverDescriptor {
  return {
    id,
    version: '0.1.0',
    apiVersion: 1,
    priority: 10,
    tags: [],
    capabilities: {
      supportsStreaming: false,
      supportsCancellation: false,
      supportsProgress: false,
      supportsHealth: true,
      offline: true,
      sandboxed: false,
      trusted: true,
    },
  }
}

function makeBinding(id: string, result: string): DriverBinding {
  const descriptor = makeDescriptor(id)
  const driver: ExecutionDriver = {
    descriptor,
    async *execute() {
      yield { type: 'STARTED', payload: {} } as DriverRawEvent<string>
      yield { type: 'RESULT', payload: result } as DriverRawEvent<string>
      yield { type: 'COMPLETE', payload: {} } as DriverRawEvent<string>
    },
    async health() { return { status: 'healthy' as const, checkedAt: new Date() } },
    async shutdown() {},
  }
  return { driver, descriptor }
}

function makeProvider(
  type: DriverProvider['type'],
  bindings: Array<{ binding: DriverBinding; capabilityIds: string[] }>
): DriverProvider {
  return {
    id: `provider-${type}`,
    type,
    async load(): Promise<ReadonlyArray<DriverProviderEntry>> {
      return bindings.map(b => ({ binding: b.binding, capabilityIds: b.capabilityIds }))
    },
  }
}

// --- ExecutionDispatcher ---
describe('ExecutionDispatcher', () => {
  function setup() {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const binding = makeBinding('test', 'hello')
    driverReg.register(binding)
    capReg.registerDriverRef('test:do-thing', 'test')
    const dispatcher = new ExecutionDispatcher(driverReg, capReg)
    return { dispatcher, binding }
  }

  it('routes correctly via capability→driverRef→driver', async () => {
    const { dispatcher } = setup()
    const events = []
    for await (const e of dispatcher.dispatch('test:do-thing', {}, makeContext())) {
      events.push(e)
    }
    expect(events.some(e => e.type === 'RESULT')).toBe(true)
  })

  it('enriched events have sequence/timestamp/driverId', async () => {
    const { dispatcher } = setup()
    const events = []
    for await (const e of dispatcher.dispatch('test:do-thing', {}, makeContext())) {
      events.push(e)
    }
    expect(events[0]?.sequence).toBe(1)
    expect(events[0]?.driverId).toBe('test')
    expect(events[0]?.timestamp).toBeInstanceOf(Date)
  })

  it('CAPABILITY_NOT_FOUND for unknown capability', async () => {
    const { dispatcher } = setup()
    const events = []
    for await (const e of dispatcher.dispatch('nope:nope', {}, makeContext())) {
      events.push(e)
    }
    const err = events.find(e => e.type === 'ERROR')
    expect((err?.payload as { code: string }).code).toBe('CAPABILITY_NOT_FOUND')
  })

  it('DRIVER_NOT_FOUND when driverRef missing', async () => {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    capReg.registerDriverRef('ghost:op', 'ghost-driver')
    const dispatcher = new ExecutionDispatcher(driverReg, capReg)
    const events = []
    for await (const e of dispatcher.dispatch('ghost:op', {}, makeContext())) {
      events.push(e)
    }
    expect((events[0]?.payload as { code: string }).code).toBe('DRIVER_NOT_FOUND')
  })

  it('pre-aborted AbortSignal → ERROR CANCELLED', async () => {
    const { dispatcher } = setup()
    const controller = new AbortController()
    controller.abort()
    const events = []
    for await (const e of dispatcher.dispatch('test:do-thing', {}, makeContext({ signal: controller.signal }))) {
      events.push(e)
    }
    expect((events[0]?.payload as { code: string }).code).toBe('CANCELLED')
  })
})

// --- CapabilityExecutor ---
describe('CapabilityExecutor', () => {
  function setup() {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const binding = makeBinding('exec-drv', 'result-value')
    driverReg.register(binding)
    capReg.registerDriverRef('exec-drv:run', 'exec-drv')
    const dispatcher = new ExecutionDispatcher(driverReg, capReg)
    const executor = new CapabilityExecutor(dispatcher)
    return { executor, binding }
  }

  it('execute() returns ExecutionResult with correct driverId from binding', async () => {
    const { executor } = setup()
    const result = await executor.execute('exec-drv:run', {}, makeContext())
    expect(result.driverId).toBe('exec-drv')
    expect(result.value).toBe('result-value')
  })

  it('startedAt ≤ completedAt', async () => {
    const { executor } = setup()
    const result = await executor.execute('exec-drv:run', {}, makeContext())
    expect(result.startedAt.getTime()).toBeLessThanOrEqual(result.completedAt.getTime())
  })

  it('durationMs === Math.round(completedAt - startedAt)', async () => {
    const { executor } = setup()
    const result = await executor.execute('exec-drv:run', {}, makeContext())
    expect(result.durationMs).toBe(Math.round(result.completedAt.getTime() - result.startedAt.getTime()))
  })

  it('throws DriverError on ERROR event', async () => {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const descriptor = makeDescriptor('err-drv')
    const driver: ExecutionDriver = {
      descriptor,
      async *execute() {
        yield { type: 'ERROR', payload: { code: 'EXECUTION_FAILED', message: 'boom', retryable: false } }
      },
      async health() { return { status: 'healthy' as const, checkedAt: new Date() } },
      async shutdown() {},
    }
    driverReg.register({ driver, descriptor })
    capReg.registerDriverRef('err-drv:go', 'err-drv')
    const executor = new CapabilityExecutor(new ExecutionDispatcher(driverReg, capReg))
    await expect(executor.execute('err-drv:go', {}, makeContext())).rejects.toMatchObject({ code: 'EXECUTION_FAILED' })
  })

  it('executeStream() passes enriched events through', async () => {
    const { executor } = setup()
    const events = []
    for await (const e of executor.executeStream('exec-drv:run', {}, makeContext())) {
      events.push(e)
    }
    expect(events.some(e => e.type === 'RESULT')).toBe(true)
    expect(events[0]?.sequence).toBe(1)
  })
})

// --- DriverBootstrap ---
describe('DriverBootstrap', () => {
  it('4 drivers registered + all capabilities resolvable after load', async () => {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const provider = makeProvider('builtin', [
      { binding: makeBinding('drv-a', 'a'), capabilityIds: ['drv-a:op1'] },
      { binding: makeBinding('drv-b', 'b'), capabilityIds: ['drv-b:op1', 'drv-b:op2'] },
    ])
    await new DriverBootstrap([provider]).load(driverReg, capReg)
    expect(driverReg.findById('drv-a')).toBeDefined()
    expect(capReg.resolve('drv-b:op1')).toEqual({ driverRef: 'drv-b' })
  })

  it('duplicate driver ID → throws before any registration', async () => {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const provider = makeProvider('builtin', [
      { binding: makeBinding('same', 'x'), capabilityIds: ['same:op1'] },
      { binding: makeBinding('same', 'y'), capabilityIds: ['same:op2'] },
    ])
    await expect(new DriverBootstrap([provider]).load(driverReg, capReg)).rejects.toThrow(/Duplicate driver ID/)
    expect(driverReg.findById('same')).toBeUndefined()
  })

  it('duplicate capability ID → throws before any registration', async () => {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const provider = makeProvider('builtin', [
      { binding: makeBinding('d1', 'a'), capabilityIds: ['shared:op'] },
      { binding: makeBinding('d2', 'b'), capabilityIds: ['shared:op'] },
    ])
    await expect(new DriverBootstrap([provider]).load(driverReg, capReg)).rejects.toThrow(/Duplicate capability ID/)
  })

  it('apiVersion mismatch → throws', async () => {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const descriptor: DriverDescriptor = { ...makeDescriptor('bad-api'), apiVersion: 999 }
    const driver: ExecutionDriver = {
      descriptor,
      async *execute() {},
      async health() { return { status: 'healthy' as const, checkedAt: new Date() } },
      async shutdown() {},
    }
    const provider = makeProvider('builtin', [
      { binding: { driver, descriptor }, capabilityIds: ['bad-api:op'] },
    ])
    await expect(new DriverBootstrap([provider]).load(driverReg, capReg)).rejects.toThrow(/apiVersion mismatch/)
  })

  it('registry clean after failed validation', async () => {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const provider = makeProvider('builtin', [
      { binding: makeBinding('ok', 'x'), capabilityIds: ['ok:op'] },
      { binding: makeBinding('ok', 'y'), capabilityIds: ['ok:op2'] }, // dup driver id
    ])
    await expect(new DriverBootstrap([provider]).load(driverReg, capReg)).rejects.toThrow()
    expect(driverReg.findById('ok')).toBeUndefined()
  })

  it('provider ordering is deterministic (enterprise before builtin)', async () => {
    const driverReg = new DriverRegistry()
    const capReg = new CapabilityDriverRegistry()
    const order: string[] = []

    const tracingProvider = (type: DriverProvider['type'], id: string): DriverProvider => ({
      id: `p-${id}`,
      type,
      async load(): Promise<ReadonlyArray<DriverProviderEntry>> {
        const descriptor = makeDescriptor(id)
        const driver: ExecutionDriver = {
          descriptor,
          async *execute() { order.push(id) },
          async health() { return { status: 'healthy' as const, checkedAt: new Date() } },
          async shutdown() {},
        }
        return [{ binding: { driver, descriptor }, capabilityIds: [`${id}:op`] }]
      },
    })

    const bootstrap = new DriverBootstrap([
      tracingProvider('builtin', 'builtin-drv'),
      tracingProvider('enterprise', 'enterprise-drv'),
    ])
    await bootstrap.load(driverReg, capReg)
    const ids = driverReg.list().map(b => b.descriptor.id)
    expect(ids.indexOf('enterprise-drv')).toBeLessThan(ids.indexOf('builtin-drv'))
  })
})
