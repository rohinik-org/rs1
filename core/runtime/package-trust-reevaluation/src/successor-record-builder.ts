import type {
  RecordTrustDecisionCommand,
  RecordSupersessionCommand,
  RepositoryRecordId,
  OperationId,
} from '@rohinik-org/package-trust-repository'
import type {
  PackageTrustReevaluationWorkItem,
  PackageTrustPipelineResult,
} from './types.js'

export interface SuccessorCommands {
  readonly trustCommand: RecordTrustDecisionCommand
  readonly supersessionCommand: RecordSupersessionCommand
}

export function buildSuccessorCommands(
  workItem: PackageTrustReevaluationWorkItem,
  pipelineResult: PackageTrustPipelineResult,
  successorRecordId: RepositoryRecordId,
  recordedAt: string,
): SuccessorCommands {
  const trustCommand: RecordTrustDecisionCommand = {
    operationId: workItem.operationId as OperationId,
    recordId: successorRecordId,
    subject: workItem.candidate.subject,
    artifactIdentity: workItem.candidate.artifactIdentity,
    decision: pipelineResult.decision,
    assessmentReferences: pipelineResult.assessmentReferences,
    policyReference: pipelineResult.policyReference,
    ...(pipelineResult.evidenceReference !== undefined ? { evidenceReference: pipelineResult.evidenceReference } : {}),
    recordedAt,
    effectiveAt: recordedAt,
    expectedRevision: workItem.expectedRepositoryRevision,
  }

  const supersessionCommand: RecordSupersessionCommand = {
    operationId: workItem.operationId as OperationId,
    priorRecordId: workItem.candidate.trustDecisionRecordId,
    successorRecordId,
    reason: 'reevaluation',
    recordedAt,
    expectedRevision: workItem.expectedRepositoryRevision,
  }

  return { trustCommand, supersessionCommand }
}
