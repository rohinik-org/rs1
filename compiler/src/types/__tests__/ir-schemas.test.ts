import { describe, it, expect } from 'vitest'
import type { IntentIR } from '../intent-ir.js'
import type { PlanIR } from '../plan-ir.js'
import type { ExecutionGraph, ExecutionCommand } from '../execution-graph.js'
import type { VerificationReport } from '../verification-report.js'
import type { ClarificationIR } from '../clarification-ir.js'

describe('IntentIR', () => {
  it('requires confidence only at IntentIR level', () => {
    const ir: IntentIR = {
      meta: { artifactId: 'i1', schemaVersion: '1.0', kind: 'IntentIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
      provenance: { systemSnapshotId: 's1', parentArtifacts: [], sessionId: 'sess-1' },
      integrity: { checksum: 'sha256-x' },
      lifecycle: { state: 'ACTIVE' },
      goal: { action: 'organize' },
      entities: [],
      constraints: [],
      confidence: 0.94,
    }
    expect(ir.confidence).toBe(0.94)
    expect(ir.goal.action).toBe('organize')
  })
})

describe('PlanIR', () => {
  it('has no confidence field and references capabilitySnapshotId', () => {
    const plan: PlanIR = {
      meta: { artifactId: 'p1', schemaVersion: '1.0', kind: 'PlanIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
      provenance: { systemSnapshotId: 's1', parentArtifacts: [{ artifactId: 'i1', kind: 'IntentIR' }], sessionId: 'sess-1' },
      integrity: { checksum: 'sha256-y' },
      lifecycle: { state: 'ACTIVE' },
      capabilitySnapshotId: 'snap-abc',
      steps: [],
    }
    expect('confidence' in plan).toBe(false)
    expect(plan.capabilitySnapshotId).toBe('snap-abc')
  })
})

describe('ExecutionGraph', () => {
  it('uses operation KIND not HTTP paths', () => {
    const cmd: ExecutionCommand = { operation: 'EXECUTE', arguments: { content: 'test', contentType: 'TEXT' } }
    expect(cmd.operation).toBe('EXECUTE')
    expect(cmd.operation).not.toContain('/')
  })
})

describe('ClarificationIR', () => {
  it('tracks originStage', () => {
    const cl: ClarificationIR = {
      meta: { artifactId: 'c1', schemaVersion: '1.0', kind: 'ClarificationIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
      provenance: { systemSnapshotId: 's1', parentArtifacts: [], sessionId: 'sess-1' },
      integrity: { checksum: 'sha256-c' },
      lifecycle: { state: 'ACTIVE' },
      originStage: 'verifier',
      reason: { type: 'simulation_divergence', description: 'Step 2 would not route' },
      questions: [{ questionId: 'q1', text: 'Proceed anyway?', required: true }],
      resumePoint: { stage: 'verification' },
    }
    expect(cl.originStage).toBe('verifier')
  })
})

describe('VerificationReport', () => {
  it('has findings array', () => {
    const report: VerificationReport = {
      meta: { artifactId: 'v1', schemaVersion: '1.0', kind: 'VerificationReport', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
      provenance: { systemSnapshotId: 's1', parentArtifacts: [], sessionId: 'sess-1' },
      integrity: { checksum: 'sha256-v' },
      lifecycle: { state: 'ACTIVE' },
      status: 'PASSED',
      findings: [],
      simulations: [],
    }
    expect(report.status).toBe('PASSED')
    expect(Array.isArray(report.findings)).toBe(true)
  })
})
