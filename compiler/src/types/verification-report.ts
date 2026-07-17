import type { ArtifactBase } from './artifact.js'

export type VerificationStatus = 'PASSED' | 'FAILED' | 'REQUIRES_CONFIRMATION' | 'REQUIRES_CLARIFICATION'
export type FindingSeverity = 'INFO' | 'WARN' | 'ERROR'

export interface VerificationFinding {
  readonly findingId: string
  readonly severity: FindingSeverity
  readonly rule: string
  readonly message: string
  readonly affectedNodeId: string
}

export interface SimulationRecord {
  readonly nodeId: string
  readonly requestId: string
  readonly response: unknown
  readonly status: 'SAFE' | 'WARN' | 'FAILED'
  readonly wouldRoute: boolean
  readonly selectedTier?: string
  readonly selectedSkill?: string
  readonly confidence?: number
}

export interface VerificationReport extends ArtifactBase {
  readonly status: VerificationStatus
  readonly overallReason?: string
  readonly findings: readonly VerificationFinding[]
  readonly simulations: readonly SimulationRecord[]
}
