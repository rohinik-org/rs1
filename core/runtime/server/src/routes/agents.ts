import type { FastifyInstance, FastifyReply } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'
import { DEFAULT_BUDGET } from '@rohinik-org/kernel'
import type { RoutingRequest } from '@rohinik-org/kernel'
import { issueCertificate, DelegatedTaskState } from '@rohinik-org/agent-delegation'
import type { DelegatedTaskId } from '@rohinik-org/agent-delegation'
import { AgentRunState } from '@rohinik-org/agent-ir'
import type {
  AgentInstanceId, AgentRunId, AgentTaskId, DelegationId,
} from '@rohinik-org/agent-ir'
import type { TransitionEvidence } from '@rohinik-org/agent-runtime'
import { AgentEventStore, makeAgentEvent } from '../agent-event-store.js'
import {
  createAsyncExecutionRecord,
  asyncRepo,
} from './async-executions.js'
import { EXECUTION_PROTOCOL_VERSION } from '@rohinik-org/execution-protocol-v1'

// One shared event store per server instance
// ponytail: module-level store works for single-process InMemory slice; replace with injected store when persistence added
const agentEvents = new AgentEventStore()

function notConfigured(reply: FastifyReply): void {
  reply.code(503).send({ error: 'agent-services-not-configured' })
}

