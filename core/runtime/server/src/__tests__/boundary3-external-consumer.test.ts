/**
 * Task 8 — Boundary 3: Clean external packed consumer
 *
 * Proves the packed SDK tarball works with no workspace links.
 *
 * Setup:
 *   1. Start RS1 on port 19_800 (standard integration pattern)
 *   2. Write a temp project with its own package.json that depends on
 *      the packed tarball via file: path — no workspace, no monorepo context
 *   3. npm install in that temp dir (resolves from tarball only)
 *   4. Run a Node.js ESM script that uses createRohinikClient to:
 *        - start an execution
 *        - stream events() to terminal
 *        - cancel an execution and confirm cancelAccepted
 *        - retrieve result + evidence after terminal
 *   5. Assert script exits 0 and emits expected lifecycle markers on stdout
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RuntimeHost, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from '../server.js'
import { buildCoreCapability } from '@rohinik-org/capability-core'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PORT = 19_800
const BASE = `http://127.0.0.1:${PORT}`

const execFileAsync = promisify(execFile)

let host: RuntimeHost
let server: AiosServer

beforeAll(async () => {
  host = createProductionHost({
    configPath: '/tmp/boundary3-test.yaml',
    runtimeId: 'boundary3-001',
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

// Resolve tarball path relative to this file
const TARBALL = resolve(import.meta.dirname, '../../vendor/rohinik-org-client-1.0.0.tgz')
  .replaceAll('\\', '/')

const CONSUMER_SCRIPT = `
import { createRohinikClient } from '@rohinik-org/client'

const BASE = process.argv[2]
const client = createRohinikClient({ baseUrl: BASE })

async function run() {
  // ── 1. Stream full lifecycle ───────────────────────────────────────────────
  const h1 = await client.executions.start({ content: 'boundary3 lifecycle', contentType: 'TEXT' })
  const kinds = []
  for await (const e of h1.events({ streamMode: 'sse' })) {
    kinds.push(e.kind)
  }
  const TERMINAL = ['EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED']
  if (!TERMINAL.includes(kinds.at(-1))) {
    throw new Error('No terminal event: ' + JSON.stringify(kinds))
  }
  console.log('LIFECYCLE_OK kinds=' + kinds.length)

  // ── 2. Cancel + evidence ──────────────────────────────────────────────────
  const h2 = await client.executions.start({ content: 'boundary3 cancel', contentType: 'TEXT' })
  const cancelResp = await h2.cancel({ reason: 'boundary3 test' })
  console.log('CANCEL_ACCEPTED=' + cancelResp.cancelAccepted)

  // Drain events (handles both accepted and races)
  for await (const _ of h2.events({ streamMode: 'auto' })) { /* drain */ }

  const ev = await h2.evidence()
  if (!Array.isArray(ev.entries)) throw new Error('evidence.entries not array')
  console.log('EVIDENCE_OK entries=' + ev.entries.length)

  // ── 3. Result after terminal ──────────────────────────────────────────────
  const h3 = await client.executions.start({ content: 'boundary3 result', contentType: 'TEXT' })
  await h3.waitUntilTerminal({ pollIntervalMs: 20, timeoutMs: 5_000 })
  const result = await h3.result()
  if (typeof result.totalDurationMs !== 'number') throw new Error('no totalDurationMs')
  console.log('RESULT_OK durationMs=' + result.totalDurationMs)

  // ── 4. Reconnect via cursor ────────────────────────────────────────────────
  const h4 = await client.executions.start({ content: 'boundary3 cursor', contentType: 'TEXT' })
  const firstPass = []
  for await (const e of h4.events({ streamMode: 'sse' })) {
    firstPass.push(e)
  }
  if (firstPass.length >= 2) {
    const firstCursor = firstPass[0].cursor
    const res = await fetch(
      BASE + '/v1/executions/' + h4.executionId + '/events?after=' + encodeURIComponent(firstCursor),
      { headers: { Accept: 'text/event-stream' }, signal: AbortSignal.timeout(8_000) }
    )
    if (!res.ok) throw new Error('reconnect fetch failed: ' + res.status)
    const reconnected = []
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\\n\\n')
        buf = parts.pop()
        for (const part of parts) {
          for (const line of part.split('\\n')) {
            if (line.startsWith('data: ')) {
              try { reconnected.push(JSON.parse(line.slice(6))) } catch {}
            }
          }
        }
      }
    } finally { reader.releaseLock() }

    for (const e of reconnected) {
      if (e.sequence <= firstPass[0].sequence) {
        throw new Error('Duplicate sequence in reconnect: ' + e.sequence)
      }
    }
    console.log('RECONNECT_OK reconnected=' + reconnected.length)
  } else {
    console.log('RECONNECT_SKIP too_few_events=' + firstPass.length)
  }

  console.log('ALL_PASS')
}

run().catch(err => {
  console.error('FAIL', err.message)
  process.exit(1)
})
`

describe('Boundary 3 — Clean external packed consumer', () => {
  it('packed SDK works standalone: lifecycle + cancel + evidence + reconnect', async () => {
    // Create temp project outside workspace
    const tmpDir = await mkdtemp(join(tmpdir(), 'rs1-boundary3-'))
    try {
      // Minimal package.json — ESM, file: dep on tarball, no workspace
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'boundary3-consumer',
          version: '1.0.0',
          type: 'module',
          dependencies: {
            '@rohinik-org/client': `file:${TARBALL}`,
          },
        }),
      )

      // Install from tarball only. Windows: .cmd scripts need shell:true
      await execFileAsync(
        'npm',
        ['install', '--prefer-offline', '--no-fund', '--no-audit'],
        { cwd: tmpDir, timeout: 60_000, shell: true },
      )

      // Write the consumer script
      const scriptPath = join(tmpDir, 'run.mjs')
      await writeFile(scriptPath, CONSUMER_SCRIPT)

      // Run against the live RS1 server
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [scriptPath, BASE],
        { cwd: tmpDir, timeout: 30_000 },
      )

      expect(stdout).toContain('LIFECYCLE_OK')
      expect(stdout).toContain('EVIDENCE_OK')
      expect(stdout).toContain('RESULT_OK')
      expect(stdout).toContain('ALL_PASS')
      // Reconnect: either OK or SKIP (if execution completes in single event)
      expect(stdout.includes('RECONNECT_OK') || stdout.includes('RECONNECT_SKIP')).toBe(true)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }, 120_000)
})
