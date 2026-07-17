import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../config/loader.js'

const TMP = join(tmpdir(), 'aios-config-test-' + Date.now())

beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

function write(name: string, content: string) {
  writeFileSync(join(TMP, name), content, 'utf-8')
  return join(TMP, name)
}

describe('loadConfig', () => {
  it('loads a minimal valid config with defaults', async () => {
    const path = write('rohinik.yaml', `version: "1.0"\n`)
    const cfg = await loadConfig(path)
    expect(cfg.runtime.routing.mode).toBe('balanced')
    expect(cfg.runtime.routing.explain).toBe(true)
    expect(cfg.runtime.routing.traceBuffer).toBe(5000)
    expect(cfg.runtime.resources.maxConcurrentRequests).toBe(500)
    expect(cfg.runtime.resources.timeoutMs).toBe(30000)
    expect(cfg.runtime.logLevel).toBe('info')
    expect(cfg.server.port).toBe(8080)
    expect(cfg.server.host).toBe('0.0.0.0')
    expect(cfg.extensions.paths).toContain('node_modules/@aios')
  })

  it('substitutes environment variables', async () => {
    process.env.TEST_API_KEY = 'sk-test-123'
    const path = write('rohinik.yaml', `
version: "1.0"
providers:
  anthropic:
    apiKey: \${TEST_API_KEY}
`)
    const cfg = await loadConfig(path)
    expect(cfg.providers['anthropic']?.apiKey).toBe('sk-test-123')
    delete process.env.TEST_API_KEY
  })

  it('throws on missing required env var', async () => {
    const path = write('rohinik.yaml', `
version: "1.0"
providers:
  anthropic:
    apiKey: \${MISSING_VAR_Rohinik_TEST}
`)
    await expect(loadConfig(path)).rejects.toThrow('MISSING_VAR_Rohinik_TEST')
  })

  it('throws with field path on Zod validation failure', async () => {
    const path = write('rohinik.yaml', `
version: "1.0"
runtime:
  logLevel: verbose
`)
    await expect(loadConfig(path)).rejects.toThrow('runtime.logLevel')
  })

  it('throws if file does not exist', async () => {
    await expect(loadConfig(join(TMP, 'missing.yaml'))).rejects.toThrow()
  })

  it('generates a runtimeId if not specified', async () => {
    const path = write('rohinik.yaml', `version: "1.0"\n`)
    const cfg = await loadConfig(path)
    expect(cfg.runtimeId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('uses runtimeId from config if specified', async () => {
    const path = write('rohinik.yaml', `
version: "1.0"
runtimeId: my-runtime
`)
    const cfg = await loadConfig(path)
    expect(cfg.runtimeId).toBe('my-runtime')
  })
})
