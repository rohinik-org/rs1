import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { RuntimeHost } from '@rohinik-org/runtime'
import { DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner-ir'
import { DEFAULT_ACQUISITION_POLICY } from '@rohinik-org/capability-acquisition'
import { DEFAULT_BUDGET } from '@rohinik-org/kernel'
import type { ExecutionRequest } from '@rohinik-org/execution-ir'
import {
  InMemoryAsyncExecutionRepository,
  createAsyncExecutionRecord,
  type IAsyncExecutionRepository,
} from '@rohinik-org/async-execution-repository'
import {
  EXECUTION_PROTOCOL_VERSION,
  PublicErrorCode,
  type SubmitExecutionRequest,
  type PublicErrorEnvelope,
} from '@rohinik-org/execution-protocol-v1'
import { toPublicState } from '../execution-protocol-mapper.js'

export { createAsyncExecutionRecord }

// One shared repository per server instance.
// ponytail: module-level InMemory store sufficient for single-process slice; inject persistent store at Task 6.
export const asyncRepo: IAsyncExecutionRepository = new InMemoryAsyncExecutionRepository()

function makeError(
  code: PublicErrorCode,
  message: string,
  executionId?: string,
): PublicErrorEnvelope {
  return {
    code,
    message,
    ...(executionId !== undefined ? { executionId } : {}),
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
  }
}

export function registerAsyncExecutionRoutes(app: FastifyInstance, host: RuntimeHost): void {

  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  // ── POST /v1/executions ─────────────────────────────────────────────────────
  // Returns 202 Accepted before execution completes.
  // Idempotency: same idempotencyKey + matching content → return existing record.
  app.post<{ Body: SubmitExecutionRequest }>('/v1/executions', async (req, reply) => {
    if (!ready()) {
      reply.code(503).send(makeError(PublicErrorCode.INTERNAL_ERROR, 'Runtime not ready'))
      return
    }

    const body = req.body
    if (!body?.content || !body?.contentType) {
      reply.code(400).send(makeError(PublicErrorCode.INVALID_REQUEST, 'content and contentType are required'))
      return
    }

    // Idempotency check
    if (body.idempotencyKey) {
      const existing = await asyncRepo.findByIdempotencyKey(body.idempotencyKey)
      if (existing !== undefined) {
        // Conflict: same key but different content
        if (
          existing.requestSnapshot.content !== body.content ||
          existing.requestSnapshot.contentType !== body.contentType
        ) {
          reply.code(409).send(makeError(
            PublicErrorCode.IDEMPOTENCY_CONFLICT,
            `Idempotency key '${body.idempotencyKey}' already used with different request content`,
            existing.executionId,
          ))
          return
        }
        // Hit: same key + same content → return idempotent response
        reply.code(202).send({
          executionId:     existing.executionId,
          idempotencyKey:  existing.idempotencyKey,
          state:           existing.state,
          protocolVersion: EXECUTION_PROTOCOL_VERSION,
          submittedAt:     existing.submittedAt,
          idempotent:      true,
        })
        return
      }
    }

    // Create async record — QUEUED — save before firing execution
    const record = createAsyncExecutionRecord(body)
    await asyncRepo.save(record)

    // Fire-and-forget: plan + execute in background, update record through lifecycle
    _runInBackground(host, record.executionId, body).catch(() => {
      // Background errors are swallowed here; the record will reflect FAILED state.
      // Callers poll GET /v1/executions/:id for final status.
    })

    reply.code(202).send({
      executionId:     record.executionId,
      idempotencyKey:  record.idempotencyKey,
      state:           record.state,
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      submittedAt:     record.submittedAt,
      idempotent:      false,
    })
  })

  // ── GET /v1/executions/:executionId ─────────────────────────────────────────
  app.get<{ Params: { executionId: string } }>('/v1/executions/:executionId', async (req, reply) => {
    const { executionId } = req.params
    const record = await asyncRepo.findById(executionId)
    if (!record) {
      reply.code(404).send(makeError(PublicErrorCode.EXECUTION_NOT_FOUND, `Execution ${executionId} not found`, executionId))
      return
    }
    reply.send({
      executionId:     record.executionId,
      state:           record.state,
      protocolVersion: record.protocolVersion,
      submittedAt:     record.submittedAt,
      startedAt:       record.startedAt,
      completedAt:     record.completedAt,
      cancelledAt:     record.cancelledAt,
      terminal:        ['COMPLETED', 'FAILED', 'CANCELLED'].includes(record.state),
    })
  })

  // ── GET /v1/executions/:executionId/result ──────────────────────────────────
  app.get<{ Params: { executionId: string } }>('/v1/executions/:executionId/result', async (req, reply) => {
    const { executionId } = req.params
    const record = await asyncRepo.findById(executionId)
    if (!record) {
      reply.code(404).send(makeError(PublicErrorCode.EXECUTION_NOT_FOUND, `Execution ${executionId} not found`, executionId))
      return
    }
    if (!record.result || !['COMPLETED', 'FAILED', 'CANCELLED'].includes(record.state)) {
      reply.code(409).send(makeError(PublicErrorCode.RESULT_NOT_READY, `Execution ${executionId} is not yet terminal (state: ${record.state})`, executionId))
      return
    }
    reply.send({
      executionId:     record.executionId,
      state:           record.state,
      output:          record.result.output,
      totalDurationMs: record.result.totalDurationMs,
      completedAt:     record.result.completedAt,
    })
  })

  // ── POST /v1/executions/:executionId/cancel ──────────────────────────────────
  app.post<{ Params: { executionId: string } }>('/v1/executions/:executionId/cancel', async (req, reply) => {
    const { executionId } = req.params
    const record = await asyncRepo.findById(executionId)
    if (!record) {
      reply.code(404).send(makeError(PublicErrorCode.EXECUTION_NOT_FOUND, `Execution ${executionId} not found`, executionId))
      return
    }

    const terminalStates = ['COMPLETED', 'FAILED', 'CANCELLED'] as const
    if ((terminalStates as readonly string[]).includes(record.state)) {
      // Already terminal — cancel is a no-op; report accepted=false
      reply.send({
        executionId,
        state:          record.state,
        cancelAccepted: false,
      })
      return
    }

    // Signal cancellation via supervisor (uses internal sessionId if known)
    if (record.internalSessionId !== null) {
      await host.executionSupervisor.cancel(record.internalSessionId)
    }

    // Optimistically mark CANCELLING; the background loop will write CANCELLED when it stops
    await asyncRepo.update(executionId, { state: 'CANCELLING' })

    reply.send({
      executionId,
      state:          'CANCELLING',
      cancelAccepted: true,
    })
  })

  // ── GET /v1/executions/:executionId/evidence ─────────────────────────────────
  app.get<{ Params: { executionId: string } }>('/v1/executions/:executionId/evidence', async (req, reply) => {
    const { executionId } = req.params
    const record = await asyncRepo.findById(executionId)
    if (!record) {
      reply.code(404).send(makeError(PublicErrorCode.EXECUTION_NOT_FOUND, `Execution ${executionId} not found`, executionId))
      return
    }
    reply.send({
      executionId,
      entries: record.evidenceEntries,
    })
  })
}

// ── Background execution pipeline ────────────────────────────────────────────
//
// Called fire-and-forget from POST /v1/executions.
// Drives the record through QUEUED → ADMITTED → RUNNING → terminal.
// Never throws to caller — all errors are absorbed and written to the record.

async function _runInBackground(
  host: RuntimeHost,
  executionId: string,
  body: SubmitExecutionRequest,
): Promise<void> {
  try {
    // QUEUED → ADMITTED (planning phase)
    await asyncRepo.update(executionId, { state: 'ADMITTED' })

    // Build planning request (mirrors execution.ts route pattern)
    const raw = body.content
    const workingContext = await host.contextManager.build({
      intentId:              randomUUID(),
      schemaVersion:         '1.0' as const,
      rawInput:              raw,
      concepts:              body.context?.concepts as string[] ?? raw.split(/\s+/).filter(Boolean),
      preferredSkills:       body.context?.preferredSkills as string[] ?? [],
      constraints:           {},
      translatedBy:          'http',
      translationConfidence: 1,
      unresolvedTerms:       [],
    })

    const predictions = await host.predictionManager.predict(workingContext)
    const planRequest = {
      requestId:        randomUUID(),
      context:          workingContext,
      predictions,
      executionBudget:  DEFAULT_BUDGET,
      acquisitionPolicy: DEFAULT_ACQUISITION_POLICY,
      planningPolicy:   (body.constraints as Record<string, unknown> | undefined)?.planningPolicy as never ?? DEFAULT_PLANNING_POLICY,
    }
    const decision = await host.planner.plan(planRequest)

    const execRequest: ExecutionRequest = {
      executionId,
      decision,
      requestedAt: new Date(),
      cancellable: true,
    }

    // ADMITTED → RUNNING — write sessionId once supervisor starts
    // Supervisor assigns sessionId internally; we learn it from the result.
    // Pre-mark RUNNING so status polls see it during execution.
    await asyncRepo.update(executionId, {
      state:     'RUNNING',
      startedAt: new Date().toISOString(),
    })

    // Execute — blocks until terminal (steps run sequentially inside supervisor)
    const result = await host.executionSupervisor.execute(execRequest)

    // Update sessionId index (needed for cancel correlation on future runs)
    await asyncRepo.update(executionId, { internalSessionId: result.sessionId })

    // Map final internal state to public state
    const finalPublicState = toPublicState(result.finalState)
    const now = new Date().toISOString()

    await asyncRepo.update(executionId, {
      state:       finalPublicState,
      completedAt: finalPublicState === 'CANCELLED' ? undefined : now,
      cancelledAt: finalPublicState === 'CANCELLED' ? now : undefined,
      result: {
        output:          result.stepRecords.at(-1)?.outcome?.result ?? null,
        totalDurationMs: result.totalDurationMs,
        completedAt:     now,
      },
    })

    // Seed evidence from step records
    await asyncRepo.appendEvidence(executionId, result.stepRecords.map(sr => ({
      kind:       `step:${sr.state.toLowerCase()}`,
      stepId:     sr.skillId,
      detail:     { attemptCount: sr.attemptCount, outcome: sr.outcome?.status ?? null },
      recordedAt: (sr.completedAt ?? new Date()).toISOString(),
    })))

  } catch (err) {
    // Absorb — write FAILED to record so callers see terminal state
    const now = new Date().toISOString()
    await asyncRepo.update(executionId, {
      state:       'FAILED',
      completedAt: now,
      result: {
        output:          null,
        totalDurationMs: 0,
        completedAt:     now,
      },
    }).catch(() => { /* record may already be terminal */ })
  }
}
