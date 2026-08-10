/**
 * @rohinik-org/control
 *
 * SDK handles for the Stage 16E control plane.
 * Wraps @rohinik-org/control-protocol-v1 route calls only — no RS1 internals.
 *
 * Authority boundaries enforced by design:
 *   approve  ≠ apply
 *   apply    ≠ verify
 *   verify failure ≠ rollback authority
 *   recover  ≠ automatic rollback
 */

import type {
  RegisterArtifactResponse,
  ApproveArtifactResponse,
  DenyArtifactResponse,
  CreateWorkflowResponse,
  GetWorkflowResponse,
  ApplyWorkflowResponse,
  VerifyWorkflowResponse,
  RecoverWorkflowResponse,
  CancelWorkflowResponse,
  ControlEvidenceResponse,
  VerificationResult,
  RecoveryRecord,
  PreMutationCheckpoint,
  ApplyRecord,
  ControlArtifactActionType,
  RecoveryStrategy,
  MutationOutcome,
  VerificationStatus,
  VerificationCheck,
} from '@rohinik-org/control-protocol-v1'
import { ControlWorkflowState } from '@rohinik-org/control-protocol-v1'

// ── ControlSdkError ───────────────────────────────────────────────────────────

export class ControlSdkError extends Error {
  readonly status?: number
  readonly code?:   string
  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'ControlSdkError'
    if (status !== undefined) this.status = status
    if (code   !== undefined) this.code   = code
  }
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

async function request<T>(baseUrl: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }).catch(err => {
    const msg = err instanceof Error ? err.message : String(err)
    throw new ControlSdkError(`Cannot reach RS1 at ${baseUrl}: ${msg}`)
  })
  const data = await res.json() as any
  if (!res.ok) {
    throw new ControlSdkError(data?.message ?? data?.error ?? `HTTP ${res.status}`, res.status, data?.code)
  }
  return data as T
}

// ── ArtifactHandle ────────────────────────────────────────────────────────────

export class ArtifactHandle {
  readonly id:          string
  readonly contentHash: string
  readonly scope:       string
  readonly actionType:  ControlArtifactActionType
  readonly version:     string
  readonly createdAt:   string

  constructor(
    private readonly baseUrl: string,
    resp: RegisterArtifactResponse,
  ) {
    this.id          = resp.artifactId
    this.contentHash = resp.contentHash
    this.scope       = resp.scope
    this.actionType  = resp.actionType
    this.version     = resp.version
    this.createdAt   = resp.createdAt
  }

  approve(params: {
    operatorId: string
    rationale?: string
    expiresAt?: string
  }): Promise<ApproveArtifactResponse> {
    return request<ApproveArtifactResponse>(
      this.baseUrl, 'POST', `/v1/control/artifacts/${this.id}/approve`,
      {
        contentHash: this.contentHash,  // derived from artifact — caller cannot override
        actionType:  this.actionType,
        scope:       this.scope,
        operatorId:  params.operatorId,
        ...(params.rationale !== undefined && { rationale: params.rationale }),
        ...(params.expiresAt !== undefined && { expiresAt: params.expiresAt }),
      },
    )
  }

  deny(params: { operatorId: string; rationale?: string }): Promise<DenyArtifactResponse> {
    return request<DenyArtifactResponse>(
      this.baseUrl, 'POST', `/v1/control/artifacts/${this.id}/deny`,
      {
        operatorId: params.operatorId,
        ...(params.rationale !== undefined && { rationale: params.rationale }),
      },
    )
  }
}

// ── WorkflowHandle ────────────────────────────────────────────────────────────

export class WorkflowHandle {
  readonly id:         string
  readonly artifactId: string
  readonly createdAt:  string
  private _state:      ControlWorkflowState

  constructor(
    private readonly baseUrl: string,
    resp: CreateWorkflowResponse | GetWorkflowResponse,
  ) {
    this.id          = resp.workflowId
    this.artifactId  = resp.artifactId
    this.createdAt   = resp.createdAt
    this._state      = resp.state as ControlWorkflowState
  }

  get state(): ControlWorkflowState { return this._state }

  async reload(): Promise<void> {
    const fresh = await request<GetWorkflowResponse>(
      this.baseUrl, 'GET', `/v1/control/workflows/${this.id}`,
    )
    this._state = fresh.state as ControlWorkflowState
  }

