/**
 * check-protocol-perf.ts
 *
 * Measures current protocol latency and asserts against docs/compat/perf-baseline.json.
 *
 * Rule per metric (p50 and p95):
 *   current ≤ max(baseline × multiplier, baseline + slackMs)
 *
 * Exits 0 if all metrics pass, 1 if any regression detected.
 *
 * Run: npx tsx scripts/check-protocol-perf.ts
 * Environment: RHKS_BASE_URL, PERF_SAMPLES (default 30 for CI — faster than baseline measurement)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRohinikClient } from '@rohinik-org/client'

const REPO_ROOT      = resolve(import.meta.dirname, '..')
const BASELINE_FILE  = resolve(REPO_ROOT, 'docs/compat/perf-baseline.json')

const BASE_URL  = process.env['RHKS_BASE_URL'] ?? 'http://127.0.0.1:8080'
const SAMPLES   = Math.max(30, parseInt(process.env['PERF_SAMPLES'] ?? '30', 10))

interface PerfBaseline {
  regressionRule: {
    p50MultipleAllowed: number
    p50AbsoluteSlackMs: number
    p95MultipleAllowed: number
    p95AbsoluteSlackMs: number
  }
  metrics: Record<string, { p50Ms: number; p95Ms: number }>
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return Math.round((sorted[Math.max(0, idx)] ?? 0) * 10) / 10
}

async function measure(fn: () => Promise<void>): Promise<{ p50: number; p95: number }> {
  const times: number[] = []
  for (let i = 0; i < 3; i++) { try { await fn() } catch { /* warm-up */ } }
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now()
    try { await fn() } catch { /* include error overhead */ }
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return { p50: percentile(times, 50), p95: percentile(times, 95) }
}

function assertWithinTolerance(
  route: string,
  metric: 'p50' | 'p95',
  current: number,
  baseline: number,
  multiple: number,
  slackMs: number,
): boolean {
  const ceiling = Math.max(baseline * multiple, baseline + slackMs)
  if (current <= ceiling) {
    console.log(`  ✓ ${route} ${metric}: ${current}ms (baseline ${baseline}ms, ceiling ${ceiling}ms)`)
    return true
  }
  console.error(`  ✗ ${route} ${metric}: ${current}ms EXCEEDS ceiling ${ceiling}ms (baseline ${baseline}ms, ${multiple}× + ${slackMs}ms slack)`)
  return false
}

async function run(): Promise<void> {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as PerfBaseline
  const rule = baseline.regressionRule
  const client = createRohinikClient({ baseUrl: BASE_URL, timeoutMs: 10_000 })

  let sharedHandle = await client.executions.start({ content: 'perf-check-warmup', contentType: 'TEXT' })
  try {
    await sharedHandle.waitUntilTerminal({ pollIntervalMs: 100, timeoutMs: 15_000 })
  } catch { /* continue */ }

  console.log(`Checking protocol perf against baseline (${SAMPLES} samples each)\n`)

  const current: Record<string, { p50: number; p95: number }> = {}

  current['submit'] = await measure(async () => {
    await client.executions.start({ content: 'perf-check', contentType: 'TEXT' })
  })

  current['status'] = await measure(async () => { await sharedHandle.status() })

  sharedHandle = await client.executions.start({ content: 'perf-result', contentType: 'TEXT' })
  try { await sharedHandle.waitUntilTerminal({ pollIntervalMs: 100, timeoutMs: 15_000 }) } catch { /* */ }
  current['result'] = await measure(async () => {
    try { await sharedHandle.result() } catch { /* */ }
  })

  current['evidence'] = await measure(async () => { await sharedHandle.evidence() })

  current['cancel'] = await measure(async () => {
    const h = await client.executions.start({ content: 'perf-cancel', contentType: 'TEXT' })
    await h.cancel()
  })

  let passed = true
  for (const [route, metrics] of Object.entries(current)) {
    const b = baseline.metrics[route]
    if (!b) { console.warn(`  ? ${route}: no baseline entry — skipping`); continue }
    const p50ok = assertWithinTolerance(route, 'p50', metrics.p50, b.p50Ms, rule.p50MultipleAllowed, rule.p50AbsoluteSlackMs)
    const p95ok = assertWithinTolerance(route, 'p95', metrics.p95, b.p95Ms, rule.p95MultipleAllowed, rule.p95AbsoluteSlackMs)
    if (!p50ok || !p95ok) passed = false
  }

  console.log()
  if (passed) {
    console.log('✓ All protocol perf metrics within baseline tolerance.')
    process.exit(0)
  } else {
    console.error('✗ Protocol perf regression detected. Investigate before merging.')
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
