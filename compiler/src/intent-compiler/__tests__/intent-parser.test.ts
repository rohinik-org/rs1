import { describe, it, expect, vi } from 'vitest'
import { IntentParser, type LLMClient } from '../intent-parser.js'
import type { CompilerContext } from '../../types/compiler-context.js'

function makeCtx(bindings: Record<string, unknown> = {}): CompilerContext {
  return {
    session: { sessionId: 'sess-1', bindings, activeArtifacts: [] },
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

describe('IntentParser', () => {
  it('parses a well-formed JSON response into an IntentCandidate', async () => {
    const llm = mockLLM(JSON.stringify({
      action: 'sort', object: 'files', desiredState: 'alphabetical order',
      entities: [{ name: 'folder', rawValue: '~/Downloads', inferredType: 'directory' }],
      constraints: [{ type: 'preserve', target: 'originals' }],
      confidence: 0.92,
    }))
    const candidate = await new IntentParser(llm).parse('sort my downloads folder', makeCtx())
    expect(candidate.parsedGoal?.action).toBe('sort')
    expect(candidate.rawConfidence).toBe(0.92)
    expect(candidate.parsedEntities).toHaveLength(1)
    expect(candidate.parsedConstraints).toHaveLength(1)
  })

  it('handles markdown-fenced JSON', async () => {
    const llm = mockLLM('```json\n{"action":"sort","confidence":0.8,"entities":[],"constraints":[]}\n```')
    const candidate = await new IntentParser(llm).parse('sort files', makeCtx())
    expect(candidate.parsedGoal?.action).toBe('sort')
    expect(candidate.rawConfidence).toBe(0.8)
  })

  it('returns low-confidence candidate with warning on unparseable response', async () => {
    const llm = mockLLM('I cannot understand that request')
    const candidate = await new IntentParser(llm).parse('???', makeCtx())
    expect(candidate.rawConfidence).toBe(0)
    expect(candidate.parseWarnings).toBeDefined()
    expect(candidate.parseWarnings!.length).toBeGreaterThan(0)
  })

  it('includes context hints when bindings are present', async () => {
    const llm = mockLLM(JSON.stringify({ action: 'sort', confidence: 0.9, entities: [], constraints: [] }))
    const ctx = makeCtx({ currentProject: '/workspace' })
    await new IntentParser(llm).parse('sort these', ctx)
    const [, userPrompt] = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string]
    expect(userPrompt).toContain('currentProject')
  })
})
