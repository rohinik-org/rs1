import {
  EvidenceIntegrityStatus,
  EvidenceErrorCode,
  verifyEvidenceHash,
} from '@rohinik-org/execution-evidence-ir'
import type {
  ExecutionEvidenceId,
  SealedExecutionEvidence,
  ExecutionEvidenceRepository,
  EvidenceIntegrityVerification,
} from '@rohinik-org/execution-evidence-ir'

export class MemoryEvidenceRepository implements ExecutionEvidenceRepository {
  private readonly records = new Map<string, SealedExecutionEvidence>()

  async store(record: SealedExecutionEvidence): Promise<void> {
    const existing = this.records.get(record.evidenceId)
    if (existing) {
      if (existing.evidenceHash === record.evidenceHash) return // idempotent
      throw new Error(`${EvidenceErrorCode.EVIDENCE_CONFLICTING_REWRITE}: evidence '${record.evidenceId}' exists with different hash`)
    }
    this.records.set(record.evidenceId, record)
  }

  async findById(id: ExecutionEvidenceId): Promise<SealedExecutionEvidence | undefined> {
    return this.records.get(id)
  }

  async verifyIntegrity(id: ExecutionEvidenceId): Promise<EvidenceIntegrityVerification> {
    const record = this.records.get(id)
    const checkedAt = new Date()
    if (!record) {
      return { evidenceId: id, status: EvidenceIntegrityStatus.NOT_FOUND, checkedAt }
    }
    const status = verifyEvidenceHash(record)
      ? EvidenceIntegrityStatus.VALID
      : EvidenceIntegrityStatus.INTEGRITY_FAILED
    return { evidenceId: id, status, checkedAt }
  }

  forceCorrupt(id: ExecutionEvidenceId, fakeHash: string): void {
    const record = this.records.get(id)
    if (record) {
      this.records.set(id, { ...record, evidenceHash: fakeHash })
    }
  }
}
