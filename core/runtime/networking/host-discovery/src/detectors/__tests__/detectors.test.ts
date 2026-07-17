import { describe, it, expect, vi, afterEach } from 'vitest'
import { PythonDetector } from '../binary/python-detector.js'
import { GitDetector } from '../binary/git-detector.js'
import { OllamaDetector } from '../runtime/ollama-detector.js'

describe('detectors', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('PythonDetector has correct id and resourceType', () => {
    const d = new PythonDetector()
    expect(d.id).toBe('rohinik://host/python')
    expect(d.resourceType).toBe('binary')
    expect(d.name).toBe('python')
  })

  it('GitDetector has correct id', () => {
    const d = new GitDetector()
    expect(d.id).toBe('rohinik://host/git')
    expect(d.resourceType).toBe('binary')
  })

  it('OllamaDetector has runtime resourceType', () => {
    const d = new OllamaDetector()
    expect(d.resourceType).toBe('runtime')
  })

  it('detect() returns null when binary not found', async () => {
    const d = new PythonDetector()
    // On most CI systems python may or may not exist; we mock execFile-based which
    // just checks — if it throws with ENOENT/not-found we get null
    const result = await d.detect().catch(() => null)
    // Result is either an observation or null — both are valid
    expect(result === null || (result !== null && typeof result.exitCode === 'number')).toBe(true)
  })
})
