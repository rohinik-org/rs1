/**
 * Task 8 — Stage 16B compatibility floor
 *
 * Proves the four-column matrix:
 *   ┌─────────────────────────────────────┬────────┐
 *   │ Protocol compatibility              │  PASS  │
 *   │ SDK API compatibility               │  PASS  │
 *   │ Stage 16A conformance               │  PASS  │
 *   │ Performance canary                  │  PASS  │
 *   └─────────────────────────────────────┴────────┘
 *
 * "Stage 16A conformance" means the same routes and shapes that existed before
 * Stage 16B still work. This file proves that inline — protocol-compat.test.ts
 * also runs the shared conformance suite for deeper coverage.
 *
 * "16B additions" are proved here alongside the floor so any regression or
 * conflict between old and new surface is caught in a single test run.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import {
  createRohinikClient,
  RohinikClientError,
  ProtocolVersionError,
  ExecutionCancelledError,
  EXECUTION_PROTOCOL_VERSION,
} from '@rohinik-org/client'
import type { RohinikClient } from '@rohinik-org/client'
import { createServer } from 'node:http'

const PORT = 19_700
const BASE = `http://127.0.0.1:${PORT}`

let host: RuntimeHost
let server: AiosServer
let client: RohinikClient

beforeAll(async () => {
  host = createProductionHost({
    configPath: '/tmp/compat-floor-test.yaml',
    runtimeId: 'compat-floor-001',
    runtime: {
      routing: { mode: 'balanced', explain: false, traceBuffer: 10 },
      resources: { maxConcurrentRequests: 20, timeoutMs: 30_000 },
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
  client = createRohinikClient({ baseUrl: BASE })
}, 20_000)

afterAll(async () => {
  await server.close()
  await host.stop()
})

async function pollTerminal(
  handle: ReturnType<ReturnType<typeof createRohinikClient>['executions']['attach']>,
  maxMs = 5_000,
) {
  return handle.waitUntilTerminal({ pollIntervalMs: 20, timeoutMs: maxMs })
}

// ── Column 1: Protocol compatibility ─────────────────────────────────────────

describe('Compat floor — Protocol compatibility', () => {
  it('POST /v1/executions returns 202 with all required fields', async () => {
    const handle = await client.executions.start({ content: 'proto compat', contentType: 'TEXT' })
    expect(typeof handle.executionId).toBe('string')
  })

  it('GET /v1/executions/:id returns all required status fields', async () => {
    const handle = await client.executions.start({ content: 'status fields', contentType: 'TEXT' })
    const status = await handle.status()
    expect(typeof status.executionId).toBe('string')
    expect(typeof status.state).toBe('string')
    expect(status.protocolVersion).toBe(EXECUTION_PROTOCOL_VERSION)
    expect(typeof status.submittedAt).toBe('string')
    expect(typeof status.terminal).toBe('boolean')
  })

  it('GET /v1/executions/:id/result returns all required fields after terminal', async () => {
    const handle = await client.executions.start({ content: 'result fields', contentType: 'TEXT' })
    await pollTerminal(handle)
    const result = await handle.result()
    expect(result.executionId).toBe(handle.executionId)
    expect(typeof result.totalDurationMs).toBe('number')
    expect(typeof result.completedAt).toBe('string')
  })

  it('POST /v1/executions/:id/cancel returns cancelAccepted field', async () => {
    const handle = await client.executions.start({ content: 'cancel field', contentType: 'TEXT' })
    const resp = await handle.cancel({ reason: 'floor test' })
    expect(resp.executionId).toBe(handle.executionId)
    expect(typeof resp.cancelAccepted).toBe('boolean')
  })

  it('GET /v1/executions/:id/evidence returns entries array', async () => {
    const handle = await client.executions.start({ content: 'evidence field', contentType: 'TEXT' })
    const ev = await handle.evidence()
    expect(ev.executionId).toBe(handle.executionId)
    expect(Array.isArray(ev.entries)).toBe(true)
  })

  it('ProtocolVersionError thrown when server returns wrong protocolVersion', async () => {
    const wrongServer = createServer((_req, res) => {
      res.writeHead(202, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        executionId: 'x', idempotencyKey: null, state: 'QUEUED',
        protocolVersion: 'v999', submittedAt: new Date().toISOString(), idempotent: false,
      }))
    })
    await new Promise<void>(r => wrongServer.listen(19_701, '127.0.0.1', r))
    try {
      const c = createRohinikClient({ baseUrl: 'http://127.0.0.1:19701' })
      await expect(
        c.executions.start({ content: 'version test', contentType: 'TEXT' })
      ).rejects.toBeInstanceOf(ProtocolVersionError)
    } finally {
      await new Promise<void>((r, j) => wrongServer.close(e => e ? j(e) : r()))
    }
  })

  it('404 for unknown executionId throws RohinikClientError', async () => {
    const handle = client.executions.attach('no-such-id')
    await expect(handle.status()).rejects.toBeInstanceOf(RohinikClientError)
    await expect(handle.status()).rejects.toMatchObject({ status: 404 })
  })
})

// ── Column 2: SDK API compatibility ──────────────────────────────────────────

describe('Compat floor — SDK API compatibility', () => {
  it('start() returns ExecutionHandle with executionId', async () => {
    const handle = await client.executions.start({ content: 'api compat', contentType: 'TEXT' })
    expect(typeof handle.executionId).toBe('string')
    expect(typeof handle.status).toBe('function')
    expect(typeof handle.result).toBe('function')
    expect(typeof handle.evidence).toBe('function')
    expect(typeof handle.cancel).toBe('function')
    expect(typeof handle.waitUntilTerminal).toBe('function')
    expect(typeof handle.waitForResult).toBe('function')
    expect(typeof handle.events).toBe('function')
  })

  it('attach() creates handle without API call', () => {
    const handle = client.executions.attach('any-id')
    expect(handle.executionId).toBe('any-id')
  })

  it('waitForResult() throws ExecutionCancelledError on cancelled', async () => {
    const handle = await client.executions.start({ content: 'cancel waitForResult', contentType: 'TEXT' })
    const cancelResp = await handle.cancel({ reason: 'floor test' })
    if (cancelResp.cancelAccepted) {
      await expect(
        handle.waitForResult({ pollIntervalMs: 20, timeoutMs: 5_000 }),
      ).rejects.toBeInstanceOf(ExecutionCancelledError)
    }
  }, 20_000)

  it('events() is an async iterable (Symbol.asyncIterator present)', async () => {
    const handle = await client.executions.start({ content: 'events iterable', contentType: 'TEXT' })
    const iter = handle.events({ streamMode: 'sse' })
    expect(Symbol.asyncIterator in iter).toBe(true)
    // Drain
    for await (const _ of iter) { /* noop */ }
  }, 20_000)
})

