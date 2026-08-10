import { createHash, randomUUID } from 'node:crypto'
import type {
  ControlArtifact,
  ApprovalBinding,
  ApprovalDecision,
  ControlArtifactActionType,
  RegisterArtifactRequest,
  RegisterArtifactResponse,
  ApproveArtifactRequest,
  ApproveArtifactResponse,
  DenyArtifactRequest,
  DenyArtifactResponse,
} from '@rohinik-org/control-protocol-v1'
import { ControlErrorCode } from '@rohinik-org/control-protocol-v1'

// ── Content hash ──────────────────────────────────────────────────────────────

export function hashArtifactContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class ControlApprovalError extends Error {
  constructor(
    readonly code: typeof ControlErrorCode[keyof typeof ControlErrorCode],
    message: string,
  ) {
    super(message)
    this.name = 'ControlApprovalError'
  }
}

// ── Denial record (internal — not in public protocol, persisted by store) ────

export interface DenialRecord {
  readonly artifactId: string
  readonly operatorId: string
  readonly rationale?: string
  readonly deniedAt:   string
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface IControlArtifactStore {
  register(req: RegisterArtifactRequest & { evidenceRef?: string }): Promise<ControlArtifact>
  load(artifactId: string): Promise<ControlArtifact | null>
}

export interface IApprovalStore {
  save(decision: ApprovalDecision): Promise<void>
  listByArtifact(artifactId: string): Promise<ApprovalDecision[]>
  getById(approvalId: string): Promise<ApprovalDecision | null>
  saveDenial(record: DenialRecord): Promise<void>
  getDenial(artifactId: string): Promise<DenialRecord | null>
}

// ── In-memory implementations ─────────────────────────────────────────────────

export class InMemoryControlArtifactStore implements IControlArtifactStore {
  private readonly artifacts = new Map<string, ControlArtifact>()

  async register(req: RegisterArtifactRequest & { evidenceRef?: string }): Promise<ControlArtifact> {
    const artifactId   = randomUUID()
    const contentHash  = hashArtifactContent(req.content)
    const artifact: ControlArtifact = {
      artifactId,
      version:     '1',
      actionType:  req.actionType,
      contentHash,
      scope:       req.scope,
      createdAt:   new Date().toISOString(),
      content:     req.content,
      ...(req.evidenceRef !== undefined && { evidenceRef: req.evidenceRef }),
    }
    this.artifacts.set(artifactId, artifact)
    return artifact
  }

  async load(artifactId: string): Promise<ControlArtifact | null> {
    return this.artifacts.get(artifactId) ?? null
  }
}

export class InMemoryApprovalStore implements IApprovalStore {
  private readonly byArtifact = new Map<string, ApprovalDecision[]>()
  private readonly byId       = new Map<string, ApprovalDecision>()
  private readonly denials    = new Map<string, DenialRecord>()

  async save(d: ApprovalDecision): Promise<void> {
    this.byId.set(d.approvalId, d)
    const list = this.byArtifact.get(d.binding.artifactId) ?? []
    this.byArtifact.set(d.binding.artifactId, [...list, d])
  }

  async listByArtifact(artifactId: string): Promise<ApprovalDecision[]> {
    return this.byArtifact.get(artifactId) ?? []
  }

  async getById(approvalId: string): Promise<ApprovalDecision | null> {
    return this.byId.get(approvalId) ?? null
  }

  async saveDenial(record: DenialRecord): Promise<void> {
    this.denials.set(record.artifactId, record)
  }

  async getDenial(artifactId: string): Promise<DenialRecord | null> {
    return this.denials.get(artifactId) ?? null
  }
}

// ── ControlApprovalService ────────────────────────────────────────────────────

export class ControlApprovalService {
  constructor(
    private readonly artifacts: IControlArtifactStore,
    private readonly approvals: IApprovalStore,
  ) {}

  async registerArtifact(req: RegisterArtifactRequest & { evidenceRef?: string }): Promise<ControlArtifact> {
    return this.artifacts.register(req)
  }