  async apply(params: {
    approvalId:  string
    checkpoint:  PreMutationCheckpoint
    applyRecord: ApplyRecord
  }): Promise<ApplyWorkflowResponse> {
    const resp = await request<ApplyWorkflowResponse>(
      this.baseUrl, 'POST', `/v1/control/workflows/${this.id}/apply`,
      { approvalId: params.approvalId, checkpoint: params.checkpoint, applyRecord: params.applyRecord },
    )
    this._state = resp.state as ControlWorkflowState
    return resp
  }

  async verify(params: {
    command:          string
    verifierId?:      string
    verifierVersion?: string
    startedAt:        string
    finishedAt:       string
    durationMs:       number
    exitCode:         number
    status:           VerificationStatus
    checks:           VerificationCheck[]
    timedOut:         boolean
    diagnostics?:     string
    stdoutRef?:       string
    stderrRef?:       string
  }): Promise<VerificationResult> {
    const resp = await request<VerifyWorkflowResponse>(
      this.baseUrl, 'POST', `/v1/control/workflows/${this.id}/verify`,
      params,
    )
    this._state = resp.state as ControlWorkflowState
    return resp.verification
  }

  async recover(params: {
    strategy:        RecoveryStrategy
    operatorId:      string
    rationale:       string
    contentHash:     string
    checkpointId?:   string
    startedAt:       string
    completedAt:     string
    exitCode:        number
    mutationOutcome: MutationOutcome
    succeeded:       boolean
    diagnostics?:    string
    stdoutRef?:      string
    stderrRef?:      string
  }): Promise<RecoveryRecord> {
    const resp = await request<RecoverWorkflowResponse>(
      this.baseUrl, 'POST', `/v1/control/workflows/${this.id}/recover`,
      params,
    )
    this._state = resp.state as ControlWorkflowState
    return resp.recovery
  }

  async cancel(params: { operatorId: string; reason?: string }): Promise<CancelWorkflowResponse> {
    const resp = await request<CancelWorkflowResponse>(
      this.baseUrl, 'POST', `/v1/control/workflows/${this.id}/cancel`,
      params,
    )
    this._state = resp.state as ControlWorkflowState
    return resp
  }

  evidence(): Promise<ControlEvidenceResponse> {
    return request<ControlEvidenceResponse>(
      this.baseUrl, 'GET', `/v1/control/workflows/${this.id}/evidence`,
    )
  }
}

// ── ArtifactsNamespace ────────────────────────────────────────────────────────

export class ArtifactsNamespace {
  constructor(private readonly baseUrl: string) {}

  async create(params: {
    actionType:  ControlArtifactActionType
    scope:       string
    content:     string
    evidenceRef?: string
  }): Promise<ArtifactHandle> {
    const resp = await request<RegisterArtifactResponse>(
      this.baseUrl, 'POST', '/v1/control/artifacts', params,
    )
    return new ArtifactHandle(this.baseUrl, resp)
  }
}

// ── WorkflowsNamespace ────────────────────────────────────────────────────────

export class WorkflowsNamespace {
  constructor(private readonly baseUrl: string) {}

  async create(artifactId: string, options?: { idempotencyKey?: string }): Promise<WorkflowHandle> {
    const resp = await request<CreateWorkflowResponse>(
      this.baseUrl, 'POST', '/v1/control/workflows',
      { artifactId, ...(options?.idempotencyKey !== undefined && { idempotencyKey: options.idempotencyKey }) },
    )
    return new WorkflowHandle(this.baseUrl, resp)
  }

  async load(workflowId: string): Promise<WorkflowHandle> {
    const resp = await request<GetWorkflowResponse>(
      this.baseUrl, 'GET', `/v1/control/workflows/${workflowId}`,
    )
    return new WorkflowHandle(this.baseUrl, resp)
  }
}

// ── ControlClient ─────────────────────────────────────────────────────────────

export interface ControlClient {
  readonly artifacts: ArtifactsNamespace
  readonly workflows: WorkflowsNamespace
}

export function createControlClient(baseUrl: string): ControlClient {
  const base = baseUrl.replace(/\/$/, '')
  return {
    artifacts: new ArtifactsNamespace(base),
    workflows: new WorkflowsNamespace(base),
  }
}
