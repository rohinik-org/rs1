import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  ControlApprovalService,
  InMemoryControlArtifactStore,
  InMemoryApprovalStore,
  ControlApprovalError,
} from '@rohinik-org/control-approval-store'
import {
  ControlWorkflowService,
  InMemoryWorkflowRepository,
  InMemoryCheckpointRepository,
  ControlWorkflowError,
} from '@rohinik-org/control-workflow-engine'
import {
  VerificationEngine,
  VerificationEngineError,
} from '@rohinik-org/control-verification-engine'
import {
  RecoveryEngine,
  RecoveryEngineError,
} from '@rohinik-org/control-recovery-engine'
import {
  ControlWorkflowState,
  ControlErrorCode,
  MutationOutcome,
  type PreMutationCheckpoint,
  type ApplyRecord,
  type ControlEvidenceEvent,
} from '@rohinik-org/control-protocol-v1'

// ── Module-level services (single-process in-memory slice) ────────────────────
// ponytail: module-level stores match the server's existing pattern; replace with
// injected/persistent stores when T6 is wired into RuntimeHost

const artifactStore  = new InMemoryControlArtifactStore()
const approvalStore  = new InMemoryApprovalStore()
export const approvalSvc  = new ControlApprovalService(artifactStore, approvalStore)

const workflowRepo   = new InMemoryWorkflowRepository()
const checkpointRepo = new InMemoryCheckpointRepository()
export const workflowSvc  = new ControlWorkflowService(workflowRepo, checkpointRepo, approvalSvc)

export const verificationEngine = new VerificationEngine(workflowSvc)
export const recoveryEngine     = new RecoveryEngine(workflowSvc)

// ── Evidence store (lightweight per-workflow event log) ───────────────────────

interface EvidenceEntry {
  workflowId: string
  event: ControlEvidenceEvent
}

const evidenceLog: EvidenceEntry[] = []

function appendEvidence(workflowId: string, kind: string, detail?: unknown, fromState?: ControlWorkflowState, toState?: ControlWorkflowState, operatorId?: string): void {
  evidenceLog.push({
    workflowId,
    event: {
      eventId:    randomUUID(),
      kind,
      occurredAt: new Date().toISOString(),
      ...(fromState  !== undefined && { fromState }),
      ...(toState    !== undefined && { toState }),
      ...(operatorId !== undefined && { operatorId }),
      ...(detail     !== undefined && { detail }),
    },
  })
}

function getEvidence(workflowId: string): ControlEvidenceEvent[] {
  return evidenceLog.filter(e => e.workflowId === workflowId).map(e => e.event)
}

// ── Error → HTTP code mapping ─────────────────────────────────────────────────

function errorCode(err: unknown): number {
  const code = (err as any)?.code
  if (!code) return 500
  switch (code) {
    case ControlErrorCode.ARTIFACT_NOT_FOUND:
    case ControlErrorCode.WORKFLOW_NOT_FOUND:
    case ControlErrorCode.CHECKPOINT_NOT_FOUND:
    case 'DIRECTIVE_NOT_FOUND':        return 404
    case ControlErrorCode.APPROVAL_NOT_FOUND: return 409
    case ControlErrorCode.INVALID_REQUEST:
    case ControlErrorCode.CHECKPOINT_REQUIRED:
    case ControlErrorCode.VERIFICATION_REQUIRED: return 400
    case ControlErrorCode.HASH_MISMATCH:
    case ControlErrorCode.APPROVAL_BINDING_INVALID:
    case ControlErrorCode.APPROVAL_EXPIRED:
    case ControlErrorCode.INVALID_TRANSITION:
    case ControlErrorCode.RECOVERY_UNSAFE:
    case 'ALREADY_VERIFIED':           return 409
    case ControlErrorCode.ALREADY_APPROVED: return 409
    default:                           return 500
  }
}

