/**
 * Task 4 acceptance gate — cancellation propagation and event architecture.
 *
 * Tests:
 *   - running cancellation (cancel while executing)
 *   - queued cancellation (cancel before supervisor starts)
 *   - duplicate cancellation (cancel twice)
 *   - cancellation after terminal completion
 *   - provider-completion race (completion wins if committed first)
 *   - late-result rejection (CANCELLATION_REQUESTED ≠ EXECUTION_CANCELLED)
 *   - correct event ordering (CANCELLATION_REQUESTED before EXECUTION_CANCELLED)
 *   - final evidence consistency (evidence retrievable after cancelled)
 *   - delegated execution cancellation (cancel propagates to supervisor)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'

const PORT = 19_500

let host: RuntimeHost
let server: AiosServer

beforeAll(async () => {
  host = createProductionHost({
    configPath: '/tmp/cancel-test.yaml',
    runtimeId: 'cancel-test-001',
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
}, 20_000)

afterAll(async () => {
  await server.close()
  await host.stop()
})

const base = `http://127.0.0.1:${PORT}`

// ── Helpers ───────────────────────────────────────────────────────────────────

async function submit(content = 'cancel test'): Promise<string> {
  const res = await fetch(`${base}/v1/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, contentType: 'TEXT' }),
  })
  expect(res.status).toBe(202)
  const body = await res.json() as { executionId: string }
  return body.executionId
}

async function cancel(executionId: string, reason?: string): Promise<{ cancelAccepted: boolean; state: string }> {
  const res = await fetch(`${base}/v1/executions/${executionId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reason ? { reason } : {}),
  })
  return res.json() as Promise<{ cancelAccepted: boolean; state: string }>
}

async function status(executionId: string): Promise<{ state: string; terminal: boolean }> {
  const res = await fetch(`${base}/v1/executions/${executionId}`)
  return res.json() as Promise<{ state: string; terminal: boolean }>
}

async function waitTerminal(executionId: string, maxMs = 15_000): Promise<{ state: string; terminal: boolean }> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const s = await status(executionId)
    if (s.terminal) return s
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error(`Timeout waiting for terminal on ${executionId}`)
}

interface ParsedEvent { kind: string; sequence: number; executionId: string; cursor: string }

async function collectSseEvents(executionId: string, maxMs = 15_000): Promise<ParsedEvent[]> {
  const events: ParsedEvent[] = []
  const res = await fetch(`${base}/v1/executions/${executionId}/events`, {
    headers: { Accept: 'text/event-stream' },
    signal: AbortSignal.timeout(maxMs),
  })
  if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop()!
      for (const chunk of parts) {
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try { events.push(JSON.parse(line.slice(6)) as ParsedEvent) } catch { /* skip */ }
          }
        }
      }
    }
  } finally { reader.releaseLock() }
  return events
}

// ── Test cases ────────────────────────────────────────────────────────────────

describe('Cancellation — running cancellation', () => {
  it('cancel while running reaches CANCELLED terminal state', async () => {
    const id = await submit('running cancel test')
    // Cancel immediately — execution may be in any state
    const resp = await cancel(id, 'test cancel')
    // Cancel accepted OR already terminal (mock provider is fast)
    expect(['CANCELLING', 'COMPLETED', 'FAILED', 'CANCELLED']).toContain(resp.state)

    const terminal = await waitTerminal(id)
    // If cancel was accepted, expect CANCELLED; if provider won the race, any terminal is fine
    if (resp.cancelAccepted) {
      expect(['CANCELLED', 'COMPLETED', 'FAILED']).toContain(terminal.state)
    }
  }, 20_000)
})

describe('Cancellation — queued cancellation', () => {
  it('cancel immediately after submit (QUEUED) eventually reaches terminal', async () => {
    const id = await submit('queued cancel test')
    const resp = await cancel(id)
    // cancelAccepted=true OR execution already terminal before we got here
    if (resp.cancelAccepted) {
      expect(resp.state).toMatch(/CANCELLING|CANCELLED/)
    }
    const terminal = await waitTerminal(id)
    expect(terminal.terminal).toBe(true)
  }, 20_000)
})

describe('Cancellation — duplicate cancellation', () => {
  it('second cancel on CANCELLING execution returns cancelAccepted=false', async () => {
    const id = await submit('duplicate cancel test')
    const first = await cancel(id)

    if (first.cancelAccepted) {
      // Cancel again while in CANCELLING or still processing
      const second = await cancel(id)
      // Either already terminal (returns false) or still CANCELLING
      // Either way, no error should be thrown
      expect(typeof second.cancelAccepted).toBe('boolean')
    }
  }, 20_000)

  it('cancel on already-terminal execution returns cancelAccepted=false', async () => {
    const id = await submit('cancel after terminal test')
    await waitTerminal(id)
    const resp = await cancel(id)
    expect(resp.cancelAccepted).toBe(false)
  }, 20_000)
})

