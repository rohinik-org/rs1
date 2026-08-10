import { randomUUID } from 'node:crypto'
import type { PreMutationCheckpoint, ControlWorkflow } from '@rohinik-org/control-protocol-v1'
import {
  ControlWorkflowState,
  ControlWorkflowTransitions,
  ControlWorkflowTerminalStates,
  ControlErrorCode,
} from '@rohinik-org/control-protocol-v1'
import type { ControlApprovalService } from '@rohinik-org/control-approval-store'
import { ControlApprovalError } from '@rohinik-org/control-approval-store'

// ── Error ─────────────────────────────────────────────────────────────────────

export class ControlWorkflowError extends Error {
  constructor(
    readonly code: typeof ControlErrorCode[keyof typeof ControlErrorCode],
    message: string,
  ) {
    super(message)
    this.name = 'ControlWorkflowError'
  }
}

// ── ControlWorkflowRecord ─────────────────────────────────────────────────────
// Extends the protocol ControlWorkflow shape — same fields, mutable internally.

export interface ControlWorkflowRecord extends ControlWorkflow {}

// ── Repository interfaces ─────────────────────────────────────────────────────

export interface IWorkflowRepository {
  save(wf: ControlWorkflowRecord): Promise<void>
  load(workflowId: string): Promise<ControlWorkflowRecord | null>
  loadByIdempotencyKey(key: string): Promise<ControlWorkflowRecord | null>
  listByArtifact(artifactId: string): Promise<ControlWorkflowRecord[]>
}

export interface ICheckpointRepository {
  save(cp: PreMutationCheckpoint): Promise<void>
  load(checkpointId: string): Promise<PreMutationCheckpoint | null>
}

// ── In-memory implementations ─────────────────────────────────────────────────

export class InMemoryWorkflowRepository implements IWorkflowRepository {
  private readonly byId        = new Map<string, ControlWorkflowRecord>()
  private readonly byIdem      = new Map<string, ControlWorkflowRecord>()
  private readonly byArtifact  = new Map<string, ControlWorkflowRecord[]>()

  async save(wf: ControlWorkflowRecord): Promise<void> {
    this.byId.set(wf.workflowId, wf)
  }

  async load(workflowId: string): Promise<ControlWorkflowRecord | null> {
    return this.byId.get(workflowId) ?? null
  }

  async loadByIdempotencyKey(key: string): Promise<ControlWorkflowRecord | null> {
    return this.byIdem.get(key) ?? null
  }

  async listByArtifact(artifactId: string): Promise<ControlWorkflowRecord[]> {
    return this.byArtifact.get(artifactId) ?? []
  }

  // ponytail: internal method for idempotency key registration at create time
  registerIdempotencyKey(key: string, wf: ControlWorkflowRecord): void {
    this.byIdem.set(key, wf)
  }

  registerArtifactIndex(wf: ControlWorkflowRecord): void {
    const list = this.byArtifact.get(wf.artifactId) ?? []
    this.byArtifact.set(wf.artifactId, [...list, wf])
  }
}

export class InMemoryCheckpointRepository implements ICheckpointRepository {
  private readonly byId = new Map<string, PreMutationCheckpoint>()

  async save(cp: PreMutationCheckpoint): Promise<void> {
    this.byId.set(cp.checkpointId, cp)
  }

  async load(checkpointId: string): Promise<PreMutationCheckpoint | null> {
    return this.byId.get(checkpointId) ?? null
  }
}

// ── ControlWorkflowService ────────────────────────────────────────────────────

export class ControlWorkflowService {
  constructor(
    private readonly workflows:   IWorkflowRepository,
    private readonly checkpoints: ICheckpointRepository,
    private readonly approvals:   ControlApprovalService,
  ) {}

  async create(
    artifactId: string,
    opts?: { idempotencyKey?: string },
  ): Promise<ControlWorkflowRecord> {
    if (opts?.idempotencyKey) {
      const existing = await this.workflows.loadByIdempotencyKey(opts.idempotencyKey)
      if (existing) return existing
    }

    const now = new Date().toISOString()
    const wf: ControlWorkflowRecord = {
      workflowId: randomUUID(),
      artifactId,
      state:      ControlWorkflowState.DRAFT,
      createdAt:  now,
      updatedAt:  now,
    }
    await this.workflows.save(wf)

    if (opts?.idempotencyKey) {
      // InMemoryWorkflowRepository exposes registerIdempotencyKey — cast if available
      const repo = this.workflows as InMemoryWorkflowRepository
      if (typeof repo.registerIdempotencyKey === 'function') {
        repo.registerIdempotencyKey(opts.idempotencyKey, wf)
      }
    }

    const repo = this.workflows as InMemoryWorkflowRepository
    if (typeof repo.registerArtifactIndex === 'function') {
      repo.registerArtifactIndex(wf)
    }

    return wf
  }