export function registerAgentRoutes(app: FastifyInstance, host: RuntimeHost): void {

  // ── 1. POST /v1/agent-instances/admit ───────────────────────────────────────
  app.post<{ Body: { instanceId: string } }>('/v1/agent-instances/admit', async (req, reply) => {
    const { agentAdmission, agentRuns } = host
    if (!agentAdmission || !agentRuns) { notConfigured(reply); return }

    const body = req.body
    if (!body?.instanceId) {
      reply.code(400).send({ error: 'instanceId is required' }); return
    }

    const result = await agentAdmission.admit({
      instanceId: body.instanceId as unknown as AgentInstanceId,
      requestedAt: new Date(),
    })

    if (!result.admitted || result.runId === undefined) {
      reply.code(409).send({ error: result.reason ?? 'admission-denied' }); return
    }

    agentEvents.append(makeAgentEvent('agent-admitted', result.runId as string, {
      payload: { instanceId: body.instanceId },
    }))

    reply.code(200).send({ runId: result.runId })
  })

  // ── 2. GET /v1/agent-instances/:instanceId ───────────────────────────────────
  app.get<{ Params: { instanceId: string } }>('/v1/agent-instances/:instanceId', async (req, reply) => {
    const { agentInstances } = host
    if (!agentInstances) { notConfigured(reply); return }

    const instance = await agentInstances.load(req.params.instanceId as unknown as AgentInstanceId)
    if (!instance) { reply.code(404).send({ error: 'not-found' }); return }

    reply.send({
      instanceId:   instance.instanceId,
      definitionId: instance.definitionId,
      versionId:    instance.versionId,
      createdAt:    instance.createdAt,
    })
  })

  // ── 3. POST /v1/agent-runs ───────────────────────────────────────────────────
  // Advances run: ADMITTED → READY → RUNNING (frozen lifecycle enforced)
  app.post<{ Body: { runId: string } }>('/v1/agent-runs', async (req, reply) => {
    const { agentLifecycle } = host
    if (!agentLifecycle) { notConfigured(reply); return }

    const { runId } = req.body ?? {}
    if (!runId) { reply.code(400).send({ error: 'runId is required' }); return }

    const id = runId as unknown as AgentRunId

    const e1: TransitionEvidence = { evidenceId: randomUUID(), reason: 'readied' }
    const r1 = await agentLifecycle.transition(id, AgentRunState.READY, e1)
    if (!r1.ok) { reply.code(409).send({ error: r1.reason }); return }
    agentEvents.append(makeAgentEvent('run-transition', runId, {
      fromState: AgentRunState.ADMITTED, toState: AgentRunState.READY, evidenceId: e1.evidenceId,
    }))

    const e2: TransitionEvidence = { evidenceId: randomUUID(), reason: 'started' }
    const r2 = await agentLifecycle.transition(id, AgentRunState.RUNNING, e2)
    if (!r2.ok) { reply.code(409).send({ error: r2.reason }); return }
    agentEvents.append(makeAgentEvent('run-transition', runId, {
      fromState: AgentRunState.READY, toState: AgentRunState.RUNNING, evidenceId: e2.evidenceId,
    }))

    reply.send({ runId, state: AgentRunState.RUNNING })
  })

  // ── 4. GET /v1/agent-runs/:runId ─────────────────────────────────────────────
  app.get<{ Params: { runId: string } }>('/v1/agent-runs/:runId', async (req, reply) => {
    const { agentRuns } = host
    if (!agentRuns) { notConfigured(reply); return }

    const run = await agentRuns.load(req.params.runId as unknown as AgentRunId)
    if (!run) { reply.code(404).send({ error: 'not-found' }); return }

    reply.send({
      runId:        run.runId,
      instanceId:   run.instanceId,
      definitionId: run.definitionId,
      versionId:    run.versionId,
      state:        run.state,
      startedAt:    run.startedAt,
      admittedAt:   run.admittedAt,
    })
  })

  // ── 5. POST /v1/agent-runs/:runId/cancel ─────────────────────────────────────
  app.post<{ Params: { runId: string }; Body: { reason?: string } }>(
    '/v1/agent-runs/:runId/cancel', async (req, reply) => {
      const { agentLifecycle } = host
      if (!agentLifecycle) { notConfigured(reply); return }

      const runId = req.params.runId
      const evidence: TransitionEvidence = {
        evidenceId: randomUUID(),
        reason: req.body?.reason ?? 'cancelled',
      }
      const result = await agentLifecycle.transition(
        runId as unknown as AgentRunId,
        AgentRunState.CANCELLED,
        evidence,
      )
      if (!result.ok) { reply.code(409).send({ error: result.reason }); return }

      agentEvents.append(makeAgentEvent('run-cancelled', runId, {
        toState: AgentRunState.CANCELLED, reason: evidence.reason, evidenceId: evidence.evidenceId,
      }))
      reply.send({ ok: true })
    },
  )

  // ── 6. POST /v1/agent-runs/:runId/delegations ─────────────────────────────────
  app.post<{
    Params: { runId: string }
    Body: {
      delegateeRunId:      string
      taskId:              string
      description:         string
      delegationId?:       string
      grantedCapabilities: string[]
      grantedActions:      string[]
      grantedDepth:        number
      maxCostUsd:          number
      maxLatencyMs:        number
      maxTokens:           number
    }
  }>('/v1/agent-runs/:runId/delegations', async (req, reply) => {
    const { agentRuns, agentVersions, agentLifecycle, certificates, delegatedTasks } = host
    if (!agentRuns || !agentVersions || !agentLifecycle || !certificates || !delegatedTasks) {
      notConfigured(reply); return
    }

    const body = req.body
    const runId = req.params.runId

    const run = await agentRuns.load(runId as unknown as AgentRunId)
    if (!run) { reply.code(404).send({ error: 'run-not-found' }); return }

    const version = await agentVersions.load(run.versionId)
    if (!version) { reply.code(409).send({ error: 'version-not-found' }); return }

    // Transition RUNNING → DELEGATING
    const e: TransitionEvidence = { evidenceId: randomUUID(), reason: 'delegating' }
    const r = await agentLifecycle.transition(run.runId, AgentRunState.DELEGATING, e)
    if (!r.ok) { reply.code(409).send({ error: r.reason }); return }
    agentEvents.append(makeAgentEvent('run-transition', runId, {
      fromState: AgentRunState.RUNNING, toState: AgentRunState.DELEGATING, evidenceId: e.evidenceId,
    }))

    const delegationId = (body.delegationId ?? randomUUID()) as unknown as DelegationId

    // Issue certificate — throws on attenuation violation
    let cert
    try {
      cert = issueCertificate({
        delegationId,
        delegatorRunId:   run.runId,
        delegateeRunId:   body.delegateeRunId as unknown as AgentRunId,
        parentAuthority:  version.authority,
        parentBudget:     version.budget,
        grantedAuthority: {
          allowedCapabilities: body.grantedCapabilities,
          allowedActions:      body.grantedActions,
          deniedActions:       [],
          maxDelegationDepth:  body.grantedDepth,
        },
        grantedBudget: {
          maxCostUsd:   body.maxCostUsd,
          maxLatencyMs: body.maxLatencyMs,
          maxTokens:    body.maxTokens,
        },
        taskId:   body.taskId as unknown as AgentTaskId,
        issuedAt: new Date(),
      })
    } catch (err) {
      // Roll back DELEGATING → RUNNING on attenuation failure
      const rollback: TransitionEvidence = { evidenceId: randomUUID(), reason: 'delegation-aborted' }
      await agentLifecycle.transition(run.runId, AgentRunState.RUNNING, rollback)
      agentEvents.append(makeAgentEvent('run-transition', runId, {
        fromState: AgentRunState.DELEGATING, toState: AgentRunState.RUNNING, evidenceId: rollback.evidenceId,
        reason: 'delegation-aborted',
      }))
      reply.code(400).send({ error: (err as Error).message }); return
    }

    await certificates.save(cert)
    agentEvents.append(makeAgentEvent('certificate-issued', runId, {
      delegationId:  delegationId as string,
      certificateId: cert.certificateId as string,
      fingerprint:   cert.fingerprint,
    }))

    const task = await delegatedTasks.propose({
      delegationId,
      delegatorRunId: run.runId,
      delegateeRunId: body.delegateeRunId as unknown as AgentRunId,
      taskId:         body.taskId as unknown as AgentTaskId,
      description:    body.description,
    })
    agentEvents.append(makeAgentEvent('delegation-proposed', runId, {
      delegationId:    delegationId as string,
      delegatedTaskId: task.delegatedTaskId as string,
    }))

    const offerResult = await delegatedTasks.offer(task.delegatedTaskId, cert.certificateId)
    if (!offerResult.ok) {
      reply.code(409).send({ error: offerResult.reason }); return
    }
    agentEvents.append(makeAgentEvent('delegation-offered', runId, {
      delegationId:    delegationId as string,
      delegatedTaskId: task.delegatedTaskId as string,
      certificateId:   cert.certificateId as string,
    }))

    reply.code(201).send({
      certificateId:   cert.certificateId,
      fingerprint:     cert.fingerprint,
      delegatedTaskId: task.delegatedTaskId,
      delegationId,
    })
  })

  // ── 7. POST /v1/delegations/:id/accept ───────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/delegations/:id/accept', async (req, reply) => {
      const { delegatedTasks, delegatedTaskRepo } = host
      if (!delegatedTasks || !delegatedTaskRepo) { notConfigured(reply); return }

      const id = req.params.id as unknown as DelegatedTaskId
      const task = await delegatedTaskRepo.load(id)
      if (!task) { reply.code(404).send({ error: 'not-found' }); return }

      const result = await delegatedTasks.accept(id)
      if (!result.ok) { reply.code(409).send({ error: result.reason }); return }

      agentEvents.append(makeAgentEvent('delegation-accepted', task.delegatorRunId as string, {
        delegationId:    task.delegationId as string,
        delegatedTaskId: task.delegatedTaskId as string,
      }))
      reply.send({ ok: true })
    },
  )

  // ── 8. POST /v1/delegations/:id/run ──────────────────────────────────────────
  // Transitions ACCEPTED → RUNNING synchronously, creates AsyncExecutionRecord,
  // returns 202 Accepted with executionId before execution completes.
  // Background pipeline runs execution via host.router.route(), then submits result.
  app.post<{ Params: { id: string }; Body?: { outputSchemaRef?: { schemaId: string; version: string; semanticHash: string } } }>(
    '/v1/delegations/:id/run', async (req, reply) => {
      const { delegatedTasks, delegatedTaskRepo } = host
      if (!delegatedTasks || !delegatedTaskRepo) { notConfigured(reply); return }

      const id = req.params.id as unknown as DelegatedTaskId
      const task = await delegatedTaskRepo.load(id)
      if (!task) { reply.code(404).send({ error: 'not-found' }); return }

      // ACCEPTED → RUNNING (synchronous — validates state machine before returning 202)
      const runResult = await delegatedTasks.run(id)
      if (!runResult.ok) { reply.code(409).send({ error: runResult.reason }); return }

      agentEvents.append(makeAgentEvent('delegation-run', task.delegatorRunId as string, {
        delegationId:    task.delegationId as string,
        delegatedTaskId: task.delegatedTaskId as string,
      }))

      // Create async execution record — QUEUED — correlated to this delegation
      const record = createAsyncExecutionRecord({
        content:     task.description,
        contentType: 'TEXT',
        ...(req.body?.outputSchemaRef !== undefined ? { outputSchemaRef: req.body.outputSchemaRef } : {}),
      })
      await asyncRepo.save(record)

      agentEvents.append(makeAgentEvent('execution-started', task.delegatorRunId as string, {
        delegationId:    task.delegationId as string,
        delegatedTaskId: task.delegatedTaskId as string,
        evidenceId:      record.executionId,
      }))

      // Fire-and-forget: route execution, submit result, update async record
      _runDelegationBackground(host, record.executionId, task.description, id, task.delegatorRunId as string, task.delegationId as string, task.delegatedTaskId as string).catch(() => {
        // Background errors absorbed; async record will reflect FAILED state
      })

      reply.code(202).send({
        executionId:          record.executionId,
        idempotencyKey:       null,
        state:                record.state,
        protocolVersion:      EXECUTION_PROTOCOL_VERSION,
        submittedAt:          record.submittedAt,
        idempotent:           false,
        delegationId:         task.delegationId as string,
        delegatedTaskId:      task.delegatedTaskId as string,
      })
    },
  )

  // ── 9. POST /v1/delegations/:id/results ──────────────────────────────────────
  // External delegate submission — task must already be in RUNNING state
  app.post<{ Params: { id: string }; Body: { result: unknown } }>(
    '/v1/delegations/:id/results', async (req, reply) => {
      const { delegatedTasks, delegatedTaskRepo } = host
      if (!delegatedTasks || !delegatedTaskRepo) { notConfigured(reply); return }

      const id = req.params.id as unknown as DelegatedTaskId
      const task = await delegatedTaskRepo.load(id)
      if (!task) { reply.code(404).send({ error: 'not-found' }); return }

      const opResult = await delegatedTasks.submit(id, req.body?.result)
      if (!opResult.ok) { reply.code(409).send({ error: opResult.reason }); return }

      agentEvents.append(makeAgentEvent('result-submitted', task.delegatorRunId as string, {
        delegationId:    task.delegationId as string,
        delegatedTaskId: task.delegatedTaskId as string,
      }))

      reply.send({ ok: true, state: DelegatedTaskState.SUBMITTED })
    },
  )

  // ── 10. POST /v1/delegations/:id/results/accept ───────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/v1/delegations/:id/results/accept', async (req, reply) => {
      const { delegatedTasks, delegatedTaskRepo, agentLifecycle } = host
      if (!delegatedTasks || !delegatedTaskRepo || !agentLifecycle) { notConfigured(reply); return }

      const id = req.params.id as unknown as DelegatedTaskId
      const task = await delegatedTaskRepo.load(id)
      if (!task) { reply.code(404).send({ error: 'not-found' }); return }

      const opResult = await delegatedTasks.acceptResult(id)
      if (!opResult.ok) { reply.code(409).send({ error: opResult.reason }); return }

      agentEvents.append(makeAgentEvent('result-accepted', task.delegatorRunId as string, {
        delegationId:    task.delegationId as string,
        delegatedTaskId: task.delegatedTaskId as string,
      }))

      // Return parent run from DELEGATING → RUNNING only when no blocking sibling remains
      const canResume = agentEvents.canResumeFromDelegating(
        task.delegatorRunId as string,
        task.delegationId as string,
      )
      let parentResumed = false
      if (canResume) {
        const e: TransitionEvidence = { evidenceId: randomUUID(), reason: 'delegation-resolved' }
        const resumeResult = await agentLifecycle.transition(task.delegatorRunId, AgentRunState.RUNNING, e)
        if (resumeResult.ok) {
          parentResumed = true
          agentEvents.append(makeAgentEvent('run-transition', task.delegatorRunId as string, {
            fromState: AgentRunState.DELEGATING, toState: AgentRunState.RUNNING, evidenceId: e.evidenceId,
          }))
        }
      }

      reply.send({ ok: true, parentResumed })
    },
  )

  // ── 11. POST /v1/delegations/:id/results/reject ───────────────────────────────
  // Parent stays DELEGATING; delegator must re-issue or cancel
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/v1/delegations/:id/results/reject', async (req, reply) => {
      const { delegatedTasks, delegatedTaskRepo } = host
      if (!delegatedTasks || !delegatedTaskRepo) { notConfigured(reply); return }

      const id = req.params.id as unknown as DelegatedTaskId
      const task = await delegatedTaskRepo.load(id)
      if (!task) { reply.code(404).send({ error: 'not-found' }); return }

      const opResult = await delegatedTasks.rejectResult(id, req.body?.reason ?? 'rejected')
      if (!opResult.ok) { reply.code(409).send({ error: opResult.reason }); return }

      agentEvents.append(makeAgentEvent('result-rejected', task.delegatorRunId as string, {
        delegationId:    task.delegationId as string,
        delegatedTaskId: task.delegatedTaskId as string,
        reason:          req.body?.reason,
      }))

      reply.send({ ok: true })
    },
  )

  // ── 12. POST /v1/delegations/:id/cancel ──────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/v1/delegations/:id/cancel', async (req, reply) => {
      const { delegatedTasks, delegatedTaskRepo, certificates, agentLifecycle } = host
      if (!delegatedTasks || !delegatedTaskRepo || !certificates || !agentLifecycle) {
        notConfigured(reply); return
      }

      const id = req.params.id as unknown as DelegatedTaskId
      const task = await delegatedTaskRepo.load(id)
      if (!task) { reply.code(404).send({ error: 'not-found' }); return }

      // Revoke certificate if bound
      if (task.certificateId !== undefined) {
        await certificates.revoke(task.certificateId)
        agentEvents.append(makeAgentEvent('certificate-revoked', task.delegatorRunId as string, {
          delegationId:  task.delegationId as string,
          certificateId: task.certificateId as string,
        }))
      }

      const result = await delegatedTasks.cancel(id, req.body?.reason ?? 'cancelled')
      if (!result.ok) { reply.code(409).send({ error: result.reason }); return }

      agentEvents.append(makeAgentEvent('delegation-cancelled', task.delegatorRunId as string, {
        delegationId:    task.delegationId as string,
        delegatedTaskId: task.delegatedTaskId as string,
        reason:          req.body?.reason,
      }))

      // Return parent from DELEGATING → RUNNING only when no blocking siblings remain
      const canResume = agentEvents.canResumeFromDelegating(
        task.delegatorRunId as string,
        task.delegationId as string,
      )
      let parentResumed = false
      if (canResume) {
        const e: TransitionEvidence = { evidenceId: randomUUID(), reason: 'delegation-cancelled' }
        const resumeResult = await agentLifecycle.transition(task.delegatorRunId, AgentRunState.RUNNING, e)
        if (resumeResult.ok) {
          parentResumed = true
          agentEvents.append(makeAgentEvent('run-transition', task.delegatorRunId as string, {
            fromState: AgentRunState.DELEGATING, toState: AgentRunState.RUNNING, evidenceId: e.evidenceId,
          }))
        }
      }

      reply.send({ ok: result.ok, parentResumed })
    },
  )

  // ── 13. GET /v1/agent-runs/:runId/evidence ────────────────────────────────────
  app.get<{ Params: { runId: string } }>('/v1/agent-runs/:runId/evidence', async (req, reply) => {
    const { agentRuns } = host
    if (!agentRuns) { notConfigured(reply); return }

    const run = await agentRuns.load(req.params.runId as unknown as AgentRunId)
    if (!run) { reply.code(404).send({ error: 'not-found' }); return }

    const events = agentEvents.listByRun(req.params.runId)
    reply.send({
      runId:  run.runId,
      state:  run.state,
      events: events.map(e => ({
        eventId:          e.eventId,
        kind:             e.kind,
        delegationId:     e.delegationId,
        delegatedTaskId:  e.delegatedTaskId,
        certificateId:    e.certificateId,
        fingerprint:      e.fingerprint,
        fromState:        e.fromState,
        toState:          e.toState,
        reason:           e.reason,
        evidenceId:       e.evidenceId,
        payload:          e.payload,
        occurredAt:       e.occurredAt,
      })),
    })
  })
}

