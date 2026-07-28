import type {
  ProvisioningExecutionId,
  ProvisioningActionId,
  ProvisioningMutationId,
  ProvisioningOperation,
  ProvisioningJournalEntry,
  ProvisioningJournal,
  AuthorizationId,
  MutationJournalPort,
  AuthorizedCompensationDefinition,
  InstantiatedCompensationRecord,
  ProvisioningDiagnosticCode,
  ProvisioningDiagnosticId,
  QuarantinedArtifactRecord,
  IsoTimestamp,
  ResolutionPlanId,
  ProvisioningJournalSemanticHash,
  ProvisioningAuditJournalHash,
} from '@rohinik-org/provisioning-ir'
import { canonicalize, sha256Hex } from './canonicalize.js'

type MutationState = 'created' | 'prepared' | 'started' | 'succeeded' | 'failed'

export class JournalCoordinator implements MutationJournalPort {
  private readonly entries: ProvisioningJournalEntry[] = []
  private readonly mutationStates = new Map<string, MutationState>()
  private readonly successfulMutations: Array<{
    mutationId: ProvisioningMutationId
    compensation: InstantiatedCompensationRecord | null
  }> = []
  private sequence = 0

  constructor(
    private readonly executionId: ProvisioningExecutionId,
    private readonly planId: ResolutionPlanId,
    private readonly authorizationId: AuthorizationId,
    private readonly clock: () => IsoTimestamp,
  ) {}

  prepareMutation(
    actionId: ProvisioningActionId,
    mutationId: ProvisioningMutationId,
    operation: ProvisioningOperation,
    classification: AuthorizedCompensationDefinition | { kind: 'non-compensable'; approvedReasonCode: string },
  ): void {
    this.mutationStates.set(mutationId, 'prepared')
    this.entries.push({
      ...this.base(actionId, mutationId),
      event: 'mutation-prepared',
      operation,
      compensationClassification: classification,
    })
  }

  startMutation(
    actionId: ProvisioningActionId,
    mutationId: ProvisioningMutationId,
    operation: ProvisioningOperation,
  ): void {
    const state = this.mutationStates.get(mutationId)
    if (state !== 'prepared') {
      throw new Error(
        `JournalCoordinator invariant: startMutation requires prior prepareMutation (mutationId=${mutationId}, state=${state ?? 'none'})`,
      )
    }
    this.mutationStates.set(mutationId, 'started')
    this.entries.push({
      ...this.base(actionId, mutationId),
      event: 'mutation-started',
      operation,
    })
  }

  recordSuccess(
    actionId: ProvisioningActionId,
    mutationId: ProvisioningMutationId,
    operation: ProvisioningOperation,
    instantiatedCompensation?: InstantiatedCompensationRecord,
  ): void {
    const state = this.mutationStates.get(mutationId)
    if (state !== 'started') {
      throw new Error(
        `JournalCoordinator invariant: recordSuccess requires prior startMutation (mutationId=${mutationId}, state=${state ?? 'none'})`,
      )
    }
    this.mutationStates.set(mutationId, 'succeeded')
    this.successfulMutations.push({ mutationId, compensation: instantiatedCompensation ?? null })
    const entry: ProvisioningJournalEntry = {
      ...this.base(actionId, mutationId),
      event: 'mutation-succeeded',
      operation,
      ...(instantiatedCompensation !== undefined ? { instantiatedCompensation } : {}),
    }
    this.entries.push(entry)
  }

  recordFailure(
    actionId: ProvisioningActionId,
    mutationId: ProvisioningMutationId,
    operation: ProvisioningOperation,
    codes: readonly ProvisioningDiagnosticCode[],
    ids: readonly ProvisioningDiagnosticId[],
  ): void {
    const state = this.mutationStates.get(mutationId)
    if (state !== 'started') {
      throw new Error(`JournalCoordinator invariant: recordFailure requires state 'started', got '${state ?? 'none'}' for mutationId '${mutationId}'`)
    }
    this.mutationStates.set(mutationId, 'failed')
    this.entries.push({
      ...this.base(actionId, mutationId),
      event: 'mutation-failed',
      operation,
      diagnosticCodes: codes,
      diagnosticIds: ids,
    })
  }

  recordValidationStarted(
    actionId: ProvisioningActionId,
    mutationId: ProvisioningMutationId,
    validationKind: string,
  ): void {
    this.entries.push({
      ...this.base(actionId, mutationId),
      event: 'validation-started',
      validationKind,
    })
  }

  recordValidationSucceeded(
    actionId: ProvisioningActionId,
    mutationId: ProvisioningMutationId,
    validationKind: string,
  ): void {
    this.entries.push({
      ...this.base(actionId, mutationId),
      event: 'validation-succeeded',
      validationKind,
    })
  }

  recordValidationFailed(
    actionId: ProvisioningActionId,
    mutationId: ProvisioningMutationId,
    validationKind: string,
    codes: readonly ProvisioningDiagnosticCode[],
    ids: readonly ProvisioningDiagnosticId[],
    quarantineRecord?: QuarantinedArtifactRecord,
  ): void {
    const entry: ProvisioningJournalEntry = {
      ...this.base(actionId, mutationId),
      event: 'validation-failed',
      validationKind,
      diagnosticCodes: codes,
      diagnosticIds: ids,
      ...(quarantineRecord !== undefined ? { quarantinedArtifactRecord: quarantineRecord } : {}),
    }
    this.entries.push(entry)
  }

  getCompensationPlan(): readonly {
    mutationId: ProvisioningMutationId
    compensation: InstantiatedCompensationRecord
  }[] {
    return [...this.successfulMutations]
      .reverse()
      .filter(
        (m): m is { mutationId: ProvisioningMutationId; compensation: InstantiatedCompensationRecord } =>
          m.compensation !== null,
      )
  }

  buildJournal(): ProvisioningJournal {
    return {
      executionId: this.executionId,
      planId: this.planId,
      authorizationId: this.authorizationId,
      entries: [...this.entries],
      semanticJournalHash: this.computeSemanticHash(),
      auditJournalHash: this.computeAuditHash(),
    }
  }

  private base(actionId: ProvisioningActionId, mutationId: ProvisioningMutationId) {
    return {
      executionId: this.executionId,
      planId: this.planId,
      authorizationId: this.authorizationId,
      sequence: ++this.sequence,
      actionId,
      mutationId,
      occurredAt: this.clock(),
    }
  }

  private computeSemanticHash(): ProvisioningJournalSemanticHash {
    const projection = {
      planId: this.planId as string,
      authorizationId: this.authorizationId as string,
      orderedEvents: this.entries.map(e => {
        const base = {
          sequence: e.sequence,
          mutationId: e.mutationId as string,
          actionId: e.actionId as string,
          event: e.event,
          operationKind: 'operation' in e ? e.operation.kind : '',
          operationTargetId: 'operation' in e ? e.operation.targetId : '',
        }
        if (e.event === 'mutation-succeeded' && e.instantiatedCompensation) {
          return { ...base, compensationKind: e.instantiatedCompensation.kind }
        }
        return base
      }),
    }
    return sha256Hex(canonicalize(projection)) as ProvisioningJournalSemanticHash
  }

  private computeAuditHash(): ProvisioningAuditJournalHash {
    return sha256Hex(canonicalize(this.entries as unknown[])) as ProvisioningAuditJournalHash
  }
}
