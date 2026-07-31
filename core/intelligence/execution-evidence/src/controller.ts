import {
  EvidenceErrorCode,
  EvidenceOutcome,
} from '@rohinik-org/execution-evidence-ir'
import type {
  ExecutionEvidenceId,
  ExecutionEvidenceRepository,
  SealedExecutionEvidence,
  EvidenceIntegrityVerification,
  Clock,
  IdGenerator,
  ContentHasher,
  ContextAdmissionReference,
  CapabilityBindingReference,
  RoutingDecisionReference,
  PolicyDecisionReference,
  TokenUsageObservation,
  CostObservation,
  ContentHash,
  ExecutionEvidenceService,
  RetryId,
  FallbackId,
} from '@rohinik-org/execution-evidence-ir'
import type { OpenParams } from './builder.js'
import { ExecutionEvidenceBuilder } from './builder.js'

export class ExecutionEvidenceController implements ExecutionEvidenceService {
  private readonly builder:  ExecutionEvidenceBuilder
  private readonly sealed  = new Map<string, SealedExecutionEvidence>()

  constructor(
    private readonly repo:  ExecutionEvidenceRepository,
    clock:                  Clock,
    idGen:                  IdGenerator,
    hasher:                 ContentHasher,
  ) {
    this.builder = new ExecutionEvidenceBuilder(clock, idGen, hasher)
  }

  open(params: OpenParams): ExecutionEvidenceId {
    return this.builder.open(params)
  }

  recordContextAdmission(id: ExecutionEvidenceId, ref: ContextAdmissionReference): void {
    this.builder.recordContextAdmission(id, ref)
  }
  recordCapabilityBinding(id: ExecutionEvidenceId, ref: CapabilityBindingReference): void {
    this.builder.recordCapabilityBinding(id, ref)
  }
  recordRoutingDecision(id: ExecutionEvidenceId, ref: RoutingDecisionReference): void {
    this.builder.recordRoutingDecision(id, ref)
  }
  recordPolicyDecision(id: ExecutionEvidenceId, ref: PolicyDecisionReference): void {
    this.builder.recordPolicyDecision(id, ref)
  }
  recordTokenUsage(id: ExecutionEvidenceId, usage: TokenUsageObservation): void {
    this.builder.recordTokenUsage(id, usage)
  }
  recordCost(id: ExecutionEvidenceId, cost: CostObservation): void {
    this.builder.recordCost(id, cost)
  }
  recordInputHash(id: ExecutionEvidenceId, hash: ContentHash): void {
    this.builder.recordInputHash(id, hash)
  }
  recordOutputHash(id: ExecutionEvidenceId, hash: ContentHash): void {
    this.builder.recordOutputHash(id, hash)
  }
  recordRetry(id: ExecutionEvidenceId, ref: RetryId): void {
    this.builder.recordRetry(id, ref)
  }
  recordFallback(id: ExecutionEvidenceId, ref: FallbackId): void {
    this.builder.recordFallback(id, ref)
  }
  recordPrivacyBoundary(id: ExecutionEvidenceId, preserved: boolean): void {
    this.builder.recordPrivacyBoundary(id, preserved)
  }

  async sealAndStore(
    id:          ExecutionEvidenceId,
    outcome:     EvidenceOutcome,
    completedAt: Date,
  ): Promise<SealedExecutionEvidence> {
    // Idempotent: if already sealed and persisted, retrieve from repo
    const cached = this.sealed.get(id)
    if (cached) {
      return cached
    }

    let record: SealedExecutionEvidence
    try {
      record = this.builder.seal(id, outcome, completedAt)
    } catch (err) {
      // Re-wrap not-found to surface correct error code
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes(EvidenceErrorCode.EVIDENCE_NOT_FOUND)) {
        throw new Error(`${EvidenceErrorCode.EVIDENCE_NOT_FOUND}: evidence '${id}' not found`)
      }
      throw err
    }

    try {
      await this.repo.store(record)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`${EvidenceErrorCode.EVIDENCE_PERSISTENCE_FAILED}: ${msg}`)
    }

    this.sealed.set(id, record)
    return record
  }

  async findById(id: ExecutionEvidenceId): Promise<SealedExecutionEvidence | undefined> {
    return this.repo.findById(id)
  }

  async verifyIntegrity(id: ExecutionEvidenceId): Promise<EvidenceIntegrityVerification> {
    return this.repo.verifyIntegrity(id)
  }
}
