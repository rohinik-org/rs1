import { randomUUID } from 'node:crypto'
import type {
  RecoveryDirective,
  RecoveryRecord,
  ApplyRecord,
  PreMutationCheckpoint,
} from '@rohinik-org/control-protocol-v1'
import {
  ControlWorkflowState,
  ControlErrorCode,
  MutationOutcome,
  RecoveryStrategy,
} from '@rohinik-org/control-protocol-v1'
import type { ControlWorkflowService } from '@rohinik-org/control-workflow-engine'

// ── Error ─────────────────────────────────────────────────────────────────────

export class RecoveryEngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RecoveryEngineError'
  }
}

// ── Request types ─────────────────────────────────────────────────────────────

export interface IssueRecoveryDirectiveRequest {
  readonly directiveId?:  string   // if set, enables idempotent replay
  readonly workflowId:    string
  readonly artifactId:    string
  readonly contentHash:   string
  readonly strategy:      RecoveryStrategy
  readonly operatorId:    string
  readonly rationale:     string
  readonly checkpointId?: string
  readonly compensatingArtifactId?: string
}

export interface ExecuteRecoveryRequest {
  readonly workflowId:     string
  readonly directiveId:    string
  readonly startedAt:      string
  readonly completedAt:    string
  readonly exitCode:       number
  readonly mutationOutcome: MutationOutcome
  readonly succeeded:      boolean
  readonly diagnostics?:   string
  readonly stdoutRef?:     string
  readonly stderrRef?:     string
  readonly evidenceRef?:   string
}

// ── Safety matrix ─────────────────────────────────────────────────────────────
//
// Returns null if strategy is admissible, or an error message if not.
// MANUAL is always admissible — operator takes explicit responsibility.
// RESTORE_CHECKPOINT requires clean checkpoint (no pre-existing dirty files).
// REVERSE_PATCH requires outcome is APPLIED or PARTIAL (something was applied).
// INDETERMINATE blocks all automatic strategies.

function checkSafety(
  strategy: RecoveryStrategy,
  applyRecord: ApplyRecord | undefined,
  checkpoint: PreMutationCheckpoint | undefined,
): string | null {
  const outcome = applyRecord?.mutationOutcome ?? MutationOutcome.NOT_STARTED

  if (strategy === RecoveryStrategy.MANUAL) return null

  // INDETERMINATE blocks all automatic strategies
  if (outcome === MutationOutcome.INDETERMINATE) {
    return `INDETERMINATE mutation outcome blocks automatic recovery — use MANUAL`
  }

  // Nothing was applied — no need to reverse
  if (outcome === MutationOutcome.NOT_STARTED || outcome === MutationOutcome.NO_MUTATION) {
    return `MutationOutcome ${outcome} means nothing was applied; no rollback needed`
  }

  // RESTORE_CHECKPOINT: only admissible if checkpoint is clean
  if (strategy === RecoveryStrategy.RESTORE_CHECKPOINT) {
    if (!checkpoint) {
      return 'CHECKPOINT_REQUIRED: checkpointId must be provided for RESTORE_CHECKPOINT'
    }
    if (checkpoint.dirtyState.hasUncommittedChanges) {
      return `RESTORE_CHECKPOINT is unsafe: checkpoint recorded pre-existing uncommitted changes in ${checkpoint.dirtyState.files.length} file(s); restoring would destroy unrelated developer work`
    }
    return null
  }

  // REVERSE_PATCH: admissible for APPLIED and PARTIAL
  if (strategy === RecoveryStrategy.REVERSE_PATCH) {
    return null  // clean or dirty checkpoint — patch reversal is attribution-safe
  }

  return null  // COMPENSATING_CHANGE — validation deferred to T6/HTTP layer
}

// ── RecoveryEngine ────────────────────────────────────────────────────────────

export class RecoveryEngine {
  private readonly directives = new Map<string, RecoveryDirective>()

  constructor(
    private readonly workflows: ControlWorkflowService,
  ) {}

