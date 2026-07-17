import { describe, it, expect } from 'vitest'
import type { CompilerContext } from '../compiler-context.js'
import type { SkillDescriptor } from '../capability-snapshot.js'

describe('CompilerContext', () => {
  it('is structurally valid with minimal fields', () => {
    const ctx: CompilerContext = {
      session: { sessionId: 'sess-1', bindings: {}, activeArtifacts: [] },
      policy: {
        clarificationThreshold: 0.7,
        maxPlanSteps: 20,
        allowedTiers: ['DETERMINISTIC', 'LOCAL_TOOL', 'REASONING'],
        verificationMode: 'strict',
      },
      system: {
        snapshotId: 'snap-1',
        capturedAt: '2026-07-07T00:00:00Z',
        runtime: { runtimeId: 'rt-1', protocolVersion: '1.0', features: { memory: false, streaming: false, reasoning: true } },
        capabilities: {
          meta: { artifactId: 'cap-1', schemaVersion: '1.0', kind: 'CapabilitySnapshot', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
          provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
          integrity: { checksum: 'sha256-cap' },
          lifecycle: { state: 'ACTIVE' },
          snapshotId: 'cap-snap-1',
          capturedAt: '2026-07-07T00:00:00Z',
          runtimeId: 'rt-1',
          source: 'GET /v1/capabilities',
          fingerprint: 'sha256-fp',
          skills: [],
        },
      },
    }
    expect(ctx.policy.verificationMode).toBe('strict')
    expect(ctx.system.runtime.protocolVersion).toBe('1.0')
  })
})

describe('CapabilitySnapshot', () => {
  it('exposes semantic capabilities not matcher keywords', () => {
    const skill: SkillDescriptor = {
      skillId: 'csv.parse', capabilityId: 'capability-core',
      tierId: 'DETERMINISTIC', version: '1.0.0',
      semantics: ['csv.parse', 'table.read'], requirements: [],
    }
    expect(skill.semantics).toContain('csv.parse')
    expect('keywords' in skill).toBe(false)
    expect('matcher' in skill).toBe(false)
  })
})
