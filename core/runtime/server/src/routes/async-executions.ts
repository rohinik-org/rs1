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
  InMemoryAsyncExecutionEventStore,
  type IAsyncExecutionEventStore,
} from '@rohinik-org/async-execution-event-store'
import {
  EXECUTION_PROTOCOL_VERSION,
  PublicErrorCode,
  PublicEventKind,
  ValidationOutcome,
  type SubmitExecutionRequest,
  type PublicErrorEnvelope,
  type ValidationResult,
} from '@rohinik-org/execution-protocol-v1'
import { SchemaRegistryError } from '@rohinik-org/schema-registry'
import { toPublicState } from '../execution-protocol-mapper.js'
import { schemaRegistry } from './schemas.js'

export { createAsyncExecutionRecord }

// One shared repository per server instance.
// ponytail: module-level InMemory store sufficient for single-process slice; inject persistent store at Task 6.
export const asyncRepo: IAsyncExecutionRepository = new InMemoryAsyncExecutionRepository()
export const eventStore: IAsyncExecutionEventStore = new InMemoryAsyncExecutionEventStore()

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

    // Schema admission: if outputSchemaRef supplied, verify schema exists and hash matches
    if (body.outputSchemaRef) {
      const ref = body.outputSchemaRef
      try {
        const stored = await schemaRegistry.get(ref.schemaId, ref.version)
        if (stored.semanticHash !== ref.semanticHash) {
          reply.code(400).send(makeError(PublicErrorCode.SCHEMA_HASH_MISMATCH,
            `Schema ${ref.schemaId}@${ref.version} hash mismatch: expected ${ref.semanticHash}, stored ${stored.semanticHash}`))
          return
        }
      } catch (err) {
        if (err instanceof SchemaRegistryError && err.code === 'SCHEMA_NOT_FOUND') {
          reply.code(400).send(makeError(PublicErrorCode.SCHEMA_NOT_FOUND,
            `Schema ${ref.schemaId}@${ref.version} not registered`))
          return
        }
        throw err
      }
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
      validationResult: record.validationResult,
    })
  })

  // ── POST /v1/executions/:executionId/cancel ──────────────────────────────────
  app.post<{ Params: { executionId: string }; Body?: { reason?: string } }>('/v1/executions/:executionId/cancel', async (req, reply) => {
    const { executionId } = req.params
    const reason = req.body?.reason
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

    // Durable cancellation acceptance — write CANCELLING to repo first.
    // This is the authority point: if this commits before terminal completion,
    // cancellation wins the race. Background loop checks CANCELLING state.
    await asyncRepo.update(executionId, { state: 'CANCELLING' })

    // Publish CANCELLATION_REQUESTED — this signals intent, NOT terminal outcome.
    // EXECUTION_CANCELLED is published only when the execution actually terminates.
    await eventStore.append({
      executionId,
      kind: PublicEventKind.CANCELLATION_REQUESTED,
      payload: { requestedAt: new Date().toISOString(), ...(reason ? { reason } : {}) },
    }).catch(() => { /* swallow if store already terminal (race) */ })

    // Signal supervisor if session already started (sessionId already written to repo)
    if (record.internalSessionId !== null) {
      await host.executionSupervisor.cancel(record.internalSessionId)
    }
    // If internalSessionId is null, the background loop will detect CANCELLING
    // state before starting the supervisor and short-circuit to CANCELLED.

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
//
// Race rule: if asyncRepo has CANCELLING state when we check before execute(),
// cancellation wins. If provider completes first (execute() returns with
// COMPLETED/FAILED state), completion wins — a subsequent cancel returns false.

async function _runInBackground(
  host: RuntimeHost,
  executionId: string,
  body: SubmitExecutionRequest,
): Promise<void> {
  const submittedAt = new Date().toISOString()

  try {
    // Publish EXECUTION_ACCEPTED (record already saved as QUEUED)
    await eventStore.append({
      executionId,
      kind: PublicEventKind.EXECUTION_ACCEPTED,
      payload: { submittedAt },
    })

    // QUEUED → ADMITTED (planning phase)
    await asyncRepo.update(executionId, { state: 'ADMITTED' })
    await eventStore.append({
      executionId,
      kind: PublicEventKind.EXECUTION_ADMITTED,
      payload: { admittedAt: new Date().toISOString() },
    })

    // Build planning request
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

    // Pre-allocate sessionId and write to repo BEFORE calling execute().
    // This closes the sessionId gap: if cancel arrives after this point,
    // it can signal the supervisor directly via the correct sessionId.
    const preAllocatedSessionId = randomUUID()
    await asyncRepo.update(executionId, { internalSessionId: preAllocatedSessionId })

    // Pre-execution cancel check: if CANCELLING was durably committed before
    // we reach here, cancel wins — skip execution entirely.
    const checkRecord = await asyncRepo.findById(executionId)
    if (checkRecord?.state === 'CANCELLING') {
      const now = new Date().toISOString()
      await asyncRepo.update(executionId, {
        state:      'CANCELLED',
        cancelledAt: now,
        result: { output: null, totalDurationMs: 0, completedAt: now },
      })
      await eventStore.append({
        executionId,
        kind: PublicEventKind.EXECUTION_CANCELLED,
        payload: { cancelledAt: now },
      }).catch(() => { /* store may already be terminal */ })
      return
    }

    const execRequest = {
      executionId,
      sessionId: preAllocatedSessionId,
      decision,
      requestedAt: new Date(),
      cancellable: true,
    }

    // ADMITTED → RUNNING
    const startedAt = new Date().toISOString()
    await asyncRepo.update(executionId, {
      state:     'RUNNING',
      startedAt,
    })
    await eventStore.append({
      executionId,
      kind: PublicEventKind.EXECUTION_STARTED,
      payload: { startedAt },
    })

    // Execute — blocks until terminal (cooperative cancel checked at step boundaries)
    const result = await host.executionSupervisor.execute(execRequest)

    // Map final internal state to public state
    const finalPublicState = toPublicState(result.finalState)
    const now = new Date().toISOString()
    const rawOutput = result.stepRecords.at(-1)?.outcome?.result ?? null

    // ── Server-side output validation (Stage 16C) ───────────────────────────
    // Runs only when execution succeeded and outputSchemaRef was bound.
    // INVALID output turns the terminal state to FAILED (boundary 8: invalid output
    // cannot become a successful typed result). Output is nulled on INVALID.
    let validationResult: ValidationResult | undefined
    let committedOutput: unknown = rawOutput
    let committedState = finalPublicState

    if (finalPublicState === 'COMPLETED' && body.outputSchemaRef) {
      const ref = body.outputSchemaRef
      try {
        const validateRes = await schemaRegistry.validate(ref, rawOutput)
        if (validateRes.outcome === 'VALID') {
          validationResult = {
            outcome:    ValidationOutcome.VALID,
            errorCount: 0,
            schemaRef:  ref,
          }
        } else {
          // INVALID — block output, flip terminal state to FAILED
          validationResult = {
            outcome:    ValidationOutcome.INVALID,
            firstError: validateRes.errors[0],
            errorCount: validateRes.errorCount,
            schemaRef:  ref,
          }
          committedOutput = null
          committedState  = 'FAILED'
        }
      } catch {
        // Schema disappeared or runtime error — NOT_EVALUATED, do not block output
        validationResult = {
          outcome:    ValidationOutcome.NOT_EVALUATED,
          errorCount: 0,
          schemaRef:  ref,
        }
      }
    } else if (!body.outputSchemaRef) {
      validationResult = { outcome: ValidationOutcome.NOT_REQUESTED, errorCount: 0 }
    }

    // Race resolution: check if cancellation was durably accepted before we commit.
    // If CANCELLING is in the repo AND execution did not complete as CANCELLED,
    // we must honour the cancellation — but only if the supervisor did not already
    // produce a CANCELLED result (which means the cooperative check fired).
    // If the supervisor returned COMPLETED/FAILED, completion wins — it was committed
    // first by the supervisor's internal session store before we get here.
    await asyncRepo.update(executionId, {
      state:       committedState,
      completedAt: committedState === 'CANCELLED' ? undefined : now,
      cancelledAt: committedState === 'CANCELLED' ? now : undefined,
      result: {
        output:          committedOutput,
        totalDurationMs: result.totalDurationMs,
        completedAt:     now,
      },
      ...(validationResult !== undefined ? { validationResult } : {}),
    })

    // Seed evidence from step records
    await asyncRepo.appendEvidence(executionId, result.stepRecords.map(sr => ({
      kind:       `step:${sr.state.toLowerCase()}`,
      stepId:     sr.skillId,
      detail:     { attemptCount: sr.attemptCount, outcome: sr.outcome?.status ?? null },
      recordedAt: (sr.completedAt ?? new Date()).toISOString(),
    })))

    // Append validation evidence entry (durable and correlated — boundary 11)
    if (validationResult !== undefined && validationResult.outcome !== ValidationOutcome.NOT_REQUESTED) {
      await asyncRepo.appendEvidence(executionId, [{
        kind:       `validation:${validationResult.outcome}`,
        stepId:     null,
        detail:     {
          schemaId:   body.outputSchemaRef?.schemaId,
          version:    body.outputSchemaRef?.version,
          errorCount: validationResult.errorCount,
          firstError: validationResult.firstError ?? null,
        },
        recordedAt: now,
      }])
    }

    // Publish terminal event — swallow if event store already has a terminal
    // (e.g. cancel won a race and published EXECUTION_CANCELLED already)
    if (committedState === 'CANCELLED') {
      await eventStore.append({
        executionId,
        kind: PublicEventKind.EXECUTION_CANCELLED,
        payload: { cancelledAt: now },
      }).catch(() => { /* already terminal */ })
    } else if (committedState === 'FAILED') {
      const isValidationFailure = validationResult?.outcome === ValidationOutcome.INVALID
      await eventStore.append({
        executionId,
        kind: PublicEventKind.EXECUTION_FAILED,
        payload: {
          errorCode: isValidationFailure ? 'VALIDATION_FAILED' : 'EXECUTION_FAILED',
          message:   isValidationFailure ? `Output validation failed: ${validationResult!.firstError ?? 'invalid'}` : 'Execution failed',
          failedAt:  now,
        },
      }).catch(() => { /* already terminal */ })
    } else {
      await eventStore.append({
        executionId,
        kind: PublicEventKind.EXECUTION_COMPLETED,
        payload: { completedAt: now, totalDurationMs: result.totalDurationMs },
      }).catch(() => { /* already terminal */ })
    }

  } catch (err) {
    const now = new Date().toISOString()
    await asyncRepo.update(executionId, {
      state:       'FAILED',
      completedAt: now,
      result: { output: null, totalDurationMs: 0, completedAt: now },
    }).catch(() => { /* record may already be terminal */ })

    await eventStore.append({
      executionId,
      kind: PublicEventKind.EXECUTION_FAILED,
      payload: { errorCode: 'INTERNAL_ERROR', message: String(err instanceof Error ? err.message : err), failedAt: now },
    }).catch(() => { /* already terminal */ })
  }
}
