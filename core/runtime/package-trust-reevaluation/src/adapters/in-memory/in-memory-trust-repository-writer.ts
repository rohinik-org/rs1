import type {
  RecordTrustDecisionCommand,
  RecordSupersessionCommand,
  AppendTrustEventCommand,
  RepositoryWriteReceipt,
  RepositoryRecordId,
  OperationId,
  RepositoryRevision,
} from '@rohinik-org/package-trust-repository'
import { RepositoryWriteConflict } from '@rohinik-org/package-trust-repository'
import type { TrustRepositoryWriter } from '../../ports/trust-repository-writer.js'

export class InMemoryTrustRepositoryWriter implements TrustRepositoryWriter {
  readonly trustRecords: RecordTrustDecisionCommand[] = []
  readonly supersessions: RecordSupersessionCommand[] = []
  readonly events: AppendTrustEventCommand[] = []

  // ponytail: revision tracking for concurrency tests
  private revision = 1

  simulateConflict = false

  async appendSuccessorTrustRecord(command: RecordTrustDecisionCommand): Promise<RepositoryWriteReceipt> {
    if (this.simulateConflict) {
      throw new RepositoryWriteConflict('revision-conflict', 'simulated conflict', command.operationId)
    }
    // Idempotency: same recordId → return existing
    const existing = this.trustRecords.find(r => r.recordId === command.recordId)
    if (existing) {
      return {
        operationId: command.operationId,
        recordId: command.recordId,
        revision: this.revision as RepositoryRevision,
        recordedAt: command.recordedAt,
        idempotent: true,
      }
    }
    this.trustRecords.push(command)
    this.revision++
    return {
      operationId: command.operationId,
      recordId: command.recordId,
      revision: this.revision as RepositoryRevision,
      recordedAt: command.recordedAt,
      idempotent: false,
    }
  }

  async recordSupersession(command: RecordSupersessionCommand): Promise<RepositoryWriteReceipt> {
    if (this.simulateConflict) {
      throw new RepositoryWriteConflict('revision-conflict', 'simulated conflict', command.operationId)
    }
    // Idempotency: same prior+successor already recorded
    const existing = this.supersessions.find(
      s => s.priorRecordId === command.priorRecordId && s.successorRecordId === command.successorRecordId
    )
    if (existing) {
      return {
        operationId: command.operationId,
        recordId: command.successorRecordId as RepositoryRecordId,
        revision: this.revision as RepositoryRevision,
        recordedAt: command.recordedAt,
        idempotent: true,
      }
    }
    this.supersessions.push(command)
    this.revision++
    return {
      operationId: command.operationId,
      recordId: command.successorRecordId as RepositoryRecordId,
      revision: this.revision as RepositoryRevision,
      recordedAt: command.recordedAt,
      idempotent: false,
    }
  }

  async appendReevaluationEvent(command: AppendTrustEventCommand): Promise<RepositoryWriteReceipt> {
    this.events.push(command)
    this.revision++
    return {
      operationId: command.operationId,
      recordId: command.eventId as RepositoryRecordId,
      revision: this.revision as RepositoryRevision,
      recordedAt: command.recordedAt,
      idempotent: false,
    }
  }
}
