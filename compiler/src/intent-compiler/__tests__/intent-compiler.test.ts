import { describe, it, expect, vi } from 'vitest'
import { IntentCompiler } from '../intent-compiler.js'
import type { LLMClient } from '../intent-parser.js'
import type { CompilerContext } from '../../types/compiler-context.js'

function makeCtx(): CompilerContext {
  return {
    session: { sessionId: 'sess-1', bindings: {}, activeArtifacts: [] },
    policy: { clarificationThreshold: 0.7, maxPlanSteps: 20, allowedTiers: ['DETERMINISTIC'], verificationMode: 'strict' },
    system: {
      snapshotId: 'snap-1', capturedAt: '2026-07-07T00:00:00Z',
      runtime: { runtimeId: 'rt-1', protocolVersion: '1.0', features: { memory: false, streaming: false, reasoning: true } },
      capabilities: {
        meta: { artifactId: 'cap', schemaVersion: '1.0', kind: 'CapabilitySnapshot', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
        provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
        integrity: { checksum: 'sha256-cap' }, lifecycle: { state: 'ACTIVE' },
        snapshotId: 'cap-snap', capturedAt: '2026-07-07T00:00:00Z', runtimeId: 'rt-1',
        source: 'GET /v1/capabilities', fingerprint: 'fp-1', skills: [],
      },
    },
  }
}

function mockLLM(response: string): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) }
}

describe('IntentCompiler', () => {
  it('produces IntentIR for a clear high-confidence request', async () => {
    const llm = mockLLM(JSON.stringify({ action: 'sort', object: 'files', entities: [], constraints: [], confidence: 0.95 }))
    const result = await new IntentCompiler(llm).compile('sort my files', makeCtx())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.intentIR.goal.action).toBe('sort')
      expect(result.intentIR.confidence).toBe(0.95)
    }
  })

  it('produces ClarificationIR for low-confidence response', async () => {
    const llm = mockLLM(JSON.stringify({ action: 'unknown', entities: [], constraints: [], confidence: 0.2 }))
    const result = await new IntentCompiler(llm).compile('do the thing', makeCtx())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.clarification.originStage).toBe('intent_compiler')
  })

  it('produces ClarificationIR when entity cannot be resolved', async () => {
    const llm = mockLLM(JSON.stringify({ action: 'sort', confidence: 0.9, entities: [{ name: 'mystery', rawValue: '' }], constraints: [] }))
    const result = await new IntentCompiler(llm).compile('sort mystery', makeCtx())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.clarification.reason.type).toBe('ambiguous_entity')
  })

  it('IntentIR is deterministic: same input → same artifactId', async () => {
    const make = () => mockLLM(JSON.stringify({ action: 'sort', confidence: 0.9, entities: [], constraints: [] }))
    const ctx = makeCtx()
    const [r1, r2] = await Promise.all([
      new IntentCompiler(make()).compile('sort', ctx),
      new IntentCompiler(make()).compile('sort', ctx),
    ])
    expect(r1.ok && r2.ok).toBe(true)
    if (r1.ok && r2.ok) expect(r1.intentIR.meta.artifactId).toBe(r2.intentIR.meta.artifactId)
  })
})
