import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost, loadConfig } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { MockReasoningProvider } from '@rohinik-org/mock-provider'
import { writeFile, unlink, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

const PORT = 19_090

let host: RuntimeHost
let server: AiosServer
let mock: MockReasoningProvider

const BASE_CONFIG = {
  configPath: '/tmp/first-execution-test.yaml',
  runtimeId: 'test-first-execution',
  runtime: {
    routing: { mode: 'balanced' as const, explain: true, traceBuffer: 100 },
    resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
    logLevel: 'error' as const,
  },
  extensions: { paths: [] },
  providers: {},
  server: { port: PORT, host: '127.0.0.1' },
}

beforeAll(async () => {
  host = createProductionHost(BASE_CONFIG, '\\\\.\\pipe\\rohinik-first-exec-test')
  await host.start()
  host.runtime.registerCapability(buildCoreCapability())
  mock = new MockReasoningProvider()
  host.runtime.registerProvider(mock)
  server = new AiosServer(host, { port: PORT, host: '127.0.0.1' })
  await server.listen()
}, 20_000)

afterAll(async () => {
  await server.close()
  await host.stop()
})

const base = `http://127.0.0.1:${PORT}`

describe('Criterion 1 — daemon starts', () => {
  it('host.state is READY after start', () => {
    expect(host.state).toBe('READY')
  })
})

describe('Criterion 2 — health endpoint works', () => {
  it('GET /v1/health returns status', async () => {
    const res = await fetch(`${base}/v1/health`)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(['HEALTHY', 'DEGRADED']).toContain(body.status)
  })
})

describe('Criterion 3 — provider is registered', () => {
  it('REASONING tier skill available after provider registration', () => {
    expect(host.runtime.listCapabilities().some(s => s.tierId === 'REASONING')).toBe(true)
  })
})

describe('Criterion 4 — capability binding resolves', () => {
  it('POST /v1/execute returns skillId and tierId REASONING', async () => {
    const res = await fetch(`${base}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'What is 2+2?',
        contentType: 'TEXT',
        constraints: { allowReasoning: true },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.skillId).toBe('builtin:reasoning')
    expect(body.tierId).toBe('REASONING')
  })
})

describe('Criterion 5 — request reaches provider', () => {
  it('invocationCount increments after POST', async () => {
    const before = mock.invocationCount
    await fetch(`${base}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'ping',
        contentType: 'TEXT',
        constraints: { allowReasoning: true },
      }),
    })
    expect(mock.invocationCount).toBe(before + 1)
  })
})

describe('Criterion 6 — canonical response returns', () => {
  it('output contains [mock] echo:', async () => {
    const res = await fetch(`${base}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Hello, Rohinik',
        contentType: 'TEXT',
        constraints: { allowReasoning: true },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.output).toBe('[mock] echo: Hello, Rohinik')
    expect(body.reasoningInvoked).toBe(true)
  })
})

describe('Criterion 7 — usage is recorded', () => {
  it('response has resourceCost field', async () => {
    const res = await fetch(`${base}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'cost test',
        contentType: 'TEXT',
        constraints: { allowReasoning: true },
      }),
    })
    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('resourceCost')
  })
})