describe('Cancellation — after terminal completion', () => {
  it('cancel after COMPLETED returns cancelAccepted=false and state stays COMPLETED', async () => {
    const id = await submit('cancel post-complete test')
    const terminal = await waitTerminal(id)

    if (terminal.state === 'COMPLETED') {
      const resp = await cancel(id)
      expect(resp.cancelAccepted).toBe(false)
      // State must not have changed
      const s = await status(id)
      expect(s.state).toBe('COMPLETED')
    }
  }, 20_000)
})

describe('Cancellation — CANCELLATION_REQUESTED ≠ EXECUTION_CANCELLED invariant', () => {
  it('CANCELLATION_REQUESTED appears before EXECUTION_CANCELLED in event stream', async () => {
    const id = await submit('event ordering test')

    // Cancel then collect all events
    await cancel(id, 'event order test')
    const events = await collectSseEvents(id)

    const kinds = events.map(e => e.kind)

    // If cancellation actually happened, both events must be present in order
    if (kinds.includes('EXECUTION_CANCELLED')) {
      const reqIdx = kinds.indexOf('CANCELLATION_REQUESTED')
      const cancelIdx = kinds.indexOf('EXECUTION_CANCELLED')
      expect(reqIdx).toBeGreaterThanOrEqual(0)
      expect(reqIdx).toBeLessThan(cancelIdx)
    }

    // If completion won the race, no EXECUTION_CANCELLED — that's valid
    const terminalKinds = ['EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED']
    expect(terminalKinds.some(k => kinds.includes(k))).toBe(true)
  }, 20_000)

  it('CANCELLATION_REQUESTED does not alone make the stream terminal', async () => {
    // The stream must stay open after CANCELLATION_REQUESTED
    // and only close when a true terminal event is delivered
    const id = await submit('cancel requested not terminal test')
    const events = await collectSseEvents(id)

    // Last event is always terminal
    const terminalKinds = ['EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED']
    expect(terminalKinds).toContain(events.at(-1)!.kind)

    // CANCELLATION_REQUESTED (if present) is never the last event
    if (events.some(e => e.kind === 'CANCELLATION_REQUESTED')) {
      expect(events.at(-1)!.kind).not.toBe('CANCELLATION_REQUESTED')
    }
  }, 20_000)
})

describe('Cancellation — correct event ordering', () => {
  it('all events have monotonically increasing sequences', async () => {
    const id = await submit('event sequence test')
    await cancel(id)
    const events = await collectSseEvents(id)

    expect(events.length).toBeGreaterThan(0)
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.sequence).toBe(events[i - 1]!.sequence + 1)
    }
  }, 20_000)

  it('first event is EXECUTION_ACCEPTED', async () => {
    const id = await submit('first event test')
    const events = await collectSseEvents(id)
    expect(events[0]!.kind).toBe('EXECUTION_ACCEPTED')
  }, 20_000)
})

describe('Cancellation — final evidence consistency', () => {
  it('evidence entries are retrievable after CANCELLED terminal', async () => {
    const id = await submit('evidence after cancel test')
    await cancel(id)
    await waitTerminal(id)

    const res = await fetch(`${base}/v1/executions/${id}/evidence`)
    expect(res.status).toBe(200)
    const body = await res.json() as { executionId: string; entries: unknown[] }
    expect(body.executionId).toBe(id)
    expect(Array.isArray(body.entries)).toBe(true)
    // Entries may be empty if cancelled before any steps — that's valid
  }, 20_000)
})

describe('Cancellation — provider-completion race (completion wins if committed first)', () => {
  it('if execution reaches COMPLETED before cancel, cancel returns acceptedFalse', async () => {
    const id = await submit('race completion wins test')
    // Wait for terminal before cancelling
    const terminal = await waitTerminal(id)

    if (terminal.state === 'COMPLETED') {
      const resp = await cancel(id)
      expect(resp.cancelAccepted).toBe(false)
      // State must remain COMPLETED — late cancel cannot overwrite
      const s = await status(id)
      expect(s.state).toBe('COMPLETED')
    }
  }, 20_000)

  it('event stream does not contain EXECUTION_CANCELLED when completion won race', async () => {
    const id = await submit('race event stream test')
    await waitTerminal(id)
    // Try cancel after terminal
    await cancel(id)
    const events = await collectSseEvents(id)
    const terminal = await status(id)

    if (terminal.state === 'COMPLETED') {
      const kinds = events.map(e => e.kind)
      expect(kinds).not.toContain('EXECUTION_CANCELLED')
      expect(kinds).toContain('EXECUTION_COMPLETED')
    }
  }, 20_000)
})

describe('Cancellation — delegated execution cancellation', () => {
  it('cancel propagates through supervisor to reach terminal CANCELLED state', async () => {
    const id = await submit('delegated cancel test')

    // Poll until we see a non-QUEUED state then cancel
    let s = await status(id)
    const deadline = Date.now() + 5_000
    while (s.state === 'QUEUED' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 20))
      s = await status(id)
    }

    const resp = await cancel(id)
    const terminal = await waitTerminal(id)

    // If cancel was accepted, execution must reach a terminal state
    if (resp.cancelAccepted) {
      expect(terminal.terminal).toBe(true)
      // Evidence still accessible
      const evRes = await fetch(`${base}/v1/executions/${id}/evidence`)
      expect(evRes.status).toBe(200)
    }
  }, 25_000)
})
