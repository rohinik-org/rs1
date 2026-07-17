import { describe, it, expect } from 'vitest'
import { DEFAULT_DAEMON_POLICY } from '@rohinik-org/compiler'
import { LifecycleManager } from '../lifecycle/lifecycle-manager.js'
import { ServiceAdapter } from '../registry/service-registry.js'

function makeService(id: string) {
  const log: string[] = []
  const svc = new ServiceAdapter(id, async () => { log.push('start') }, async () => { log.push('stop') })
  return { svc, log }
}

const policy = DEFAULT_DAEMON_POLICY

describe('LifecycleManager', () => {
  it('orderedStartup places network before memory before executor', () => {
    const mgr = new LifecycleManager(policy)
    const { svc: executor } = makeService('executor')
    const { svc: memory } = makeService('memory')
    const { svc: network } = makeService('network')
    const ordered = mgr.orderedStartup([executor, memory, network])
    const ids = ordered.map(s => s.serviceId)
    expect(ids.indexOf('network')).toBeLessThan(ids.indexOf('memory'))
    expect(ids.indexOf('memory')).toBeLessThan(ids.indexOf('executor'))
  })

  it('orderedShutdown is reverse of startup', () => {
    const mgr = new LifecycleManager(policy)
    const svcs = ['network', 'memory', 'planner', 'executor'].map(id => makeService(id).svc)
    const startup = mgr.orderedStartup(svcs).map(s => s.serviceId)
    const shutdown = mgr.orderedShutdown(svcs).map(s => s.serviceId)
    expect(shutdown).toEqual([...startup].reverse())
  })

  it('startAll calls start() on all services in order', async () => {
    const mgr = new LifecycleManager(policy)
    const started: string[] = []
    const svcs = ['network', 'memory', 'executor'].map(id =>
      new ServiceAdapter(id, async () => { started.push(id) }, async () => {})
    )
    await mgr.startAll(svcs)
    expect(started[0]).toBe('network')
    expect(started[1]).toBe('memory')
    expect(started[2]).toBe('executor')
  })

  it('stopAll calls stop() in reverse order', async () => {
    const mgr = new LifecycleManager(policy)
    const stopped: string[] = []
    const svcs = ['network', 'memory', 'executor'].map(id =>
      new ServiceAdapter(id, async () => {}, async () => { stopped.push(id) })
    )
    await mgr.stopAll(svcs)
    expect(stopped[0]).toBe('executor')
    expect(stopped[1]).toBe('memory')
    expect(stopped[2]).toBe('network')
  })

  it('isCritical returns true for memory and executor', () => {
    const mgr = new LifecycleManager(policy)
    expect(mgr.isCritical('memory')).toBe(true)
    expect(mgr.isCritical('executor')).toBe(true)
    expect(mgr.isCritical('network')).toBe(false)
  })

  it('restartService stops then starts the service', async () => {
    const mgr = new LifecycleManager(policy)
    const ops: string[] = []
    const svc = new ServiceAdapter('executor', async () => { ops.push('start') }, async () => { ops.push('stop') })
    await svc.start()
    ops.length = 0
    await mgr.restartService(svc)
    expect(ops).toEqual(['stop', 'start'])
  })

  it('restartService throws after maxRestartAttempts exceeded', async () => {
    const mgr = new LifecycleManager({ ...policy, maxRestartAttempts: 2 })
    const svc = new ServiceAdapter('memory', async () => {}, async () => {})
    await expect(mgr.restartService(svc, 3)).rejects.toThrow('exceeded max restart attempts')
  })

  it('stopAll does not throw on single service failure, re-throws first error', async () => {
    const mgr = new LifecycleManager(policy)
    const bad = new ServiceAdapter('executor', async () => {}, async () => { throw new Error('stop failed') })
    const good = new ServiceAdapter('memory', async () => {}, async () => {})
    await expect(mgr.stopAll([bad, good])).rejects.toThrow('stop failed')
  })
})
