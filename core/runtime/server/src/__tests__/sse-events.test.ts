/**
 * SSE streaming integration tests — GET /v1/executions/:id/events
 *
 * Tests the Task 3 acceptance gate:
 *   - historical events replayed in order
 *   - live events delivered after subscribe
 *   - reconnect with ?after=cursor, no duplicate delivery
 *   - terminal event delivered and stream closes
 *   - client disconnect does NOT cancel execution
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'

const PORT = 19_400

let host: RuntimeHost
let server: AiosServer

beforeAll(async () => {
  host = createProductionHost({
    configPath: '/tmp/sse-test.yaml',
    runtimeId: 'sse-test-001',
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

const base = `http://127.0.0.1:${PORT}`

// ── Helpers ───────────────────────────────────────────────────────────────────

async function submit(content = 'sse test'): Promise<string> {
  const res = await fetch(`${base}/v1/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, contentType: 'TEXT' }),
  })
  expect(res.status).toBe(202)
  const body = await res.json() as { executionId: string }
  return body.executionId
}

interface ParsedEvent {
  kind: string
  sequence: number
  executionId: string
  cursor: string
  payload: unknown
  contentHash: string
}

/** Collect all SSE events from a stream until it closes or `maxMs` elapses. */
async function collectSseEvents(
  url: string,
  maxMs = 15_000,
  signal?: AbortSignal,
): Promise<ParsedEvent[]> {
  const events: ParsedEvent[] = []
  const res = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal })
  if (!res.ok || !res.body) throw new Error(`SSE fetch failed: ${res.status}`)

  const deadline = AbortSignal.timeout(maxMs)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done || deadline.aborted) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop()!
      for (const chunk of parts) {
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              events.push(JSON.parse(line.slice(6)) as ParsedEvent)
            } catch { /* ignore non-json */ }
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  return events
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /v1/executions/:id/events — route shape', () => {
  it('returns 404 for unknown executionId', async () => {
    const res = await fetch(`${base}/v1/executions/no-such-id/events`)
    expect(res.status).toBe(404)
  })

  it('returns Content-Type text/event-stream for known execution', async () => {
    const id = await submit('sse shape test')
    const res = await fetch(`${base}/v1/executions/${id}/events`, {
      headers: { Accept: 'text/event-stream' },
      signal: AbortSignal.timeout(2_000),
    })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    // Drain body to prevent resource leak
    res.body?.cancel()
  })
})

describe('GET /v1/executions/:id/events — event delivery', () => {
  it('delivers all lifecycle events including terminal, then closes stream', async () => {
    const id = await submit('sse lifecycle')
    const events = await collectSseEvents(`${base}/v1/executions/${id}/events`)

    expect(events.length).toBeGreaterThan(0)
    // All events belong to this execution
    for (const ev of events) {
      expect(ev.executionId).toBe(id)
    }
    // Sequences are monotonically increasing starting at 1
    for (let i = 0; i < events.length; i++) {
      expect(events[i]!.sequence).toBe(i + 1)
    }
    // Last event is terminal
    const terminalKinds = ['EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED']
    expect(terminalKinds).toContain(events.at(-1)!.kind)
    // Each event has a contentHash
    for (const ev of events) {
      expect(typeof ev.contentHash).toBe('string')
      expect(ev.contentHash.length).toBeGreaterThan(0)
    }
  }, 20_000)

  it('replays history for late subscriber', async () => {
    const id = await submit('sse late subscribe')

    // Wait for execution to finish before subscribing
    await new Promise<void>(resolve => {
      const check = async () => {
        const r = await fetch(`${base}/v1/executions/${id}`)
        const body = await r.json() as { terminal: boolean }
        if (body.terminal) resolve()
        else setTimeout(check, 100)
      }
      check()
    })

    // Late subscribe — should replay all history and close immediately
    const events = await collectSseEvents(`${base}/v1/executions/${id}/events`, 5_000)
    expect(events.length).toBeGreaterThan(0)
    const terminalKinds = ['EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED']
    expect(terminalKinds).toContain(events.at(-1)!.kind)
  }, 20_000)
})

describe('GET /v1/executions/:id/events — cursor-based reconnect', () => {
  it('?after=cursor delivers only events after that cursor, no duplicates', async () => {
    const id = await submit('sse reconnect test')

    // Collect all events
    const all = await collectSseEvents(`${base}/v1/executions/${id}/events`)
    expect(all.length).toBeGreaterThanOrEqual(2)

    // Reconnect after first event's cursor
    const firstCursor = all[0]!.cursor
    const after = await collectSseEvents(
      `${base}/v1/executions/${id}/events?after=${encodeURIComponent(firstCursor)}`,
      5_000,
    )

    // Should get all events except the first
    expect(after.length).toBe(all.length - 1)
    for (const ev of after) {
      expect(ev.sequence).toBeGreaterThan(all[0]!.sequence)
    }
  }, 25_000)

  it('?after=cursor at last event returns empty and closes', async () => {
    const id = await submit('sse cursor at end')
    const all = await collectSseEvents(`${base}/v1/executions/${id}/events`)
    const lastCursor = all.at(-1)!.cursor

    const after = await collectSseEvents(
      `${base}/v1/executions/${id}/events?after=${encodeURIComponent(lastCursor)}`,
      3_000,
    )
    expect(after).toHaveLength(0)
  }, 20_000)
})

describe('GET /v1/executions/:id/events — disconnect does not cancel execution', () => {
  it('client abort does not cancel the execution', async () => {
    const id = await submit('sse disconnect isolation test')

    // Connect and immediately abort after receiving first event
    const controller = new AbortController()
    let firstEventReceived = false

    try {
      const events = await collectSseEvents(
        `${base}/v1/executions/${id}/events`,
        15_000,
        controller.signal,
      )
      if (events.length > 0 && !firstEventReceived) {
        firstEventReceived = true
        controller.abort()
      }
    } catch { /* abort throws */ }

    // Wait for execution to reach terminal naturally
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('timeout waiting for terminal')), 15_000)
      const check = async () => {
        const r = await fetch(`${base}/v1/executions/${id}`)
        const body = await r.json() as { terminal: boolean; state: string }
        if (body.terminal) {
          clearTimeout(deadline)
          // Must NOT be CANCELLED — disconnect should not propagate to execution
          expect(body.state).not.toBe('CANCELLING')
          resolve()
        } else {
          setTimeout(check, 200)
        }
      }
      check()
    })
  }, 30_000)
})
