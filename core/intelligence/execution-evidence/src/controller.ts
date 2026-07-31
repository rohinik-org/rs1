import {
  EvidenceErrorCode,
  EvidenceEventType,
  EvidenceSchemaVersion,
  EvidenceIntegrityStatus,
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

export interface EvidenceEventBus {
  emit(event: string, data?: unknown): void
}

export class ExecutionEvidenceController implements ExecutionEvidenceService {
  private readonly builder: ExecutionEvidenceBuilder
  private readonly sealed  = new Map<string, SealedExecutionEvidence>()

  constructor(
    private readonly repo:      ExecutionEvidenceRepository,
    clock:                       Clock,
    idGen:                       IdGenerator,
    hasher:                      ContentHasher,
    private readonly eventBus?:  EvidenceEventBus,
  ) {
    this.builder = new ExecutionEvidenceBuilder(clock, idGen, hasher)
  }

  private safeEmit(event: string, data: unknown): void {
    try {
      this.eventBus?.emit(event, data)
    } catch {
      // ponytail: bus failure is non-fatal; must not suppress persistence success
    }
  }

  open(params: OpenParams): ExecutionEvidenceId {
    const id = this.builder.open(params)
    this.safeEmit(EvidenceEventType.EVIDENCE_OPENED, { evidenceId: id, schemaVersion: EvidenceSchemaVersion })
    return id
  }

  recordContextAdmission(id: ExecutionEvidenceId, ref: ContextAdmissionReference): void {
    this.builder.recordContextAdmission(id, ref)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'contextAdmission' })
  }
  recordCapabilityBinding(id: ExecutionEvidenceId, ref: CapabilityBindingReference): void {
    this.builder.recordCapabilityBinding(id, ref)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'capabilityBinding' })
  }
  recordRoutingDecision(id: ExecutionEvidenceId, ref: RoutingDecisionReference): void {
    this.builder.recordRoutingDecision(id, ref)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'routingDecision' })
  }
  recordPolicyDecision(id: ExecutionEvidenceId, ref: PolicyDecisionReference): void {
    this.builder.recordPolicyDecision(id, ref)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'policyDecision' })
  }
  recordTokenUsage(id: ExecutionEvidenceId, usage: TokenUsageObservation): void {
    this.builder.recordTokenUsage(id, usage)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'tokenUsage' })
  }
  recordCost(id: ExecutionEvidenceId, cost: CostObservation): void {
    this.builder.recordCost(id, cost)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'cost' })
  }
  recordInputHash(id: ExecutionEvidenceId, hash: ContentHash): void {
    this.builder.recordInputHash(id, hash)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'inputHash' })
  }
  recordOutputHash(id: ExecutionEvidenceId, hash: ContentHash): void {
    this.builder.recordOutputHash(id, hash)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'outputHash' })
  }
  recordRetry(id: ExecutionEvidenceId, ref: RetryId): void {
    this.builder.recordRetry(id, ref)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'retry' })
  }
  recordFallback(id: ExecutionEvidenceId, ref: FallbackId): void {
    this.builder.recordFallback(id, ref)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'fallback' })
  }
  recordPrivacyBoundary(id: ExecutionEvidenceId, preserved: boolean): void {
    this.builder.recordPrivacyBoundary(id, preserved)
    this.safeEmit(EvidenceEventType.EVIDENCE_OBSERVATION_APPENDED, { evidenceId: id, kind: 'privacyBoundary' })
  }

  async sealAndStore(
    id:          ExecutionEvidenceId,
    outcome:     EvidenceOutcome,
    completedAt: Date,
  ): Promise<SealedExecutionEvidence> {
    const cached = this.sealed.get(id)
    if (cached) {
      return cached
    }

    this.safeEmit(EvidenceEventType.EVIDENCE_SEAL_STARTED, { evidenceId: id })

    let record: SealedExecutionEvidence
    try {
      record = this.builder.seal(id, outcome, completedAt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes(EvidenceErrorCode.EVIDENCE_NOT_FOUND)) {
        throw new Error(`${EvidenceErrorCode.EVIDENCE_NOT_FOUND}: evidence '${id}' not found`)
      }
      throw err
    }

    this.safeEmit(EvidenceEventType.EVIDENCE_SEALED, {
      evidenceId:   record.evidenceId,
      evidenceHash: record.evidenceHash,
      outcome:      record.outcome,
    })

    try {
      await this.repo.store(record)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.safeEmit(EvidenceEventType.EVIDENCE_PERSISTENCE_FAILED, { evidenceId: id, error: msg })
      throw new Error(`${EvidenceErrorCode.EVIDENCE_PERSISTENCE_FAILED}: ${msg}`)
    }

    this.safeEmit(EvidenceEventType.EVIDENCE_REPOSITORY_ACCEPTED, {
      evidenceId:   record.evidenceId,
      evidenceHash: record.evidenceHash,
    })
    this.sealed.set(id, record)
    return record
  }

  async findById(id: ExecutionEvidenceId): Promise<SealedExecutionEvidence | undefined> {
    return this.repo.findById(id)
  }

  async verifyIntegrity(id: ExecutionEvidenceId): Promise<EvidenceIntegrityVerification> {
    const result = await this.repo.verifyIntegrity(id)
    if (result.status === EvidenceIntegrityStatus.INTEGRITY_FAILED) {
      this.safeEmit(EvidenceEventType.EVIDENCE_INTEGRITY_VERIFICATION_FAILED, {
        evidenceId: id,
        status:     result.status,
        checkedAt:  result.checkedAt,
      })
    }
    return result
  }
}