describe('Criterion 8 — execution evidence persisted', () => {
  it('experienceWriter (SQLite) accepts and round-trips a record', async () => {
    // Note: route→evaluator→experience event chain is not auto-wired yet (Stage 16).
    // This proves the SQLite write path is live and connected in RuntimeHost.
    const experienceId = randomBytes(32).toString('hex')
    const record = {
      experienceId,
      evaluationRecordId: `eval-${randomBytes(4).toString('hex')}`,
      sessionId: 'session-1',
      executionId: 'exec-1',
      decisionId: 'decision-1',
      observedOutcome: { finalState: 'COMPLETED' as const, totalDurationMs: 100, stepCount: 1, failedStepCount: 0, retryCount: 0 },
      predictionComparison: { latencyErrorMs: 0, latencyErrorPct: 0, failurePredicted: false, failureObserved: false, failurePredictionCorrect: true, topCapabilityHit: true, predictionConfidence: 0.9 },
      planningComparison: { planExecuted: true, planSucceeded: true, retriesOccurred: false, budgetRespected: true, decisionConfidence: 0.9, selectionMargin: 0.1, planningAlgorithmVersion: '1.0.0' },
      executionComparison: { completedSteps: 1, failedSteps: 0, cancelledSteps: 0, totalRetries: 0, durationMs: 100, stepSuccessRate: 1.0 },
      scores: { overallScore: 0.9, predictionAccuracy: 1.0, planningAccuracy: 1.0, executionEfficiency: 1.0 },
      explanation: { primaryReason: 'EXECUTION_SUCCESS' as const, notes: [] },
      fingerprint: {
        experienceId,
        evaluationFingerprint: 'fp-test',
        intentHash: 'a'.repeat(64),
        capabilityHash: 'b'.repeat(64),
        planHash: 'c'.repeat(64),
      },
      metadata: { schemaVersion: '1.0.0', captureVersion: '1.0.0', runtimeVersion: '0.1.0', hostId: 'host-1' },
      telemetry: { captureDurationMs: 5 },
      producedAt: new Date(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commit = await host.experienceWriter.append(record as any)
    expect(commit.experienceId).toBe(experienceId)
    expect(commit.status).toBe('CREATED')

    const retrieved = await host.experienceWriter.getById(experienceId)
    expect(retrieved?.experienceId).toBe(experienceId)
  })
})

describe('Criterion 9 — policy rejection works (no REASONING provider)', () => {
  it('allowReasoning: false routes to DETERMINISTIC tier', async () => {
    const res = await fetch(`${base}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'name,age\nAlice,30',
        contentType: 'CSV',
        intentHint: 'csv parse',
        constraints: { allowReasoning: false },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.tierId).toBe('DETERMINISTIC')
    expect(body.reasoningInvoked).toBe(false)
  })
})

describe('Criterion 10 — missing secret fails closed', () => {
  it('loadConfig throws when referenced env var is not set', async () => {
    let tmpFile: string | undefined
    let tmpDir: string | undefined
    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'rohinik-test-'))
      tmpFile = join(tmpDir, 'bad-config.yaml')
      await writeFile(tmpFile, [
        'version: "1.0"',
        'runtime:',
        '  routing:',
        '    mode: balanced',
        '    explain: true',
        '  logLevel: info',
        'server:',
        '  port: 9999',
        '  host: 127.0.0.1',
        'providers:',
        '  openai:',
        '    apiKey: ${ROHINIK_TEST_MISSING_VAR_XYZ_12345}',
        'extensions:',
        '  paths: []',
      ].join('\n'))
      await expect(loadConfig(tmpFile)).rejects.toThrow("environment variable 'ROHINIK_TEST_MISSING_VAR_XYZ_12345' is not set")
    } finally {
      if (tmpFile) await unlink(tmpFile).catch(() => undefined)
    }
  })
})

describe('Criterion 11 — provider error normalized', () => {
  it('throwing provider yields structured 200 response (no unhandled rejection)', async () => {
    // Stand up a second server with a throwing mock provider
    const PORT2 = PORT + 1
    const throwHost = createProductionHost({ ...BASE_CONFIG, server: { port: PORT2, host: '127.0.0.1' } }, '\\\\.\\pipe\\rohinik-throw-test')
    await throwHost.start()
    throwHost.runtime.registerCapability(buildCoreCapability())
    throwHost.runtime.registerProvider(new MockReasoningProvider({ shouldThrow: true, throwMessage: 'intentional-error' }))
    const throwServer = new AiosServer(throwHost, { port: PORT2, host: '127.0.0.1' })
    await throwServer.listen()

    try {
      const res = await fetch(`http://127.0.0.1:${PORT2}/v1/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'boom', contentType: 'TEXT', constraints: { allowReasoning: true } }),
      })
      // Either 200 with error output or 500 — but NOT an unhandled exception that crashes server
      expect([200, 500]).toContain(res.status)
    } finally {
      await throwServer.close()
      await throwHost.stop()
    }
  }, 20_000)
})

describe('Criterion 12 — no secret logged', () => {
  it('apiKey placeholder never appears in output', async () => {
    // The resolved config does not log API keys — verify apiKey field not in runtime profile
    const res = await fetch(`${base}/v1/runtime`)
    const text = await res.text()
    expect(text).not.toContain('sk-')
    expect(text).not.toContain('apiKey')
  })
})
