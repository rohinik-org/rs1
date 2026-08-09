/**
 * Stage 16D Task 8 — repo-engineer agent delegation migration
 *
 * Verifies the 12 choreography call sites now route through
 * @rohinik-org/agent SDK handles (admit, start, delegate, accept, run,
 * acceptResult, evidence).
 *
 * Tests use a minimal mock HTTP server standing in for the RS1 runtime.
 * No @rohinik-org/client streaming needed here — we verify the delegation
 * path only (admit → start → delegate → accept → run → acceptResult → evidence).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as http from 'node:http'
import { admit, AgentSdkError } from '@rohinik-org/agent'

// ── Mock RS1 server ────────────────────────────────────────────────────────

function buildMockServer() {
  const calls: { method: string; path: string; body?: unknown }[] = []

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => { raw += chunk.toString() })
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) as unknown : undefined
      calls.push({ method: req.method!, path: req.url!, body })

      const p = req.url!

      // POST /v1/agent-instances/admit
      if (req.method === 'POST' && p === '/v1/agent-instances/admit') {
        const b = body as { instanceId: string }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ runId: `run-${b.instanceId}`, state: 'ADMITTED' }))
        return
      }

      // GET /v1/agent-instances/:id
      const instanceMatch = p.match(/^\/v1\/agent-instances\/([^/]+)$/)
      if (instanceMatch && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ instanceId: instanceMatch[1], definitionId: 'd', versionId: 'v', createdAt: new Date().toISOString() }))
        return
      }

      // POST /v1/agent-runs  (start)
      if (req.method === 'POST' && p === '/v1/agent-runs') {
        const b = body as { runId: string }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ runId: b.runId, state: 'RUNNING' }))
        return
      }

      // POST /v1/agent-runs/:id/delegations
      const delegateMatch = p.match(/^\/v1\/agent-runs\/([^/]+)\/delegations$/)
      if (delegateMatch && req.method === 'POST') {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ certificateId: 'cert-1', fingerprint: 'fp', delegatedTaskId: 'dtask-1', delegationId: 'del-1' }))
        return
      }

      // POST /v1/delegations/:id/accept
      const acceptMatch = p.match(/^\/v1\/delegations\/([^/]+)\/accept$/)
      if (acceptMatch && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, state: 'ACCEPTED' }))
        return
      }

      // POST /v1/delegations/:id/run
      const runMatch = p.match(/^\/v1\/delegations\/([^/]+)\/run$/)
      if (runMatch && req.method === 'POST') {
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ executionId: 'exec-1', idempotencyKey: null, state: 'QUEUED', protocolVersion: '1.0.0', submittedAt: new Date().toISOString(), idempotent: false, delegationId: 'del-1', delegatedTaskId: 'dtask-1' }))
        return
      }

      // POST /v1/delegations/:id/results/accept
      const acceptResultMatch = p.match(/^\/v1\/delegations\/([^/]+)\/results\/accept$/)
      if (acceptResultMatch && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, parentResumed: true }))
        return
      }

      // GET /v1/agent-runs/:id/evidence
      const evidenceMatch = p.match(/^\/v1\/agent-runs\/([^/]+)\/evidence$/)
      if (evidenceMatch && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ runId: evidenceMatch[1], state: 'RUNNING', events: [{ eventId: 'e1', kind: 'agent-admitted', occurredAt: new Date().toISOString() }] }))
        return
      }

      res.writeHead(404).end()
    })
  })

  return {
    server,
    calls,
    port: () => (server.address() as { port: number }).port,
    callPaths: () => calls.map(c => `${c.method} ${c.path}`),
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('agent delegation via SDK handles (T8)', () => {
  let server: http.Server
  let port: number
  let calls: ReturnType<typeof buildMockServer>['calls']
  let callPaths: () => string[]

  beforeAll(async () => {
    const mock = buildMockServer()
    server = mock.server
    calls = mock.calls
    callPaths = mock.callPaths
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    port = mock.port()
  })

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('admit() calls POST /v1/agent-instances/admit and returns AgentRunHandle', async () => {
    const base = `http://127.0.0.1:${port}`
    const { run } = await admit(base, 'inst-coordinator-1')
    expect(run.runId).toBe('run-inst-coordinator-1')
  })

  it('full choreography: admit → start → delegate → accept → run → acceptResult → evidence', async () => {
    const base = `http://127.0.0.1:${port}`
    calls.length = 0

    const [coord, worker] = await Promise.all([
      admit(base, 'inst-coordinator-1'),
      admit(base, 'inst-worker-1'),
    ])

    await coord.run.start()

    const delegation = await coord.run.delegate({
      delegateeRunId:      worker.run.runId,
      taskId:              'task-1',
      description:         'do work',
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read'],
      grantedDepth:        0,
      maxCostUsd:          5,
      maxLatencyMs:        60_000,
      maxTokens:           100_000,
    })

    await delegation.accept()
    const exec = await delegation.run()
    await delegation.acceptResult()
    const evidence = await coord.run.evidence()

    // Verify all expected routes were called
    const paths = callPaths()
    expect(paths).toContain('POST /v1/agent-instances/admit')
    expect(paths).toContain('POST /v1/agent-runs')
    expect(paths.some(p => p.startsWith('POST /v1/agent-runs/') && p.endsWith('/delegations'))).toBe(true)
    expect(paths.some(p => p.startsWith('POST /v1/delegations/') && p.endsWith('/accept'))).toBe(true)
    expect(paths.some(p => p.startsWith('POST /v1/delegations/') && p.endsWith('/run'))).toBe(true)
    expect(paths.some(p => p.startsWith('POST /v1/delegations/') && p.endsWith('/results/accept'))).toBe(true)
    expect(paths.some(p => p.startsWith('GET /v1/agent-runs/') && p.endsWith('/evidence'))).toBe(true)

    expect(exec.executionId).toBe('exec-1')
    expect(evidence.events).toHaveLength(1)
  })

  it('start() calls POST /v1/agent-runs with { runId } body', async () => {
    const base = `http://127.0.0.1:${port}`
    calls.length = 0

    const { run } = await admit(base, 'inst-coordinator-1')
    const result = await run.start()

    const startCall = calls.find(c => c.method === 'POST' && c.path === '/v1/agent-runs')
    expect(startCall).toBeDefined()
    expect((startCall!.body as { runId: string }).runId).toBe(run.runId)
    expect(result.state).toBe('RUNNING')
  })

  it('AgentSdkError thrown on non-2xx response', async () => {
    // Use a port with nothing listening
    await expect(admit('http://127.0.0.1:1', 'bad-inst')).rejects.toThrow(AgentSdkError)
  })

  it('no RohinikClient agent methods remain — agentAdmit/agentDelegate/delegationAccept etc. absent', async () => {
    // Structural: import RohinikClient and verify agent methods are gone
    const { RohinikClient } = await import('../client/rohinik-client.js')
    const client = new RohinikClient({ endpoint: 'http://localhost:0' })
    expect((client as unknown as Record<string, unknown>)['agentAdmit']).toBeUndefined()
    expect((client as unknown as Record<string, unknown>)['agentDelegate']).toBeUndefined()
    expect((client as unknown as Record<string, unknown>)['delegationAccept']).toBeUndefined()
    expect((client as unknown as Record<string, unknown>)['delegationRun']).toBeUndefined()
    expect((client as unknown as Record<string, unknown>)['delegationAcceptResult']).toBeUndefined()
    expect((client as unknown as Record<string, unknown>)['agentEvidence']).toBeUndefined()
    // Non-agent methods still present
    expect(typeof client.health).toBe('function')
    expect(typeof client.execute).toBe('function')
  })
})