function isControlError(err: unknown): err is { code: string; message: string } {
  return (
    err instanceof ControlApprovalError ||
    err instanceof ControlWorkflowError ||
    err instanceof VerificationEngineError ||
    err instanceof RecoveryEngineError
  )
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerControlRoutes(app: FastifyInstance): void {

  // ── 1. POST /v1/control/artifacts ────────────────────────────────────────────
  app.post<{ Body: { actionType: string; scope: string; content: string; evidenceRef?: string } }>(
    '/v1/control/artifacts',
    async (req, reply) => {
      const { actionType, scope, content, evidenceRef } = req.body ?? {}
      if (!actionType || !scope || !content) {
        reply.code(400).send({ error: 'actionType, scope, and content are required' }); return
      }
      try {
        const artifact = await approvalSvc.registerArtifact({
          actionType: actionType as any,
          scope,
          content,
          ...(evidenceRef !== undefined && { evidenceRef }),
        })
        reply.code(201).send({
          artifactId:  artifact.artifactId,
          version:     artifact.version,
          contentHash: artifact.contentHash,
          actionType:  artifact.actionType,
          scope:       artifact.scope,
          createdAt:   artifact.createdAt,
        })
      } catch (err) {
        if (isControlError(err)) { reply.code(errorCode(err)).send({ code: err.code, message: err.message }); return }
        throw err
      }
    }
  )

  // ── 2. POST /v1/control/artifacts/:id/approve ────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { contentHash: string; actionType: string; scope: string; operatorId: string; rationale?: string; expiresAt?: string }
  }>('/v1/control/artifacts/:id/approve', async (req, reply) => {
    const { contentHash, actionType, scope, operatorId, rationale, expiresAt } = req.body ?? {}
    if (!contentHash || !actionType || !scope || !operatorId) {
      reply.code(400).send({ error: 'contentHash, actionType, scope, and operatorId are required' }); return
    }
    try {
      const decision = await approvalSvc.approve(req.params.id, {
        contentHash,
        actionType: actionType as any,
        scope,
        operatorId,
        ...(rationale !== undefined && { rationale }),
        ...(expiresAt !== undefined && { expiresAt }),
      })
      reply.code(200).send({
        approvalId:  decision.approvalId,
        artifactId:  decision.binding.artifactId,
        binding:     decision.binding,
        approvedAt:  decision.approvedAt,
      })
    } catch (err) {
      if (isControlError(err)) { reply.code(errorCode(err)).send({ code: err.code, message: err.message }); return }
      throw err
    }
  })

  // ── 3. POST /v1/control/artifacts/:id/deny ───────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { operatorId: string; rationale?: string }
  }>('/v1/control/artifacts/:id/deny', async (req, reply) => {
    const { operatorId, rationale } = req.body ?? {}
    if (!operatorId) {
      reply.code(400).send({ error: 'operatorId is required' }); return
    }
    try {
      const denial = await approvalSvc.deny(req.params.id, {
        operatorId,
        ...(rationale !== undefined && { rationale }),
      })
      reply.code(200).send({ ok: true, artifactId: denial.artifactId, deniedAt: denial.deniedAt })
    } catch (err) {
      if (isControlError(err)) { reply.code(errorCode(err)).send({ code: err.code, message: err.message }); return }
      throw err
    }
  })

  // ── 4. POST /v1/control/workflows ────────────────────────────────────────────
  app.post<{ Body: { artifactId: string; idempotencyKey?: string } }>(
    '/v1/control/workflows',
    async (req, reply) => {
      const { artifactId, idempotencyKey } = req.body ?? {}
      if (!artifactId) {
        reply.code(400).send({ error: 'artifactId is required' }); return
      }
      try {
        const wf = await workflowSvc.create(artifactId, { idempotencyKey })
        appendEvidence(wf.workflowId, 'workflow-created', { artifactId }, undefined, ControlWorkflowState.DRAFT)
        reply.code(201).send({
          workflowId: wf.workflowId,
          artifactId: wf.artifactId,
          state:      wf.state,
          createdAt:  wf.createdAt,
        })
      } catch (err) {
        if (isControlError(err)) { reply.code(errorCode(err)).send({ code: err.code, message: err.message }); return }
        throw err
      }
    }
  )

  // ── 5. GET /v1/control/workflows/:id ─────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/v1/control/workflows/:id', async (req, reply) => {
    const wf = await workflowSvc.load(req.params.id)
    if (!wf) { reply.code(404).send({ error: 'not-found' }); return }
    reply.send(wf)
  })

  // ── 6. POST /v1/control/workflows/:id/apply ──────────────────────────────────
  // Drives DRAFT→AWAITING_APPROVAL→APPROVED then APPROVED→APPLYING with checkpoint.
  // Caller provides: approvalId, checkpoint, applyRecord (simulated apply result).
  // ponytail: actual git apply execution is repo-engineer's responsibility (T9);
  // this route accepts the caller-supplied outcome (MutationOutcome) and record.
  app.post<{
    Params: { id: string }
    Body: {
      approvalId:    string
      checkpoint:    PreMutationCheckpoint
      applyRecord:   ApplyRecord
    }
  }>('/v1/control/workflows/:id/apply', async (req, reply) => {
    const { approvalId, checkpoint, applyRecord } = req.body ?? {}
    if (!approvalId || !checkpoint || !applyRecord) {
      reply.code(400).send({ error: 'approvalId, checkpoint, and applyRecord are required' }); return
    }
    try {
      const wf = await workflowSvc.load(req.params.id)
      if (!wf) { reply.code(404).send({ error: 'not-found' }); return }

      // Drive state machine: require APPROVED state
      if (wf.state === ControlWorkflowState.DRAFT) {
        await workflowSvc.transition(req.params.id, ControlWorkflowState.AWAITING_APPROVAL)
        await workflowSvc.approve(req.params.id, approvalId)
      } else if (wf.state === ControlWorkflowState.AWAITING_APPROVAL) {
        await workflowSvc.approve(req.params.id, approvalId)
      }

      await workflowSvc.saveCheckpoint(checkpoint)
      await workflowSvc.beginApply(req.params.id, checkpoint.checkpointId)
      await workflowSvc.attachApplyRecord(req.params.id, applyRecord)

      // Determine next state from mutation outcome
      const outcome = applyRecord.mutationOutcome
      let nextState: ControlWorkflowState
      if (outcome === MutationOutcome.APPLIED || outcome === MutationOutcome.NO_MUTATION) {
        nextState = ControlWorkflowState.APPLIED
      } else {
        nextState = ControlWorkflowState.RECOVERY_REQUIRED
      }
      await workflowSvc.transition(req.params.id, nextState)

      appendEvidence(req.params.id, 'apply-completed', { mutationOutcome: outcome, checkpointId: checkpoint.checkpointId },
        ControlWorkflowState.APPLYING, nextState)

      const updated = await workflowSvc.load(req.params.id)
      reply.code(200).send({
        workflowId:    updated!.workflowId,
        state:         updated!.state,
        applyRecord,
        checkpointId:  checkpoint.checkpointId,
      })
    } catch (err) {
      if (isControlError(err)) { reply.code(errorCode(err)).send({ code: err.code, message: err.message }); return }
      throw err
    }
  })

  // ── 7. POST /v1/control/workflows/:id/verify ─────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: {
      verifierId?:      string
      verifierVersion?: string
      command:          string
      startedAt:        string
      finishedAt:       string
      durationMs:       number
      exitCode:         number
      status:           string
      checks?:          Array<{ name: string; status: string; durationMs: number; diagnostics?: string }>
      timedOut?:        boolean
      diagnostics?:     string
      stdoutRef?:       string
      stderrRef?:       string
    }
  }>('/v1/control/workflows/:id/verify', async (req, reply) => {
    const body = req.body ?? {}
    if (!body.command) {
      reply.code(400).send({ error: 'command is required' }); return
    }
    try {
      const wf = await workflowSvc.load(req.params.id)
      if (!wf) { reply.code(404).send({ error: 'not-found' }); return }

      // Drive APPLIED → VERIFYING if needed
      if (wf.state === ControlWorkflowState.APPLIED) {
        await workflowSvc.transition(req.params.id, ControlWorkflowState.VERIFYING)
      }

      const result = await verificationEngine.submit({
        workflowId:      req.params.id,
        artifactId:      wf.artifactId,
        verifierId:      body.verifierId ?? 'http-caller',
        verifierVersion: body.verifierVersion ?? 'unknown',
        command:         body.command,
        startedAt:       body.startedAt,
        finishedAt:      body.finishedAt,
        durationMs:      body.durationMs ?? 0,
        exitCode:        body.exitCode ?? 0,
        status:          body.status as any,
        checks:          body.checks ?? [],
        timedOut:        body.timedOut ?? false,
        ...(body.diagnostics !== undefined && { diagnostics: body.diagnostics }),
        ...(body.stdoutRef   !== undefined && { stdoutRef:   body.stdoutRef }),
        ...(body.stderrRef   !== undefined && { stderrRef:   body.stderrRef }),
      })

      const updated = await workflowSvc.load(req.params.id)
      appendEvidence(req.params.id, 'verification-completed', { status: result.status, resultId: result.resultId },
        ControlWorkflowState.VERIFYING, updated!.state)

      reply.code(200).send({
        workflowId:   req.params.id,
        state:        updated!.state,
        verification: result,
      })
    } catch (err) {
      if (isControlError(err)) { reply.code(errorCode(err)).send({ code: err.code, message: err.message }); return }
      throw err
    }
  })

  // ── 8. POST /v1/control/workflows/:id/recover ────────────────────────────────
  // Two-step: issue directive then execute.
  // Caller provides strategy + execution result in one call (HTTP convenience wrapper).
  app.post<{
    Params: { id: string }
    Body: {
      strategy:        string
      operatorId:      string
      rationale:       string
      contentHash:     string
      checkpointId?:   string
      // Execution result fields
      startedAt:       string
      completedAt:     string
      exitCode:        number
      mutationOutcome: string
      succeeded:       boolean
      diagnostics?:    string
      stdoutRef?:      string
      stderrRef?:      string
    }
  }>('/v1/control/workflows/:id/recover', async (req, reply) => {
    const body = req.body ?? {}
    if (!body.strategy || !body.operatorId || !body.rationale || !body.contentHash) {
      reply.code(400).send({ error: 'strategy, operatorId, rationale, and contentHash are required' }); return
    }
    try {
      const wf = await workflowSvc.load(req.params.id)
      if (!wf) { reply.code(404).send({ error: 'not-found' }); return }

      // Transition VERIFICATION_FAILED → RECOVERY_REQUIRED if needed
      if (wf.state === ControlWorkflowState.VERIFICATION_FAILED) {
        await workflowSvc.transition(req.params.id, ControlWorkflowState.RECOVERY_REQUIRED)
      }

      const directive = await recoveryEngine.issueDirective({
        workflowId:   req.params.id,
        artifactId:   wf.artifactId,
        contentHash:  body.contentHash,
        strategy:     body.strategy as any,
        operatorId:   body.operatorId,
        rationale:    body.rationale,
        ...(body.checkpointId !== undefined && { checkpointId: body.checkpointId }),
      })

      const record = await recoveryEngine.executeRecovery({
        workflowId:      req.params.id,
        directiveId:     directive.directiveId,
        startedAt:       body.startedAt,
        completedAt:     body.completedAt,
        exitCode:        body.exitCode ?? 0,
        mutationOutcome: body.mutationOutcome as any,
        succeeded:       body.succeeded,
        ...(body.diagnostics !== undefined && { diagnostics: body.diagnostics }),
        ...(body.stdoutRef   !== undefined && { stdoutRef:   body.stdoutRef }),
        ...(body.stderrRef   !== undefined && { stderrRef:   body.stderrRef }),
      })

      const updated = await workflowSvc.load(req.params.id)
      appendEvidence(req.params.id, 'recovery-completed',
        { strategy: directive.strategy, succeeded: record.succeeded, directiveId: directive.directiveId },
        ControlWorkflowState.RECOVERING, updated!.state, body.operatorId)

      reply.code(200).send({
        workflowId: req.params.id,
        state:      updated!.state,
        recovery:   record,
      })
    } catch (err) {
      if (isControlError(err)) { reply.code(errorCode(err)).send({ code: err.code, message: err.message }); return }
      throw err
    }
  })

  // ── 9. POST /v1/control/workflows/:id/cancel ─────────────────────────────────
  app.post<{
    Params: { id: string }
    Body: { operatorId: string; reason?: string }
  }>('/v1/control/workflows/:id/cancel', async (req, reply) => {
    const { operatorId, reason } = req.body ?? {}
    if (!operatorId) {
      reply.code(400).send({ error: 'operatorId is required' }); return
    }
    try {
      const wf = await workflowSvc.load(req.params.id)
      if (!wf) { reply.code(404).send({ error: 'not-found' }); return }

      await workflowSvc.transition(req.params.id, ControlWorkflowState.CANCELLED)
      appendEvidence(req.params.id, 'workflow-cancelled', { reason }, wf.state, ControlWorkflowState.CANCELLED, operatorId)

      reply.code(200).send({
        workflowId:  req.params.id,
        state:       ControlWorkflowState.CANCELLED,
        cancelledAt: new Date().toISOString(),
      })
    } catch (err) {
      if (isControlError(err)) { reply.code(errorCode(err)).send({ code: err.code, message: err.message }); return }
      throw err
    }
  })

  // ── 10. GET /v1/control/workflows/:id/evidence ───────────────────────────────
  app.get<{ Params: { id: string } }>('/v1/control/workflows/:id/evidence', async (req, reply) => {
    const wf = await workflowSvc.load(req.params.id)
    if (!wf) { reply.code(404).send({ error: 'not-found' }); return }

    reply.send({
      workflowId: wf.workflowId,
      artifactId: wf.artifactId,
      state:      wf.state,
      events:     getEvidence(wf.workflowId),
    })
  })
}
