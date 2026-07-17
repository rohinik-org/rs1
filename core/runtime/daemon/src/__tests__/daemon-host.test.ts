import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { DEFAULT_DAEMON_POLICY } from '@rohinik-org/compiler'
import type { RuntimeCommand } from '@rohinik-org/compiler'
import { DaemonHost } from '../host/daemon-host.js'
import { ServiceAdapter } from '../registry/service-registry.js'
import { SocketRuntimeTransport } from '../ipc/socket-runtime-transport.js'

function tmpDir() { return join(tmpdir(), `rhkd-host-${randomUUID()}`) }

function makeService(id: string) {
  return new ServiceAdapter(id, async () => {}, async () => {})
}

describe('DaemonHost', () => {
  const hosts: DaemonHost[] = []
  const dirs: string[] = []

  afterEach(async () => {
    for (const h of hosts) { try { await h.stop() } catch { /* ignore */ } }
    hosts.length = 0
    for (const d of dirs) { try { rmSync(d, { recursive: true }) } catch { /* ignore */ } }
    dirs.length = 0
  })

  function makeHost(services: string[] = []) {
    const dir = tmpDir()
    dirs.push(dir)
    const host = new DaemonHost({
      runtimeDir: dir,
      services: services.map(makeService),
    })
    hosts.push(host)
    return host
  }

  it('start() returns sessionId and socketPath', async () => {
    const host = makeHost()
    const result = await host.start()
    expect(result.sessionId).toBeTruthy()
    expect(result.socketPath).toBeTruthy()
  })

  it('start() journals RUNTIME_STARTED', async () => {
    const host = makeHost()
    await host.start()
    const last = host.getJournal().last()
    expect(last?.eventType).toBe('RUNTIME_STARTED')
  })

  it('dispatch(STATUS) returns RuntimeHealth', async () => {
    const host = makeHost(['memory', 'executor'])
    await host.start()
    const resp = await host.dispatch({ requestId: 'r1', type: 'STATUS', payload: {} })
    expect(resp.success).toBe(true)
    expect((resp.payload as { services: unknown[] }).services).toBeDefined()
  })

  it('dispatch unknown type returns success:true with dispatched payload', async () => {
    const host = makeHost()
    await host.start()
    const resp = await host.dispatch({ requestId: 'r2', type: 'EXECUTE', payload: null })
    expect(resp.success).toBe(true)
  })

  it('journals COMMAND_RECEIVED and COMMAND_COMPLETED per dispatch', async () => {
    const host = makeHost()
    await host.start()
    await host.dispatch({ requestId: 'r3', type: 'STATUS', payload: {} })
    const entries = host.getJournal().all()
    const types = entries.map(e => e.eventType)
    expect(types).toContain('COMMAND_RECEIVED')
    expect(types).toContain('COMMAND_COMPLETED')
  })

  it('healthCheck() returns valid RuntimeHealth', async () => {
    const host = makeHost(['memory'])
    await host.start()
    const health = await host.healthCheck()
    expect(health.sessionId).toBeTruthy()
    expect(health.memoryBytes).toBeGreaterThan(0)
  })

  it('stop() journals RUNTIME_STOPPED', async () => {
    const host = makeHost()
    await host.start()
    await host.stop()
    const last = host.getJournal().last()
    expect(last?.eventType).toBe('RUNTIME_STOPPED')
  })

  it('IPC round-trip: SocketRuntimeTransport → DaemonHost dispatch', async () => {
    const host = makeHost()
    const { socketPath } = await host.start()
    const transport = new SocketRuntimeTransport(socketPath)
    await transport.connect()
    const cmd: RuntimeCommand = { requestId: randomUUID(), type: 'STATUS', payload: {} }
    const resp = await transport.send(cmd)
    expect(resp.requestId).toBe(cmd.requestId)
    expect(resp.success).toBe(true)
    await transport.disconnect()
  })

  it('services are started when host starts', async () => {
    const started: string[] = []
    const dir = tmpDir()
    dirs.push(dir)
    const svc = new ServiceAdapter('memory', async () => { started.push('memory') }, async () => {})
    const host = new DaemonHost({ runtimeDir: dir, services: [svc] })
    hosts.push(host)
    await host.start()
    expect(started).toContain('memory')
  })

  it('stop() stops all registered services', async () => {
    const stopped: string[] = []
    const dir = tmpDir()
    dirs.push(dir)
    const svc = new ServiceAdapter('executor', async () => {}, async () => { stopped.push('executor') })
    const host = new DaemonHost({ runtimeDir: dir, services: [svc] })
    hosts.push(host)
    await host.start()
    await host.stop()
    expect(stopped).toContain('executor')
  })
})
