import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { platform } from 'node:os'
import { RuntimeLauncher } from '../host/runtime-launcher.js'
import type { ResolvedConfig } from '../types.js'

const config: ResolvedConfig = {
  configPath: '/tmp/rohinik.yaml',
  runtimeId: 'launcher-test',
  runtime: {
    routing: { mode: 'balanced', explain: true, traceBuffer: 100 },
    resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
    logLevel: 'error',
  },
  extensions: { paths: [] },
  providers: {},
  server: { port: 8081, host: '0.0.0.0' },
}

function uniqueSocket(): string {
  return platform() === 'win32'
    ? `\\\\.\\pipe\\rohinik-launcher-test-${randomUUID()}`
    : `/tmp/rohinik-launcher-test-${randomUUID()}.sock`
}

describe('RuntimeLauncher', () => {
  afterEach(async () => {
    await RuntimeLauncher.detach()
    RuntimeLauncher._reset()
  })

  it('attach() starts and returns a READY host', async () => {
    const host = await RuntimeLauncher.attach(config, uniqueSocket())
    expect(host.state).toBe('READY')
  })

  it('attach() returns same instance on second call', async () => {
    const socket = uniqueSocket()
    const h1 = await RuntimeLauncher.attach(config, socket)
    const h2 = await RuntimeLauncher.attach(config, socket)
    expect(h1).toBe(h2)
  })

  it('detach() stops the host', async () => {
    const host = await RuntimeLauncher.attach(config, uniqueSocket())
    await RuntimeLauncher.detach()
    expect(host.state).toBe('STOPPED')
  })
})
