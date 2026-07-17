import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { HealthMonitor } from '../health/health-monitor.js'
import { DaemonPersistence } from '../persistence/daemon-persistence.js'
import { ServiceAdapter } from '../registry/service-registry.js'

describe('HealthMonitor', () => {
  it('collect returns RuntimeHealth with sessionId', async () => {
    const monitor = new HealthMonitor()
    const svc = new ServiceAdapter('memory', async () => {}, async () => {})
    await svc.start()
    const health = await monitor.collect('sess-1', [svc])
    expect(health.sessionId).toBe('sess-1')
    expect(health.services.length).toBe(1)
    expect(health.services[0]?.serviceId).toBe('memory')
  })

  it('activeExecutions tracks increment/decrement', async () => {
    const monitor = new HealthMonitor()
    expect((await monitor.collect('s', [])).activeExecutions).toBe(0)
    monitor.incrementActive()
    monitor.incrementActive()
    expect((await monitor.collect('s', [])).activeExecutions).toBe(2)
    monitor.decrementActive()
    expect((await monitor.collect('s', [])).activeExecutions).toBe(1)
  })

  it('memoryBytes > 0', async () => {
    const monitor = new HealthMonitor()
    const h = await monitor.collect('s', [])
    expect(h.memoryBytes).toBeGreaterThan(0)
  })
})

describe('DaemonPersistence', () => {
  const dirs: string[] = []

  function tmpPersistence() {
    const dir = join(tmpdir(), `rhkd-persist-${randomUUID()}`)
    dirs.push(dir)
    return new DaemonPersistence(dir)
  }

  afterEach(() => {
    for (const dir of dirs) {
      try { rmSync(dir, { recursive: true }) } catch { /* ignore */ }
    }
    dirs.length = 0
  })

  it('writePid / readPid round-trips', () => {
    const p = tmpPersistence()
    p.writePid(12345)
    expect(p.readPid()).toBe(12345)
  })

  it('readPid returns undefined when no file', () => {
    const p = tmpPersistence()
    expect(p.readPid()).toBeUndefined()
  })

  it('writeSession / readSession round-trips', () => {
    const p = tmpPersistence()
    const session = { sessionId: 'abc', startedAt: new Date().toISOString(), version: '0.1.0', runtimeDirectory: '.rohinik' }
    p.writeSession(session)
    expect(p.readSession()?.sessionId).toBe('abc')
  })

  it('isRunning returns true for current process', () => {
    const p = tmpPersistence()
    expect(p.isRunning(process.pid)).toBe(true)
  })

  it('isRunning returns false for nonexistent pid', () => {
    const p = tmpPersistence()
    expect(p.isRunning(999999999)).toBe(false)
  })

  it('removePid does not throw when file missing', () => {
    const p = tmpPersistence()
    expect(() => p.removePid()).not.toThrow()
  })
})
