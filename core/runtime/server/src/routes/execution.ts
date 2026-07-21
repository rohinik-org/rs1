import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { RuntimeHost } from '@rohinik-org/runtime'
import { DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner-ir'
import { DEFAULT_ACQUISITION_POLICY } from '@rohinik-org/capability-acquisition'
import { DEFAULT_BUDGET } from '@rohinik-org/kernel'
import type { ExecutionRequest } from '@rohinik-org/execution-ir'

export function registerExecutionRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  async function buildPlanningRequest(body: {
    context?: { rawInput?: string; concepts?: string[]; preferredSkills?: string[] }
    predictions?: unknown
    policy?: unknown
  }) {
    const raw = body.context?.rawInput ?? ''
    const workingContext = await host.contextManager.build({
      intentId: randomUUID(),
      schemaVersion: '1.0' as const,
      rawInput: raw,
      concepts: body.context?.concepts ?? raw.split(/\s+/).filter(Boolean),
      preferredSkills: body.context?.preferredSkills ?? [],
      constraints: { maxSteps: 10, requireVerification: false },
      translatedBy: 'http',
      translationConfidence: 1,
      unresolvedTerms: [],
    })

    const predictions = (body.predictions as never) ?? await host.predictionManager.predict(workingContext)

    return {
      requestId: randomUUID(),
      context: workingContext,
      predictions,
      executionBudget: DEFAULT_BUDGET,
      acquisitionPolicy: DEFAULT_ACQUISITION_POLICY,
      planningPolicy: (body.policy as never) ?? DEFAULT_PLANNING_POLICY,
    }
  }

  app.post('/v1/execution/run', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const planRequest = await buildPlanningRequest(req.body as never)
    const decision = await host.planner.plan(planRequest)
    const execRequest: ExecutionRequest = {
      executionId: randomUUID(),
      decision,
      requestedAt: new Date(),
      cancellable: true,
    }
    const result = await host.executionSupervisor.execute(execRequest)
    reply.send(result)
  })

  app.post('/v1/execution/cancel', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const { sessionId } = req.body as { sessionId: string }
    if (!sessionId) return reply.status(400).send({ code: 'MISSING_SESSION_ID' })
    await host.executionSupervisor.cancel(sessionId)
    reply.send({ cancelled: true, sessionId })
  })

  app.get('/v1/execution/:sessionId', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const { sessionId } = req.params as { sessionId: string }
    const session = await host.executionSupervisor.getSession(sessionId)
    if (!session) return reply.status(404).send({ code: 'NOT_FOUND' })
    reply.send(session)
  })

  app.get('/v1/execution/:sessionId/events', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const { sessionId } = req.params as { sessionId: string }
    const events = await host.executionSupervisor.getEvents(sessionId)
    reply.send(events)
  })
}
