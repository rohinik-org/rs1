import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { resolve, join } from 'node:path'
import { RohinikClient } from '../client/rohinik-client.js'
import { collectFiles } from '../pipeline/file-collector.js'
import { buildAssessmentPrompt } from '../pipeline/assessment-builder.js'

// Root of the monorepo relative to this file's location at runtime
const REPO_ROOT = resolve(import.meta.dirname ?? __dirname, '../../../../')
const SERVER_BIN = join(REPO_ROOT, 'core/runtime/server/dist/bin.js')
const MOCK_CONFIG = join(REPO_ROOT, 'examples/rohinik.mock.yaml')
const PORT = 19_200
const BASE = `http://127.0.0.1:${PORT}`

let serverProcess: ChildProcess

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
  // Patch server port via env — server uses config file port, so we pass custom config inline
  // via a temporary config write. Simpler: override with a custom config pointing to PORT.
  // Easiest: write a temp yaml for this port.
  const { writeFile, unlink, mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const tmpDir = await mkdtemp(join(tmpdir(), 're-integ-'))
  const configPath = join(tmpDir, 'rohinik.yaml')
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
    env: {
      ...process.env,
      ROHINIK_CONFIG: configPath,
    },
    stdio: 'pipe',
  })

  serverProcess.on('error', (err) => { throw err })

  await waitForReady()
}, 30_000)

afterAll(async () => {
  serverProcess?.kill('SIGTERM')
  await new Promise<void>(r => setTimeout(r, 500))
})

const client = new RohinikClient({ endpoint: BASE, timeoutMs: 15_000 })

describe('assess pipeline integration', () => {
  it('health returns READY or DEGRADED', async () => {
    const health = await client.health()
    expect(['READY', 'DEGRADED']).toContain(health.state)
  })

  it('executes assessment on app/repo-engineer/ itself', async () => {
    const appDir = resolve(REPO_ROOT, 'app/repo-engineer')
    const files = await collectFiles(appDir, { maxFiles: 5 })
    expect(files.length).toBeGreaterThan(0)

    const prompt = buildAssessmentPrompt({
      objective: 'What does this package do?',
      files,
      repoPath: appDir,
    })

    const result = await client.execute({
      content: prompt,
      contentType: 'TEXT',
      constraints: { allowReasoning: true },
    })

    expect(result.requestId).toBeDefined()
    expect(result.tierId).toBe('REASONING')
    expect(result.reasoningInvoked).toBe(true)
    // Mock provider echoes prompt
    expect(typeof result.output).toBe('string')
    expect(result.output as string).toContain('[mock] echo:')
  })

  it('decision trace is retrievable after execute', async () => {
    const result = await client.execute({
      content: 'test trace retrieval',
      contentType: 'TEXT',
      constraints: { allowReasoning: true },
    })

    const decision = await client.getDecision(result.requestId)
    expect(decision.requestId).toBe(result.requestId)
    expect(decision.trace).toBeDefined()
  })

  it('simulate returns wouldRoute without executing', async () => {
    const result = await client.simulate({
      content: 'simulate this',
      contentType: 'TEXT',
      constraints: { allowReasoning: true },
    })
    expect(result).toBeDefined()
  })

  it('missing content returns 400 RohinikError', async () => {
    const { RohinikError } = await import('../client/types.js')
    await expect(
      client.execute({ content: '', contentType: 'TEXT' })
    ).rejects.toBeInstanceOf(RohinikError)
  })
})
