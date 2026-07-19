import { describe, it, expect } from 'vitest'
import { RuntimeHost } from '../host/runtime-host.js'
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

describe('RuntimeHost', () => {
  it('starts in STOPPED state', () => {
    const host = new RuntimeHost(minimalConfig)
    expect(host.state).toBe('STOPPED')
  })

  it('starts in CREATED state', () => {
    // After Task 4, RuntimeHost constructor takes BootstrapPlan.
    // State machine has new states. This stub documents the expected new state name.
  })

  it('reaches READY state after start()', async () => {
    const host = new RuntimeHost(minimalConfig)
    await host.start()
    expect(host.state).toBe('READY')
    await host.stop()
  })

  it('exposes runtime and router after start()', async () => {
    const host = new RuntimeHost(minimalConfig)
    await host.start()
    expect(host.runtime).toBeDefined()
    expect(host.router).toBeDefined()
    await host.stop()
  })

  it('throws accessing runtime before start()', () => {
    const host = new RuntimeHost(minimalConfig)
    expect(() => host.runtime).toThrow('not started')
  })

  it('throws accessing router before start()', () => {
    const host = new RuntimeHost(minimalConfig)
    expect(() => host.router).toThrow('not started')
  })

  it('reaches STOPPED state after stop()', async () => {
    const host = new RuntimeHost(minimalConfig)
    await host.start()
    await host.stop()
    expect(host.state).toBe('STOPPED')
  })

  it('emits runtime:ready event on start()', async () => {
    const host = new RuntimeHost(minimalConfig)
    let fired = false
    host.on('runtime:ready', () => { fired = true })
    await host.start()
    expect(fired).toBe(true)
    await host.stop()
  })

  it('emits runtime:stopped event on stop()', async () => {
    const host = new RuntimeHost(minimalConfig)
    await host.start()
    let fired = false
    host.on('runtime:stopped', () => { fired = true })
    await host.stop()
    expect(fired).toBe(true)
  })

  it('throws starting twice', async () => {
    const host = new RuntimeHost(minimalConfig)
    await host.start()
    await expect(host.start()).rejects.toThrow()
    await host.stop()
  })

  it('starts successfully with non-existent extension path (non-fatal)', async () => {
    const hostWithBadPath = new RuntimeHost({
      ...minimalConfig,
      extensions: { paths: ['/non/existent/path'] },
    })
    await hostWithBadPath.start()
    expect(hostWithBadPath.state).toBe('READY')
    await hostWithBadPath.stop()
  })
})