// ── Delegation background execution pipeline ──────────────────────────────────
//
// Called fire-and-forget from POST /v1/delegations/:id/run.
// Routes execution, submits result to delegation service, updates async record.
// Never throws to caller — all errors are absorbed.

async function _runDelegationBackground(
  host: RuntimeHost,
  executionId: string,
  description: string,
  delegatedTaskId: DelegatedTaskId,
  delegatorRunId: string,
  delegationId: string,
  delegatedTaskStrId: string,
): Promise<void> {
  const { delegatedTasks } = host
  let output: unknown = '[no output]'

  try {
    await asyncRepo.update(executionId, { state: 'RUNNING', startedAt: new Date().toISOString() })

    const routingRequest: RoutingRequest = {
      id:          executionId,
      content:     description,
      contentType: 'TEXT' as never,
      context:     {},
      metadata:    {},
      constraints: { ...DEFAULT_BUDGET, allowReasoning: true },
      timestamp:   new Date(),
    }

    const execResult = await host.router.route(routingRequest)
    output = execResult.output

    const now = new Date().toISOString()
    await asyncRepo.update(executionId, {
      state:       'COMPLETED',
      completedAt: now,
      result: {
        output,
        totalDurationMs: 0,
        completedAt:     now,
      },
    })
  } catch {
    const now = new Date().toISOString()
    await asyncRepo.update(executionId, {
      state:       'FAILED',
      completedAt: now,
      result: {
        output:          null,
        totalDurationMs: 0,
        completedAt:     now,
      },
    }).catch(() => {})
  }

  // RUNNING → SUBMITTED regardless of execution success/failure
  if (delegatedTasks) {
    const submitResult = await delegatedTasks.submit(delegatedTaskId, output).catch(() => ({ ok: false }))
    if (submitResult.ok) {
      agentEvents.append(makeAgentEvent('result-submitted', delegatorRunId, {
        delegationId,
        delegatedTaskId: delegatedTaskStrId,
        evidenceId:      executionId,
      }))
    }
  }
}
