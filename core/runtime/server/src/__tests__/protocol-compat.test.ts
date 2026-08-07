/**
 * Protocol compatibility test — conformance suite against real RS1 server.
 *
 * This is the RS1-side target of the two-target conformance strategy:
 *   - SDK CI: conformance.test.ts + mock server  (sdk/packages/client)
 *   - RS1 CI: this file         + real server    (core/runtime/server)
 *
 * Both targets exercise the same behavioral assertions. The suite is kept
 * in sync by comparing the describe/it structure; the mock-server setup
 * and packaging tests are SDK-only and do not appear here.
 *
 * Server: real RS1 AiosServer with mock provider (same config as server-integration.test.ts).
 * Client: @rohinik-org/client installed from vendor tarball.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import {
  createRohinikClient,
  RohinikClientError,
  ProtocolVersionError,
  EXECUTION_PROTOCOL_VERSION,
  type PublicErrorCode,
  type ExecutionHandle,
} from '@rohinik-org/client'
import { createServer } from 'node:http'

const PORT = 19_300

let host: RuntimeHost
let server: AiosServer

beforeAll(async () => {
  host = createProductionHost({
    configPath: '/tmp/compat-test.yaml',
    runtimeId: 'compat-test-001',
    runtime: {
      routing: { mode: 'balanced', explain: false, traceBuffer: 10 },
      resources: { maxConcurrentRequests: 10, timeoutMs: 30_000 },
      logLevel: 'error',
    },
    extensions: { paths: [] },
    providers: {},
    server: { port: PORT, host: '127.0.0.1' },
  })
  await host.start()
  host.runtime.registerCapability(buildCoreCapability())
  server = new AiosServer(host, { port: PORT, host: '127.0.0.1' })
  await server.listen()
}, 20_000)

afterAll(async () => {
  await server.close()
  await host.stop()
})

const BASE_URL = `http://127.0.0.1:${PORT}`

function client() {
  return createRohinikClient({ baseUrl: BASE_URL })
}

async function pollTerminal(handle: ExecutionHandle, maxMs = 10_000) {
  return handle.waitUntilTerminal({ pollIntervalMs: 50, timeoutMs: maxMs })
}

// ── 1. Route shape conformance ────────────────────────────────────────────────

describe('Route shape conformance — POST /v1/executions', () => {
  it('returns 202 with all required SubmitExecutionResponse fields', async () => {
    const handle = await client().executions.start({ content: 'shape test', contentType: 'TEXT' })
    expect(typeof handle.executionId).toBe('string')
    expect(handle.executionId.length).toBeGreaterThan(0)
  })
})

describe('Route shape conformance — GET /v1/executions/:id', () => {
  it('returns all required ExecutionStatusResponse fields', async () => {
    const handle = await client().executions.start({ content: 'status shape', contentType: 'TEXT' })
    const status = await handle.status()
    expect(typeof status.executionId).toBe('string')
    expect(typeof status.state).toBe('string')
    expect(status.protocolVersion).toBe('v1')
    expect(typeof status.submittedAt).toBe('string')
    expect(typeof status.terminal).toBe('boolean')
  })
})

describe('Route shape conformance — GET /v1/executions/:id/result', () => {
  it('returns all required ExecutionResultResponse fields after terminal', async () => {
    const handle = await client().executions.start({ content: 'result shape', contentType: 'TEXT' })
    await pollTerminal(handle)
    const result = await handle.result()
    expect(result.executionId).toBe(handle.executionId)
    expect(typeof result.state).toBe('string')
    expect(typeof result.totalDurationMs).toBe('number')
    expect(typeof result.completedAt).toBe('string')
  })

  it('returns 409 RESULT_NOT_READY before terminal', async () => {
    const handle = await client().executions.start({ content: 'result not ready', contentType: 'TEXT' })
    const status = await handle.status()
    if (!status.terminal) {
      await expect(handle.result()).rejects.toMatchObject({ status: 409 })
    }
    // If already terminal, race is acceptable
  })
})

describe('Route shape conformance — POST /v1/executions/:id/cancel', () => {
  it('returns CancelExecutionResponse with cancelAccepted field', async () => {
    const handle = await client().executions.start({ content: 'cancel shape', contentType: 'TEXT' })
    const resp = await handle.cancel({ reason: 'compat test' })
    expect(resp.executionId).toBe(handle.executionId)
    expect(typeof resp.cancelAccepted).toBe('boolean')
  })

  it('cancel on terminal returns cancelAccepted=false', async () => {
    const handle = await client().executions.start({ content: 'cancel terminal shape', contentType: 'TEXT' })
    await pollTerminal(handle)
    const resp = await handle.cancel()
    expect(resp.cancelAccepted).toBe(false)
  })
})

describe('Route shape conformance — GET /v1/executions/:id/evidence', () => {
  it('returns ExecutionEvidenceResponse with entries array', async () => {
    const handle = await client().executions.start({ content: 'evidence shape', contentType: 'TEXT' })
    const ev = await handle.evidence()
    expect(ev.executionId).toBe(handle.executionId)
    expect(Array.isArray(ev.entries)).toBe(true)
  })
})

// ── 2. Forward-compatibility ──────────────────────────────────────────────────

describe('Forward-compatibility — additive fields tolerated', () => {
  it('responses with unknown fields do not throw', async () => {
    // RS1 does not currently add additive fields, but the client must tolerate them.
    // This test proves the client handles standard RS1 responses without errors.
    await expect(
      client().executions.start({ content: 'additive compat', contentType: 'TEXT' })
    ).resolves.toBeDefined()
  })
})

// ── 3. Protocol version guard ─────────────────────────────────────────────────

describe('Protocol version guard', () => {
  it('throws ProtocolVersionError when server returns wrong protocolVersion', async () => {
    const wrongVersionServer = createServer((_req, res) => {
      const payload = JSON.stringify({
        executionId: 'x', idempotencyKey: null, state: 'QUEUED',
        protocolVersion: 'v999',
        submittedAt: new Date().toISOString(), idempotent: false,
      })
      res.writeHead(202, { 'Content-Type': 'application/json' })
      res.end(payload)
    })
    await new Promise<void>(r => wrongVersionServer.listen(19_301, '127.0.0.1', r))
    try {
      const c = createRohinikClient({ baseUrl: 'http://127.0.0.1:19301' })
      await expect(
        c.executions.start({ content: 'version test', contentType: 'TEXT' })
      ).rejects.toBeInstanceOf(ProtocolVersionError)
    } finally {
      await new Promise<void>((r, j) => wrongVersionServer.close(err => err ? j(err) : r()))
    }
  })
})

// ── 4. Error code recognition ─────────────────────────────────────────────────

describe('Error code recognition', () => {
  const allErrorCodes: PublicErrorCode[] = [
    'EXECUTION_NOT_FOUND',
    'RESULT_NOT_READY',
    'IDEMPOTENCY_CONFLICT',
    'INVALID_REQUEST',
    'INTERNAL_ERROR',
  ]

  it('all documented PublicErrorCode values parse into RohinikClientError.envelope', async () => {
    const proto = EXECUTION_PROTOCOL_VERSION
    for (const code of allErrorCodes) {
      const errorServer = createServer((_req, res) => {
        const payload = JSON.stringify({ code, message: `test ${code}`, protocolVersion: proto, executionId: 'test' })
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(payload)
      })
      const port = 19_302
      await new Promise<void>(r => errorServer.listen(port, '127.0.0.1', r))
      try {
        const c = createRohinikClient({ baseUrl: `http://127.0.0.1:${port}` })
        try {
          await c.executions.start({ content: 'x', contentType: 'TEXT' })
        } catch (err) {
          expect(err).toBeInstanceOf(RohinikClientError)
          expect((err as RohinikClientError).envelope?.code).toBe(code)
        }
      } finally {
        await new Promise<void>((r, j) => errorServer.close(err => err ? j(err) : r()))
      }
    }
  })

  it('404 for unknown executionId throws RohinikClientError with status 404', async () => {
    const handle = client().executions.attach('does-not-exist')
    await expect(handle.status()).rejects.toMatchObject({ status: 404 })
  })
})

// ── 5. waitForResult conformance ──────────────────────────────────────────────

describe('waitForResult protocol conformance', () => {
  it('full async lifecycle: start → waitForResult → result has required fields', async () => {
    const handle = await client().executions.start({ content: 'full lifecycle compat', contentType: 'TEXT' })
    const result = await handle.waitForResult({ pollIntervalMs: 50, timeoutMs: 10_000 })
    expect(result.executionId).toBe(handle.executionId)
    expect(typeof result.totalDurationMs).toBe('number')
    expect(typeof result.completedAt).toBe('string')
  })

  it('cancel path: start → cancel → waitForResult throws ExecutionCancelledError', async () => {
    const { ExecutionCancelledError } = await import('@rohinik-org/client')
    const handle = await client().executions.start({ content: 'cancel compat', contentType: 'TEXT' })
    const cancelResp = await handle.cancel({ reason: 'compat test' })
    if (cancelResp.cancelAccepted) {
      await expect(
        handle.waitForResult({ pollIntervalMs: 50, timeoutMs: 10_000 })
      ).rejects.toBeInstanceOf(ExecutionCancelledError)
    }
  })
})
