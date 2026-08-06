import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { resolve, join } from 'node:path'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { RohinikClient } from '../client/rohinik-client.js'
import { collectFiles } from '../pipeline/file-collector.js'
import { buildPlanPrompt } from '../pipeline/plan-builder.js'
import { hashPlan, newPlanId, writePlan, readPlan, writeApproval } from '../pipeline/plan-store.js'

const REPO_ROOT = resolve(import.meta.dirname ?? __dirname, '../../../../')
const SERVER_BIN = join(REPO_ROOT, 'core/runtime/server/dist/bin.js')
const PORT = 19_201
const BASE = `http://127.0.0.1:${PORT}`

let serverProcess: ChildProcess
let plansDir: string

async function waitForReady(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/v1/health`)
      if (res.ok) {
        const body = await res.json() as { state: string }
        if (body.state === 'READY' || body.state === 'DEGRADED') return
      }
    } catch { /* not ready yet */ }
    await new Promise<void>(r => setTimeout(r, 300))
  }
  throw new Error(`Server not ready within ${timeoutMs}ms`)
}

beforeAll(async () => {
  plansDir = await mkdtemp(join(tmpdir(), 're-plans-test-'))

  const configDir = await mkdtemp(join(tmpdir(), 're-plan-cfg-'))
  const configPath = join(configDir, 'rohinik.yaml')
  await writeFile(configPath, [
    'version: "1.0"',
    'runtime:',
    '  routing:',
    '    mode: balanced',
    '    explain: true',
    '  logLevel: error',
    'server:',
    `  port: ${PORT}`,
    '  host: 127.0.0.1',
    'providers:',
    '  mock:',
    '    apiKey: dummy',
    'extensions:',
    '  paths: []',
  ].join('\n'))

  serverProcess = spawn('node', [SERVER_BIN], {
    cwd: REPO_ROOT,
    env: { ...process.env, ROHINIK_CONFIG: configPath },
    stdio: 'pipe',
  })
  serverProcess.on('error', (err) => { throw err })
  await waitForReady()
}, 30_000)

afterAll(async () => {
  serverProcess?.kill('SIGTERM')
  await new Promise<void>(r => setTimeout(r, 500))
  await rm(plansDir, { recursive: true, force: true })
})

const client = new RohinikClient({ endpoint: BASE, timeoutMs: 15_000 })

describe('plan pipeline integration', () => {
  it('plan POST succeeds and writes PlanArtifact to disk', async () => {
    const appDir = resolve(REPO_ROOT, 'app/repo-engineer')
    const files = await collectFiles(appDir, { maxFiles: 3 })
    const prompt = buildPlanPrompt({ request: 'Add structured logging', files, repoPath: appDir })

    const result = await client.execute({
      content: prompt,
      contentType: 'TEXT',
      constraints: { allowReasoning: true },
    })

    const content = String(result.output)
    const hash = hashPlan(content)
    const planId = newPlanId()

    await writePlan(plansDir, {
      planId,
      createdAt: new Date().toISOString(),
      repoPath: appDir,
      request: 'Add structured logging',
      files: files.map(f => f.path),
      content,
      requestId: result.requestId,
      tierId: result.tierId ?? 'unknown',
      executionTimeMs: result.executionTimeMs,
      hash,
    })

    const artifact = await readPlan(plansDir, planId)
    expect(artifact.planId).toBe(planId)
    expect(artifact.request).toBe('Add structured logging')
    expect(artifact.files.length).toBeGreaterThan(0)
    expect(artifact.hash).toBe(hash)
    expect(artifact.requestId).toBe(result.requestId)
  })

  it('plan content contains [mock] echo:', async () => {
    const files = await collectFiles(resolve(REPO_ROOT, 'app/repo-engineer'), { maxFiles: 2 })
    const prompt = buildPlanPrompt({ request: 'test', files, repoPath: REPO_ROOT })
    const result = await client.execute({
      content: prompt,
      contentType: 'TEXT',
      constraints: { allowReasoning: true },
    })
    expect(String(result.output)).toContain('[mock] echo:')
  })

  it('plan hash in artifact matches hashPlan(content)', async () => {
    const planId = newPlanId()
    const content = '[mock] echo: some plan content'
    const hash = hashPlan(content)
    await writePlan(plansDir, {
      planId, createdAt: new Date().toISOString(), repoPath: '/r', request: 'test',
      files: [], content, requestId: 'req-x', tierId: 'REASONING', executionTimeMs: 1, hash,
    })
    const artifact = await readPlan(plansDir, planId)
    expect(artifact.hash).toBe(hashPlan(artifact.content))
  })

  it('approve with correct hash writes ApprovalRecord', async () => {
    const planId = newPlanId()
    const content = 'my plan content'
    const hash = hashPlan(content)
    await writePlan(plansDir, {
      planId, createdAt: new Date().toISOString(), repoPath: '/r', request: 'test',
      files: [], content, requestId: 'req-y', tierId: 'REASONING', executionTimeMs: 1, hash,
    })

    // Simulate approve logic
    const artifact = await readPlan(plansDir, planId)
    const recomputed = hashPlan(artifact.content)
    expect(recomputed).toBe(hash)

    await writeApproval(plansDir, {
      planId,
      approvedAt: new Date().toISOString(),
      approveHash: recomputed,
      contentHash: recomputed,
    })

    const raw = await readFile(join(plansDir, `${planId}.approved.json`), 'utf-8')
    const record = JSON.parse(raw) as { planId: string; approveHash: string; contentHash: string }
    expect(record.planId).toBe(planId)
    expect(record.approveHash).toBe(record.contentHash)
  })

  it('wrong hash does not match recomputed hash', async () => {
    const content = 'another plan'
    const hash = hashPlan(content)
    const wrong = 'deadbeef'.repeat(8)
    expect(hash).not.toBe(wrong)
  })

  it('readPlan throws on unknown planId', async () => {
    await expect(readPlan(plansDir, 'no-such-plan')).rejects.toThrow('Plan not found')
  })
})