  async approve(
    artifactId: string,
    req: Omit<ApproveArtifactRequest, 'version'>,
  ): Promise<ApprovalDecision> {
    const artifact = await this._requireArtifact(artifactId)

    // Verify denial guard before any other checks
    const existingDenial = await this.approvals.getDenial(artifactId)
    if (existingDenial) {
      throw new ControlApprovalError(
        ControlErrorCode.ALREADY_APPROVED,
        `Artifact ${artifactId} has been denied by ${existingDenial.operatorId} and cannot be approved`,
      )
    }

    // Validate content hash
    if (req.contentHash !== artifact.contentHash) {
      throw new ControlApprovalError(
        ControlErrorCode.HASH_MISMATCH,
        `contentHash mismatch: provided ${req.contentHash}, stored ${artifact.contentHash}`,
      )
    }

    // Validate scope binding
    if (req.scope !== artifact.scope) {
      throw new ControlApprovalError(
        ControlErrorCode.APPROVAL_BINDING_INVALID,
        `Scope mismatch: approval requested for "${req.scope}" but artifact is scoped to "${artifact.scope}"`,
      )
    }

    // Validate actionType binding
    if (req.actionType !== artifact.actionType) {
      throw new ControlApprovalError(
        ControlErrorCode.APPROVAL_BINDING_INVALID,
        `ActionType mismatch: approval requested for "${req.actionType}" but artifact is "${artifact.actionType}"`,
      )
    }

    const binding: ApprovalBinding = {
      artifactId:  artifact.artifactId,
      version:     artifact.version,
      contentHash: artifact.contentHash,
      actionType:  artifact.actionType,
      scope:       artifact.scope,
    }

    const decision: ApprovalDecision = {
      approvalId:  randomUUID(),
      binding,
      approvedAt:  new Date().toISOString(),
      operatorId:  req.operatorId,
      ...(req.rationale  !== undefined && { rationale:  req.rationale }),
      ...(req.expiresAt  !== undefined && { expiresAt:  req.expiresAt }),
    }

    await this.approvals.save(decision)
    return decision
  }

  async deny(
    artifactId: string,
    req: DenyArtifactRequest,
  ): Promise<DenialRecord> {
    await this._requireArtifact(artifactId)

    const record: DenialRecord = {
      artifactId,
      operatorId: req.operatorId,
      ...(req.rationale !== undefined && { rationale: req.rationale }),
      deniedAt: new Date().toISOString(),
    }
    await this.approvals.saveDenial(record)
    return record
  }

  async validateApproval(
    approvalId: string,
    binding: ApprovalBinding,
  ): Promise<true> {
    const decision = await this.approvals.getById(approvalId)
    if (!decision) {
      throw new ControlApprovalError(
        ControlErrorCode.APPROVAL_NOT_FOUND,
        `Approval ${approvalId} not found`,
      )
    }

    // Expiry check
    if (decision.expiresAt && new Date(decision.expiresAt) < new Date()) {
      throw new ControlApprovalError(
        ControlErrorCode.APPROVAL_EXPIRED,
        `Approval ${approvalId} expired at ${decision.expiresAt}`,
      )
    }

    // Binding field-by-field validation
    const b = decision.binding
    if (binding.contentHash !== b.contentHash) {
      throw new ControlApprovalError(
        ControlErrorCode.HASH_MISMATCH,
        `Content hash mismatch: approval bound to ${b.contentHash}, presented ${binding.contentHash}`,
      )
    }
    if (binding.scope !== b.scope) {
      throw new ControlApprovalError(
        ControlErrorCode.APPROVAL_BINDING_INVALID,
        `Scope mismatch: approval bound to "${b.scope}", presented "${binding.scope}"`,
      )
    }
    if (binding.actionType !== b.actionType) {
      throw new ControlApprovalError(
        ControlErrorCode.APPROVAL_BINDING_INVALID,
        `ActionType mismatch: approval bound to "${b.actionType}", presented "${binding.actionType}"`,
      )
    }
    if (binding.artifactId !== b.artifactId) {
      throw new ControlApprovalError(
        ControlErrorCode.APPROVAL_BINDING_INVALID,
        `ArtifactId mismatch`,
      )
    }

    return true
  }

  async listApprovals(artifactId: string): Promise<ApprovalDecision[]> {
    return this.approvals.listByArtifact(artifactId)
  }

  async getApprovalById(approvalId: string): Promise<ApprovalDecision | null> {
    return this.approvals.getById(approvalId)
  }

  async getDenial(artifactId: string): Promise<DenialRecord | null> {
    return this.approvals.getDenial(artifactId)
  }

  private async _requireArtifact(artifactId: string): Promise<ControlArtifact> {
    const artifact = await this.artifacts.load(artifactId)
    if (!artifact) {
      throw new ControlApprovalError(
        ControlErrorCode.ARTIFACT_NOT_FOUND,
        `Artifact ${artifactId} not found`,
      )
    }
    return artifact
  }
}
