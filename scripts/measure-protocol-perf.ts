/**
 * measure-protocol-perf.ts
 *
 * Measures latency of the five protocol routes against a real RS1 server.
 * Writes docs/compat/perf-baseline.json with p50 and p95 from warm samples.
 *
 * Run: npx tsx scripts/measure-protocol-perf.ts
 *
 * The server must already be running. Uses @rohinik-org/client from the
 * vendor tarball in app/repo-engineer/vendor/.
 *
 * Environment:
 *   RHKS_BASE_URL  — server base URL (default: http://127.0.0.1:8080)
 *   PERF_SAMPLES   — warm samples per route (default: 50, min: 30)
 *   PERF_TAG       — git tag / environment label for the baseline record
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRohinikClient } from '@rohinik-org/client'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const OUT_FILE = resolve(REPO_ROOT, 'docs/compat/perf-baseline.json')

const BASE_URL   = process.env['RHKS_BASE_URL']  ?? 'http://127.0.0.1:8080'
const SAMPLES    = Math.max(30, parseInt(process.env['PERF_SAMPLES'] ?? '50', 10))
const TAG        = process.env['PERF_TAG'] ?? 'v0.16.0-stage16a'
const NODE_VER   = process.version

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return Math.round((sorted[Math.max(0, idx)] ?? 0) * 10) / 10
}

async function measure(label: string, fn: () => Promise<void>): Promise<{ p50: number; p95: number; samples: number }> {
  process.stdout.write(`  ${label}: `)
  const times: number[] = []

  // 5 warm-up calls not included in stats
  for (let i = 0; i < 5; i++) {
    try { await fn() } catch { /* ignore warm-up errors */ }
  }

  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now()
    try { await fn() } catch { /* timing includes error overhead */ }
    times.push(performance.now() - t0)
    if ((i + 1) % 10 === 0) process.stdout.write('.')
  }
  process.stdout.write('\n')

  times.sort((a, b) => a - b)
  return {
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    samples: SAMPLES,
  }
}

async function run(): Promise<void> {
  console.log(`Measuring protocol latency against ${BASE_URL}`)
  console.log(`Samples: ${SAMPLES} (+ 5 warm-up per route)\n`)

  const client = createRohinikClient({ baseUrl: BASE_URL, timeoutMs: 10_000 })

  // Pre-create an execution to reuse across read-path measurements
  // to avoid polluting submit timing with read-path latency
  let sharedHandle = await client.executions.start({ content: 'perf-baseline-warmup', contentType: 'TEXT' })
  // Wait for terminal so result/cancel calls are valid
  try {
    await sharedHandle.waitUntilTerminal({ pollIntervalMs: 100, timeoutMs: 15_000 })
  } catch {
    console.error('Warning: warmup execution did not reach terminal — result metrics may show 409s')
  }

  const submit = await measure('submit (POST /v1/executions)', async () => {
    await client.executions.start({ content: 'perf-baseline', contentType: 'TEXT' })
  })

  const status = await measure('status  (GET  /v1/executions/:id)', async () => {
    await sharedHandle.status()
  })

  // Re-measure sharedHandle — might be stale if terminal changed
  sharedHandle = await client.executions.start({ content: 'perf-result', contentType: 'TEXT' })
  try {
    await sharedHandle.waitUntilTerminal({ pollIntervalMs: 100, timeoutMs: 15_000 })
  } catch { /* if not terminal, result calls will be 409 — that's the latency we measure */ }

  const result = await measure('result  (GET  /v1/executions/:id/result)', async () => {
    try { await sharedHandle.result() } catch { /* 409 timing is valid measurement */ }
  })

  const evidence = await measure('evidence (GET  /v1/executions/:id/evidence)', async () => {
    await sharedHandle.evidence()
  })

  const cancel = await measure('cancel  (POST /v1/executions/:id/cancel)', async () => {
    // Create fresh execution each time for a non-terminal cancel target
    const h = await client.executions.start({ content: 'perf-cancel', contentType: 'TEXT' })
    await h.cancel()
  })

  const baseline = {
    baselineTag: TAG,
    generatedAt: new Date().toISOString(),
    environment: {
      baseUrl: BASE_URL,
      node: NODE_VER,
      mode: 'mock-provider',
      persistence: 'in-memory',
      sampleCount: SAMPLES,
      note: 'Does not include model execution time. Measures protocol overhead only.',
    },
    regressionRule: {
      description: 'current p50 ≤ max(baseline.p50 × 3, baseline.p50 + 15ms); current p95 ≤ max(baseline.p95 × 3, baseline.p95 + 30ms)',
      p50MultipleAllowed: 3,
      p50AbsoluteSlackMs: 15,
      p95MultipleAllowed: 3,
      p95AbsoluteSlackMs: 30,
    },
    metrics: {
      submit:   { p50Ms: submit.p50,   p95Ms: submit.p95 },
      status:   { p50Ms: status.p50,   p95Ms: status.p95 },
      result:   { p50Ms: result.p50,   p95Ms: result.p95 },
      evidence: { p50Ms: evidence.p50, p95Ms: evidence.p95 },
      cancel:   { p50Ms: cancel.p50,   p95Ms: cancel.p95 },
    },
  }

  writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2) + '\n')
  console.log('\nResults:')
  for (const [route, m] of Object.entries(baseline.metrics)) {
    console.log(`  ${route.padEnd(10)}: p50=${m.p50Ms}ms  p95=${m.p95Ms}ms`)
  }
  console.log(`\nBaseline written: ${OUT_FILE}`)
}

run().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
