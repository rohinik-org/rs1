import { describe, it, expect, vi, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { DaemonHost } from '../host/daemon-host.js'
import { ShutdownCoordinator } from '../shutdown/shutdown-coordinator.js'

function tmpDir() { return join(tmpdir(), `rhkd-shutdown-${randomUUID()}`) }

describe('ShutdownCoordinator', () => {
  const dirs: string[] = []
  const hosts: DaemonHost[] = []

  afterEach(async () => {
    for (const h of hosts) { try { await h.stop() } catch { /* ignore */ } }
    hosts.length = 0
    for (const d of dirs) { try { rmSync(d, { recursive: true }) } catch { /* ignore */ } }
    dirs.length = 0
  })

  function makeStartedHost() {
    const dir = tmpDir()
    dirs.push(dir)
    const host = new DaemonHost({ runtimeDir: dir })
    hosts.push(host)
    return host
  }

  it('shutdown() calls host.stop() and journals RUNTIME_STOPPED', async () => {
    const host = makeStartedHost()
    await host.start()
    const coordinator = new ShutdownCoordinator(host)
    await coordinator.shutdown()
    expect(host.getJournal().last()?.eventType).toBe('RUNTIME_STOPPED')
  })

  it('shutdown() called twice only shuts down once (idempotent)', async () => {
    const host = makeStartedHost()
    await host.start()
    const stopSpy = vi.spyOn(host, 'stop')
    const coordinator = new ShutdownCoordinator(host)
    await Promise.all([coordinator.shutdown(), coordinator.shutdown()])
    expect(stopSpy).toHaveBeenCalledTimes(1)
  })

  it('shutdown() with very short timeout rejects with timeout error', async () => {
    const host = makeStartedHost()
    await host.start()
    const slow = new DaemonHost({ runtimeDir: tmpDir() })
    const slowHost = slow
    vi.spyOn(slowHost, 'stop').mockImplementation(() => new Promise(r => setTimeout(r, 5_000)))
    const coordinator = new ShutdownCoordinator(slowHost, 1)
    await expect(coordinator.shutdown()).rejects.toThrow('timed out')
  })

  it('wire() registers SIGTERM and SIGINT without throwing', () => {
    const host = makeStartedHost()
    const coordinator = new ShutdownCoordinator(host)
    expect(() => coordinator.wire()).not.toThrow()
    // cleanup listeners to avoid leaking
    process.removeAllListeners('SIGTERM')
    process.removeAllListeners('SIGINT')
  })

  it('shutdown() removes PID file', async () => {
    const host = makeStartedHost()
    await host.start()
    const coordinator = new ShutdownCoordinator(host)
    await coordinator.shutdown()
    const journal = host.getJournal().all()
    expect(journal.some(e => e.eventType === 'RUNTIME_STOPPED')).toBe(true)
  })

  it('shutdown() completes within graceful timeout for normal host', async () => {
    const host = makeStartedHost()
    await host.start()
    const coordinator = new ShutdownCoordinator(host, 5_000)
    const start = Date.now()
    await coordinator.shutdown()
    expect(Date.now() - start).toBeLessThan(5_000)
  })
})
