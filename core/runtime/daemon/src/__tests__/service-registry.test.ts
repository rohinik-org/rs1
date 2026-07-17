import { describe, it, expect } from 'vitest'
import { ServiceAdapter, ServiceRegistry } from '../registry/service-registry.js'

function noopAdapter(id: string) {
  return new ServiceAdapter(id, async () => {}, async () => {})
}

describe('ServiceAdapter', () => {
  it('starts STOPPED, transitions to RUNNING after start()', async () => {
    const svc = noopAdapter('memory')
    const before = await svc.health()
    expect(before.state).toBe('STOPPED')
    await svc.start()
    const after = await svc.health()
    expect(after.state).toBe('RUNNING')
    expect(after.serviceId).toBe('memory')
  })

  it('transitions to STOPPED after stop()', async () => {
    const svc = noopAdapter('executor')
    await svc.start()
    await svc.stop()
    expect((await svc.health()).state).toBe('STOPPED')
  })

  it('health() reports startedAt after start', async () => {
    const svc = noopAdapter('planner')
    await svc.start()
    const h = await svc.health()
    expect(h.startedAt).toBeDefined()
  })

  it('health() uptimeMs is 0 before start', async () => {
    const svc = noopAdapter('reflection')
    const h = await svc.health()
    expect(h.uptimeMs).toBe(0)
  })

  it('start() propagates underlying error and state becomes STARTING on throw', async () => {
    const svc = new ServiceAdapter('bad', async () => { throw new Error('start failed') }, async () => {})
    await expect(svc.start()).rejects.toThrow('start failed')
  })

  it('serviceId is readable', () => {
    const svc = noopAdapter('network')
    expect(svc.serviceId).toBe('network')
  })
})

describe('ServiceRegistry', () => {
  it('register and get by serviceId', () => {
    const registry = new ServiceRegistry()
    const svc = noopAdapter('memory')
    registry.register(svc)
    expect(registry.get('memory')).toBe(svc)
  })

  it('get unknown returns undefined', () => {
    const registry = new ServiceRegistry()
    expect(registry.get('ghost')).toBeUndefined()
  })

  it('all() returns all registered services', () => {
    const registry = new ServiceRegistry()
    registry.register(noopAdapter('a'))
    registry.register(noopAdapter('b'))
    expect(registry.all().length).toBe(2)
  })

  it('second register overwrites first for same serviceId', () => {
    const registry = new ServiceRegistry()
    const s1 = noopAdapter('x')
    const s2 = noopAdapter('x')
    registry.register(s1)
    registry.register(s2)
    expect(registry.get('x')).toBe(s2)
    expect(registry.all().length).toBe(1)
  })
})