  async load(workflowId: string): Promise<ControlWorkflowRecord | null> {
    return this.workflows.load(workflowId)
  }

  async transition(
    workflowId: string,
    to: ControlWorkflowState,
  ): Promise<ControlWorkflowRecord> {
    const wf = await this._require(workflowId)
    this._assertTransition(wf.state, to)

    const updated = { ...wf, state: to, updatedAt: new Date().toISOString() }
    await this.workflows.save(updated)
    return updated
  }

  // Guarded approve: validates binding in approval store before transitioning
  async approve(workflowId: string, approvalId: string): Promise<ControlWorkflowRecord> {
    const wf = await this._require(workflowId)

    if (wf.state !== ControlWorkflowState.AWAITING_APPROVAL) {
      throw new ControlWorkflowError(
        ControlErrorCode.INVALID_TRANSITION,
        `Cannot approve workflow in state "${wf.state}"; must be AWAITING_APPROVAL`,
      )
    }

    await this._validateApprovalOrThrow(approvalId, wf.artifactId)

    const updated: ControlWorkflowRecord = {
      ...wf,
      state:      ControlWorkflowState.APPROVED,
      approvalId,
      updatedAt:  new Date().toISOString(),
    }
    await this.workflows.save(updated)
    return updated
  }

  async beginApply(workflowId: string, checkpointId: string): Promise<ControlWorkflowRecord> {
    const wf = await this._require(workflowId)

    if (wf.state !== ControlWorkflowState.APPROVED) {
      throw new ControlWorkflowError(
        ControlErrorCode.INVALID_TRANSITION,
        `Cannot begin apply in state "${wf.state}"; must be APPROVED`,
      )
    }

    if (!checkpointId) {
      throw new ControlWorkflowError(
        ControlErrorCode.CHECKPOINT_REQUIRED,
        'checkpointId is required to begin apply',
      )
    }

    const cp = await this.checkpoints.load(checkpointId)
    if (!cp) {
      throw new ControlWorkflowError(
        ControlErrorCode.CHECKPOINT_NOT_FOUND,
        `Checkpoint ${checkpointId} not found`,
      )
    }

    const updated: ControlWorkflowRecord = {
      ...wf,
      state:        ControlWorkflowState.APPLYING,
      checkpointId,
      updatedAt:    new Date().toISOString(),
    }
    await this.workflows.save(updated)
    return updated
  }

  async saveCheckpoint(cp: PreMutationCheckpoint): Promise<void> {
    await this.checkpoints.save(cp)
  }

  async loadCheckpoint(checkpointId: string): Promise<PreMutationCheckpoint | null> {
    return this.checkpoints.load(checkpointId)
  }

  async listByArtifact(artifactId: string): Promise<ControlWorkflowRecord[]> {
    return this.workflows.listByArtifact(artifactId)
  }

  // Test helper: bypass transition guard for terminal-state setup in tests
  async forceState(workflowId: string, state: ControlWorkflowState): Promise<ControlWorkflowRecord> {
    const wf = await this._require(workflowId)
    const updated = { ...wf, state, updatedAt: new Date().toISOString() }
    await this.workflows.save(updated)
    return updated
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async _require(workflowId: string): Promise<ControlWorkflowRecord> {
    const wf = await this.workflows.load(workflowId)
    if (!wf) {
      throw new ControlWorkflowError(
        ControlErrorCode.WORKFLOW_NOT_FOUND,
        `Workflow ${workflowId} not found`,
      )
    }
    return wf
  }

  private _assertTransition(from: ControlWorkflowState, to: ControlWorkflowState): void {
    const allowed = ControlWorkflowTransitions[from]
    if (!allowed.includes(to)) {
      throw new ControlWorkflowError(
        ControlErrorCode.INVALID_TRANSITION,
        `Transition "${from}" → "${to}" is not allowed`,
      )
    }
  }

  private async _validateApprovalOrThrow(
    approvalId: string,
    artifactId: string,
  ): Promise<void> {
    // Load the approval directly by ID
    const decision = await this.approvals.getApprovalById(approvalId)

    if (!decision) {
      throw new ControlWorkflowError(
        ControlErrorCode.APPROVAL_NOT_FOUND,
        `Approval ${approvalId} not found`,
      )
    }

    // Expiry check
    if (decision.expiresAt && new Date(decision.expiresAt) <= new Date()) {
      throw new ControlWorkflowError(
        ControlErrorCode.APPROVAL_EXPIRED,
        `Approval ${approvalId} expired at ${decision.expiresAt}`,
      )
    }

    // Binding must be for this artifact
    if (decision.binding.artifactId !== artifactId) {
      throw new ControlWorkflowError(
        ControlErrorCode.APPROVAL_BINDING_INVALID,
        `Approval ${approvalId} is bound to artifact ${decision.binding.artifactId}, not ${artifactId}`,
      )
    }
  }
}