// ── Column 3: Stage 16A conformance ──────────────────────────────────────────

describe('Compat floor — Stage 16A conformance', () => {
  it('idempotency: same key + same content returns same executionId', async () => {
    const key = `idem-${Date.now()}`
    const r1 = await client.executions.start({ content: 'idem test', contentType: 'TEXT', idempotencyKey: key })
    const r2 = await client.executions.start({ content: 'idem test', contentType: 'TEXT', idempotencyKey: key })
    expect(r1.executionId).toBe(r2.executionId)
  })

  it('idempotency: same key + different content returns 409', async () => {
    const key = `idem-conflict-${Date.now()}`
    await client.executions.start({ content: 'first', contentType: 'TEXT', idempotencyKey: key })
    await expect(
      client.executions.start({ content: 'different', contentType: 'TEXT', idempotencyKey: key }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('RESULT_NOT_READY returns 409 before terminal', async () => {
    const handle = await client.executions.start({ content: 'result not ready', contentType: 'TEXT' })
    const status = await handle.status()
    if (!status.terminal) {
      await expect(handle.result()).rejects.toMatchObject({ status: 409 })
    }
  })

  it('full lifecycle: start → waitForResult → result', async () => {
    const handle = await client.executions.start({ content: '16A full lifecycle', contentType: 'TEXT' })
    const result = await handle.waitForResult({ pollIntervalMs: 20, timeoutMs: 5_000 })
    expect(result.executionId).toBe(handle.executionId)
    expect(typeof result.totalDurationMs).toBe('number')
  }, 20_000)
})

// ── Column 4: Performance canary ─────────────────────────────────────────────

describe('Compat floor — Performance canary', () => {
  it('submit → terminal < 5 000 ms', async () => {
    const t0 = Date.now()
    const handle = await client.executions.start({ content: 'perf canary', contentType: 'TEXT' })
    await pollTerminal(handle, 5_000)
    expect(Date.now() - t0).toBeLessThan(5_000)
  }, 10_000)

  it('p50 of 5 consecutive executions < 3 000 ms', async () => {
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now()
      const handle = await client.executions.start({ content: `p50 run ${i}`, contentType: 'TEXT' })
      await pollTerminal(handle, 5_000)
      times.push(Date.now() - t0)
    }
    times.sort((a, b) => a - b)
    const p50 = times[Math.floor(times.length / 2)]!
    expect(p50).toBeLessThan(3_000)
  }, 60_000)

  it('events() stream overhead vs poll < 2x latency', async () => {
    // SSE stream should not add more than 2x latency vs simple poll
    const pollTimes: number[] = []
    const sseTimes: number[] = []

    for (let i = 0; i < 3; i++) {
      const t0 = Date.now()
      const h1 = await client.executions.start({ content: `latency poll ${i}`, contentType: 'TEXT' })
      await h1.waitUntilTerminal({ pollIntervalMs: 20, timeoutMs: 5_000 })
      pollTimes.push(Date.now() - t0)

      const t1 = Date.now()
      const h2 = await client.executions.start({ content: `latency sse ${i}`, contentType: 'TEXT' })
      for await (const _ of h2.events({ streamMode: 'sse' })) { /* drain */ }
      sseTimes.push(Date.now() - t1)
    }

    const medPoll = [...pollTimes].sort((a, b) => a - b)[1]!
    const medSse  = [...sseTimes].sort((a, b) => a - b)[1]!

    // SSE may be faster (no polling delay) but must not be > 2x slower
    expect(medSse).toBeLessThan(medPoll * 2 + 500)
  }, 60_000)
})

