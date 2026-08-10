import { randomUUID } from 'node:crypto'
import type {
  VerificationResult,
  VerificationCheck,
} from '@rohinik-org/control-protocol-v1'
import {
  VerificationStatus,
  ControlWorkflowState,
  ControlErrorCode,
} from '@rohinik-org/control-protocol-v1'
import type { ControlWorkflowService } from '@rohinik-org/control-workflow-engine'

// ── Error ─────────────────────────────────────────────────────────────────────

export class VerificationEngineError extends Error {
  constructor(
    readonly code: typeof ControlErrorCode[keyof typeof ControlErrorCode] | 'ALREADY_VERIFIED',
    message: string,
  ) {
    super(message)
    this.name = 'VerificationEngineError'
  }
}

// ── Request type (richer than the HTTP DTO — caller supplies pre-run data) ────

export interface SubmitCheckRequest {
  readonly name:         string
  readonly status:       VerificationStatus | string
  readonly durationMs:   number
  readonly diagnostics?: string
  readonly evidenceRef?: string
}

export interface SubmitVerificationRequest {
  readonly resultId?:        string   // if set, enables idempotent replay
  readonly workflowId:       string
  readonly artifactId:       string
  readonly verifierId:       string
  readonly verifierVersion?: string
  readonly command:          string
  readonly startedAt:        string
  readonly finishedAt:       string
  readonly durationMs:       number
  readonly exitCode:         number
  readonly status:           VerificationStatus | string
  readonly checks:           ReadonlyArray<SubmitCheckRequest>
  readonly diagnostics?:     string
  readonly stdoutRef?:       string
  readonly stderrRef?:       string
  readonly timedOut:         boolean
  readonly evidenceRef?:     string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_DIAGNOSTICS_LENGTH = 500
const VALID_STATUSES: ReadonlySet<string> = new Set(Object.values(VerificationStatus))

// ── VerificationEngine ────────────────────────────────────────────────────────

export class VerificationEngine {
  private readonly results = new Map<string, VerificationResult>()

  constructor(
    private readonly workflows: ControlWorkflowService,
  ) {}

  async submit(req: SubmitVerificationRequest): Promise<VerificationResult> {
    // Idempotent replay: if resultId already submitted, return stored result
    if (req.resultId) {
      const existing = this.results.get(req.resultId)
      if (existing) return existing
    }

    // Input validation
    if (!req.verifierId || req.verifierId.trim() === '') {
      throw new VerificationEngineError(ControlErrorCode.INVALID_REQUEST, 'verifierId is required')
    }
    if (!req.command || req.command.trim() === '') {
      throw new VerificationEngineError(ControlErrorCode.INVALID_REQUEST, 'command is required')
    }

    // Load and guard workflow state
    const wf = await this.workflows.load(req.workflowId)
    if (!wf) {
      throw new VerificationEngineError(ControlErrorCode.WORKFLOW_NOT_FOUND, `Workflow ${req.workflowId} not found`)
    }
    if (wf.state === ControlWorkflowState.VERIFIED) {
      throw new VerificationEngineError('ALREADY_VERIFIED', `Workflow ${req.workflowId} is already VERIFIED; result cannot be overwritten`)
    }
    if (wf.state !== ControlWorkflowState.VERIFYING) {
      throw new VerificationEngineError(ControlErrorCode.INVALID_TRANSITION, `Cannot submit verification for workflow in state "${wf.state}"; must be VERIFYING`)
    }

    // Normalise status: timedOut overrides, unknown status → INCONCLUSIVE
    let status = this._normaliseStatus(req.status, req.timedOut)

    // Build per-check records
    const checks: VerificationCheck[] = req.checks.map(c => ({
      checkId:     randomUUID(),
      name:        c.name,
      status:      this._normaliseStatus(c.status, false) as VerificationStatus,
      durationMs:  c.durationMs,
      ...(c.diagnostics !== undefined && { diagnostics: this._boundDiagnostics(c.diagnostics) }),
      ...(c.evidenceRef !== undefined && { evidenceRef: c.evidenceRef }),
    }))

    const resultId = req.resultId ?? randomUUID()
    const result: VerificationResult = {
      resultId,
      artifactId:      req.artifactId,
      workflowId:      req.workflowId,
      verifierId:      req.verifierId,
      verifierVersion: req.verifierVersion ?? 'unknown',
      command:         req.command,
      startedAt:       req.startedAt,
      finishedAt:      req.finishedAt,
      durationMs:      req.durationMs,
      exitCode:        req.exitCode,
      status,
      checks,
      timedOut:        req.timedOut,
      ...(req.diagnostics  !== undefined && { diagnostics: this._boundDiagnostics(req.diagnostics) }),
      ...(req.stdoutRef    !== undefined && { stdoutRef:   req.stdoutRef }),
      ...(req.stderrRef    !== undefined && { stderrRef:   req.stderrRef }),
      ...(req.evidenceRef  !== undefined && { evidenceRef: req.evidenceRef }),
    }

    // Atomic: persist result, then transition workflow state
    this.results.set(resultId, result)
    await this._transitionFromResult(wf.workflowId, result)

    return result
  }

  async loadResult(resultId: string): Promise<VerificationResult | null> {
    return this.results.get(resultId) ?? null
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _normaliseStatus(raw: VerificationStatus | string, timedOut: boolean): VerificationStatus {
    if (timedOut) return VerificationStatus.INCONCLUSIVE
    if (!VALID_STATUSES.has(raw as string)) return VerificationStatus.INCONCLUSIVE
    return raw as VerificationStatus
  }

  private _boundDiagnostics(s: string): string {
    if (s.length <= MAX_DIAGNOSTICS_LENGTH) return s
    return s.slice(0, MAX_DIAGNOSTICS_LENGTH - 3) + '...'
  }

  private async _transitionFromResult(
    workflowId: string,
    result: VerificationResult,
  ): Promise<void> {
    const nextState = result.status === VerificationStatus.PASSED
      ? ControlWorkflowState.VERIFIED
      : ControlWorkflowState.VERIFICATION_FAILED

    // Store result on workflow then transition — uses forceState for the result
    // attachment, then transition for the state change (atomic within in-memory store)
    await this.workflows.attachVerification(workflowId, result)
    await this.workflows.transition(workflowId, nextState)
  }
}
