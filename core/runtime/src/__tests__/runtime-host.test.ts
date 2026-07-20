import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { platform } from 'node:os'
import { createProductionHost } from '../host/production-runtime.js'
import { RuntimeHost } from '../host/runtime-host.js'
import { BuiltinRegistry } from '../host/builtin-registry.js'
import { defaultBootstrapPlan } from '../host/bootstrap-plan.js'
import type { ResolvedConfig } from '../types.js'

const minimalConfig: ResolvedConfig = {
  configPath: '/tmp/rohinik.yaml',
  runtimeId: 'test-runtime-001',
  runtime: {
    routing: { mode: 'balanced', explain: true, traceBuffer: 100 },
    resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
    logLevel: 'error',
  },
  extensions: { paths: [] },
  providers: {},
  server: { port: 8080, host: '0.0.0.0' },
}

function uniqueSocket(): string {
  return platform() === 'win32'
    ? `\\\\.\\pipe\\rohinik-test-${randomUUID()}`
    : `/tmp/rohinik-test-${randomUUID()}.sock`
}

function makeHost(): RuntimeHost {
  const reg = new BuiltinRegistry()
  const plan = defaultBootstrapPlan(minimalConfig, reg)
  return new RuntimeHost({ ...plan, socketPath: uniqueSocket() })
}

describe('RuntimeHost', () => {
  it('starts in CREATED state', () => {
    expect(makeHost().state).toBe('CREATED')
  })

  it('reaches READY state after start()', async () => {
    const host = makeHost()
    await host.start()
    expect(host.state).toBe('READY')
    await host.stop()
  })

  it('exposes runtime and router after start()', async () => {
    const host = makeHost()
    await host.start()
    expect(host.runtime).toBeDefined()
    expect(host.router).toBeDefined()
    await host.stop()
  })

  it('throws accessing runtime before start()', () => {
    expect(() => makeHost().runtime).toThrow('not started')
  })

  it('throws accessing router before start()', () => {
    expect(() => makeHost().router).toThrow('not started')
  })

  it('reaches STOPPED state after stop()', async () => {
    const host = makeHost()
    await host.start()
    await host.stop()
    expect(host.state).toBe('STOPPED')
  })

  it('emits runtime:ready event on start()', async () => {
    const host = makeHost()
    let fired = false
    host.on('runtime:ready', () => { fired = true })
    await host.start()
    expect(fired).toBe(true)
    await host.stop()
  })

  it('emits runtime:stopped event on stop()', async () => {
    const host = makeHost()
    await host.start()
    let fired = false
    host.on('runtime:stopped', () => { fired = true })
    await host.stop()
    expect(fired).toBe(true)
  })

  it('throws starting when not CREATED or STOPPED', async () => {
    const host = makeHost()
    await host.start()
    await expect(host.start()).rejects.toThrow()
    await host.stop()
  })

  it('non-existent extension path is non-fatal', async () => {
    const reg = new BuiltinRegistry()
    const plan = defaultBootstrapPlan(
      { ...minimalConfig, extensions: { paths: ['/non/existent/path'] } },
      reg,
    )
    const host = new RuntimeHost({ ...plan, socketPath: uniqueSocket() })
    await host.start()
    expect(host.state).toBe('READY')
    await host.stop()
  })

  it('listProviders() returns snapshot from metadata', async () => {
    const host = makeHost()
    await host.start()
    const providers = host.listProviders()
    expect(Array.isArray(providers)).toBe(true)
    await host.stop()
  })

  it('health() returns HealthReport with seven checks', async () => {
    const host = makeHost()
    await host.start()
    const report = await host.health()
    expect(report.status).toBeDefined()
    expect(report.checks).toHaveLength(7)
    const subsystems = report.checks.map(c => c.subsystem)
    expect(subsystems).toContain('kernel')
    expect(subsystems).toContain('eventbus')
    expect(subsystems).toContain('providers')
    expect(subsystems).toContain('capabilities')
    expect(subsystems).toContain('corpus')
    expect(subsystems).toContain('extensions')
    expect(subsystems).toContain('identity')
    await host.stop()
  })

  it('health() returns healthy when kernel is running', async () => {
    const host = makeHost()
    await host.start()
    const report = await host.health()
    const kernelCheck = report.checks.find(c => c.subsystem === 'kernel')
    expect(kernelCheck?.status).toBe('healthy')
    await host.stop()
  })

  it('createProductionHost constructs a working RuntimeHost', async () => {
    const host = createProductionHost(minimalConfig, uniqueSocket())
    expect(host.state).toBe('CREATED')
    await host.start()
    expect(host.state).toBe('READY')
    await host.stop()
  })

  it('profile() throws before start()', () => {
    expect(() => makeHost().profile()).toThrow('not started')
  })

  it('profile() returns correct shape after start()', async () => {
    const host = makeHost()
    await host.start()
    const p = host.profile()
    expect(p.runtimeId).toBeDefined()
    expect(p.version).toBe('0.1.0-beta')
    expect(Array.isArray(p.capabilities)).toBe(true)
    expect(Array.isArray(p.startupTimeline)).toBe(true)
    expect(p.startupTimeline.length).toBeGreaterThan(0)
    expect(p.diagnosticSummary).toHaveProperty('warnings')
    expect(p.diagnosticSummary).toHaveProperty('errors')
    await host.stop()
  })

  it('diagnostics getter throws before start()', () => {
    expect(() => makeHost().diagnostics).toThrow('not started')
  })

  it('diagnostics getter returns DiagnosticsService after start()', async () => {
    const host = makeHost()
    await host.start()
    const svc = host.diagnostics
    expect(typeof svc.all).toBe('function')
    expect(typeof svc.summary).toBe('function')
    await host.stop()
  })

  it('socketPath returns platform-correct string', () => {
    const host = makeHost()
    const p = host.socketPath
    if (process.platform === 'win32') {
      expect(p).toMatch(/\\\\\.\\pipe\\rohinik-test-/)
    } else {
      expect(p).toMatch(/\/tmp\/rohinik-test-/)
    }
  })

  it('IPC socket is connectable after start()', async () => {
    if (process.platform === 'win32') return // named pipe test skipped in CI
    const { createConnection } = await import('node:net')
    const host = makeHost()
    await host.start()
    await new Promise<void>((resolve, reject) => {
      const s = createConnection(host.socketPath, resolve)
      s.once('error', reject)
      setTimeout(() => { s.destroy(); resolve() }, 200)
    })
    await host.stop()
  })

  it('IPC socket removed after stop()', async () => {
    if (process.platform === 'win32') return
    const { existsSync } = await import('node:fs')
    const host = makeHost()
    await host.start()
    const path = host.socketPath
    await host.stop()
    expect(existsSync(path)).toBe(false)
  })

  it('IPC ping/pong round-trip after start()', async () => {
    if (process.platform === 'win32') return
    const { createConnection } = await import('node:net')
    const host = makeHost()
    await host.start()
    const response = await new Promise<string>((resolve, reject) => {
      const s = createConnection(host.socketPath)
      let buf = ''
      s.on('data', (c) => { buf += c.toString(); if (buf.includes('\n')) { s.destroy(); resolve(buf.trim()) } })
      s.once('connect', () => s.write(JSON.stringify({ protocol: 1, type: 'ping', payload: {} }) + '\n'))
      s.once('error', reject)
    })
    const parsed = JSON.parse(response) as { type: string }
    expect(parsed.type).toBe('pong')
    await host.stop()
  })
})