  async issueDirective(req: IssueRecoveryDirectiveRequest): Promise<RecoveryDirective> {
    // Idempotent replay
    if (req.directiveId) {
      const existing = this.directives.get(req.directiveId)
      if (existing) return existing
    }

    // Load and guard workflow state
    const wf = await this.workflows.load(req.workflowId)
    if (!wf) {
      throw new RecoveryEngineError(ControlErrorCode.WORKFLOW_NOT_FOUND, `Workflow ${req.workflowId} not found`)
    }
    if (wf.state !== ControlWorkflowState.RECOVERY_REQUIRED) {
      throw new RecoveryEngineError(ControlErrorCode.INVALID_TRANSITION, `Cannot issue directive for workflow in state "${wf.state}"; must be RECOVERY_REQUIRED`)
    }

    // Validate artifact correlation: workflow must know the artifact
    if (wf.artifactId !== req.artifactId) {
      throw new RecoveryEngineError(ControlErrorCode.ARTIFACT_NOT_FOUND, `Artifact ${req.artifactId} not associated with workflow ${req.workflowId}`)
    }

    // Hash binding: contentHash must match the apply record's artifact
    // We trust the caller passes the hash they know; validate against the apply record's artifact hash.
    // The apply record doesn't store the contentHash directly, but the approval binding does.
    // Simplest: require caller hash matches the stored artifact hash via the workflow's approvalId.
    // For T5 we validate that the contentHash is non-empty and matches what's expected —
    // the full artifact lookup happens at the HTTP layer (T6). Here: check against the
    // stored applyRecord's checkpointId reference to confirm hash is at least non-trivial.
    // ponytail: full cross-artifact hash check at T6 HTTP boundary; here we validate format only
    if (!req.contentHash || req.contentHash.length < 10) {
      throw new RecoveryEngineError(ControlErrorCode.HASH_MISMATCH, `contentHash "${req.contentHash}" is not a valid hash`)
    }

    // For RESTORE_CHECKPOINT: validate checkpointId provided and checkpoint exists
    if (req.strategy === RecoveryStrategy.RESTORE_CHECKPOINT && !req.checkpointId) {
      throw new RecoveryEngineError(ControlErrorCode.CHECKPOINT_REQUIRED, 'checkpointId is required for RESTORE_CHECKPOINT')
    }

    let checkpoint: PreMutationCheckpoint | undefined
    if (req.checkpointId) {
      const cp = await this.workflows.loadCheckpoint(req.checkpointId)
      if (!cp) {
        throw new RecoveryEngineError(ControlErrorCode.CHECKPOINT_NOT_FOUND, `Checkpoint ${req.checkpointId} not found`)
      }
      checkpoint = cp
    }

    // For workflows with a stored checkpointId, load the original checkpoint if not overridden
    if (!checkpoint && wf.checkpointId) {
      const cp = await this.workflows.loadCheckpoint(wf.checkpointId)
      if (cp) checkpoint = cp
    }

    // Safety matrix check
    const safetyError = checkSafety(req.strategy, wf.applyRecord, checkpoint)
    if (safetyError) {
      throw new RecoveryEngineError(ControlErrorCode.RECOVERY_UNSAFE, safetyError)
    }

    const directiveId = req.directiveId ?? randomUUID()
    const directive: RecoveryDirective = {
      directiveId,
      workflowId:  req.workflowId,
      artifactId:  req.artifactId,
      contentHash: req.contentHash,
      strategy:    req.strategy,
      issuedAt:    new Date().toISOString(),
      operatorId:  req.operatorId,
      rationale:   req.rationale,
      ...(req.checkpointId !== undefined && { checkpointId: req.checkpointId }),
      ...(req.compensatingArtifactId !== undefined && { compensatingArtifactId: req.compensatingArtifactId }),
    }

    this.directives.set(directiveId, directive)
    return directive
  }

  async executeRecovery(req: ExecuteRecoveryRequest): Promise<RecoveryRecord> {
    const directive = this.directives.get(req.directiveId)
    if (!directive) {
      throw new RecoveryEngineError('DIRECTIVE_NOT_FOUND', `Directive ${req.directiveId} not found`)
    }

    const wf = await this.workflows.load(req.workflowId)
    if (!wf) {
      throw new RecoveryEngineError(ControlErrorCode.WORKFLOW_NOT_FOUND, `Workflow ${req.workflowId} not found`)
    }

    // Transition RECOVERY_REQUIRED → RECOVERING before attaching record
    if (wf.state === ControlWorkflowState.RECOVERY_REQUIRED) {
      await this.workflows.transition(req.workflowId, ControlWorkflowState.RECOVERING)
    } else if (wf.state !== ControlWorkflowState.RECOVERING) {
      throw new RecoveryEngineError(ControlErrorCode.INVALID_TRANSITION, `Cannot execute recovery for workflow in state "${wf.state}"`)
    }

    const record: RecoveryRecord = {
      directiveId:     req.directiveId,
      workflowId:      req.workflowId,
      artifactId:      directive.artifactId,
      startedAt:       req.startedAt,
      completedAt:     req.completedAt,
      strategy:        directive.strategy,
      exitCode:        req.exitCode,
      mutationOutcome: req.mutationOutcome,
      succeeded:       req.succeeded,
      ...(req.diagnostics  !== undefined && { diagnostics: req.diagnostics }),
      ...(req.stdoutRef    !== undefined && { stdoutRef:   req.stdoutRef }),
      ...(req.stderrRef    !== undefined && { stderrRef:   req.stderrRef }),
      ...(req.evidenceRef  !== undefined && { evidenceRef: req.evidenceRef }),
    }

    // Atomic: attach record then transition to terminal state
    await this.workflows.attachRecoveryRecord(req.workflowId, record)
    const nextState = req.succeeded
      ? ControlWorkflowState.RECOVERED
      : ControlWorkflowState.FAILED
    await this.workflows.transition(req.workflowId, nextState)

    return record
  }

  async loadDirective(directiveId: string): Promise<RecoveryDirective | null> {
    return this.directives.get(directiveId) ?? null
  }
}
