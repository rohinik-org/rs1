/**
 * OpenAI smoke test — excluded from standard CI run (*.smoke.test.ts).
 * Run manually: OPENAI_API_KEY=sk-... pnpm --filter @rohinik-org/server run test:smoke
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createProductionHost, RuntimeHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'

const API_KEY = process.env['OPENAI_API_KEY']

const PORT = 19_100

let host: RuntimeHost
let server: AiosServer

beforeAll(async () => {
  if (!API_KEY) return
  host = createProductionHost(
    {
      configPath: '/tmp/smoke.yaml',
      runtimeId: 'smoke-test-openai',
      runtime: {
        routing: { mode: 'balanced' as const, explain: true, traceBuffer: 100 },
        resources: { maxConcurrentRequests: 5, timeoutMs: 30000 },
        logLevel: 'error',
      },
      extensions: { paths: [] },
      providers: { openai: { apiKey: API_KEY } },
      server: { port: PORT, host: '127.0.0.1' },
    },
    '\\\\.\\pipe\\rohinik-smoke-openai',
  )
  await host.start()
  host.runtime.registerCapability(buildCoreCapability())
  server = new AiosServer(host, { port: PORT, host: '127.0.0.1' })
  await server.listen()
}, 30_000)

afterAll(async () => {
  if (!server) return
  await server.close()
  await host.stop()
})

describe('OpenAI smoke test', () => {
  it.skipIf(!API_KEY)('sends a real request and gets a response', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Reply with exactly the word: PONG',
        contentType: 'TEXT',
        constraints: { allowReasoning: true },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.tierId).toBe('REASONING')
    expect(body.reasoningInvoked).toBe(true)
    expect(typeof body.output).toBe('string')
    expect((body.output as string).length).toBeGreaterThan(0)
    expect(body.resourceCost).toBeDefined()
  }, 30_000)

  it.skipIf(!API_KEY)('evidence SQLite write path works', async () => {
    const { randomBytes } = await import('node:crypto')
    const experienceId = randomBytes(32).toString('hex')
    const record = {
      experienceId,
      evaluationRecordId: `eval-${randomBytes(4).toString('hex')}`,
      sessionId: 'smoke-session',
      executionId: 'smoke-exec',
      decisionId: 'smoke-decision',
      observedOutcome: { finalState: 'COMPLETED' as const, totalDurationMs: 200, stepCount: 1, failedStepCount: 0, retryCount: 0 },
      predictionComparison: { latencyErrorMs: 0, latencyErrorPct: 0, failurePredicted: false, failureObserved: false, failurePredictionCorrect: true, topCapabilityHit: true, predictionConfidence: 0.9 },
      planningComparison: { planExecuted: true, planSucceeded: true, retriesOccurred: false, budgetRespected: true, decisionConfidence: 0.9, selectionMargin: 0.1, planningAlgorithmVersion: '1.0.0' },
      executionComparison: { completedSteps: 1, failedSteps: 0, cancelledSteps: 0, totalRetries: 0, durationMs: 200, stepSuccessRate: 1.0 },
      scores: { overallScore: 0.9, predictionAccuracy: 1.0, planningAccuracy: 1.0, executionEfficiency: 1.0 },
      explanation: { primaryReason: 'EXECUTION_SUCCESS' as const, notes: [] },
      fingerprint: { experienceId, evaluationFingerprint: 'smoke-fp', intentHash: 'a'.repeat(64), capabilityHash: 'b'.repeat(64), planHash: 'c'.repeat(64) },
      metadata: { schemaVersion: '1.0.0', captureVersion: '1.0.0', runtimeVersion: '0.1.0', hostId: 'smoke-host' },
      telemetry: { captureDurationMs: 10 },
      producedAt: new Date(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commit = await host.experienceWriter.append(record as any)
    expect(commit.status).toBe('CREATED')
    const retrieved = await host.experienceWriter.getById(experienceId)
    expect(retrieved?.experienceId).toBe(experienceId)
  }, 10_000)
})
