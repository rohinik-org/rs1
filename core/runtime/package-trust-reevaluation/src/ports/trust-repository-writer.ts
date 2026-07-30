import type {
  RecordTrustDecisionCommand,
  RecordSupersessionCommand,
  AppendTrustEventCommand,
  RepositoryWriteReceipt,
} from '@rohinik-org/package-trust-repository'

export interface TrustRepositoryWriter {
  appendSuccessorTrustRecord(command: RecordTrustDecisionCommand): Promise<RepositoryWriteReceipt>
  recordSupersession(command: RecordSupersessionCommand): Promise<RepositoryWriteReceipt>
  appendReevaluationEvent(command: AppendTrustEventCommand): Promise<RepositoryWriteReceipt>
}
