import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'
import { DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner-ir'
import { DEFAULT_ACQUISITION_POLICY } from '@rohinik-org/capability-acquisition'
import { DEFAULT_BUDGET } from '@rohinik-org/kernel'

export function registerPlannerRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  async function buildRequest(body: {
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

  app.post('/v1/planner/plan', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const request = await buildRequest(req.body as never)
    const decision = await host.planner.plan(request)
    reply.send(decision)
  })

  app.post('/v1/planner/plan/dry-run', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const request = await buildRequest(req.body as never)
    const decision = await host.planner.plan(request)
    // Dry-run: same pipeline, not forwarded to executor
    reply.send({ ...decision, dryRun: true })
  })

  app.get('/v1/planner/policy', async (_req, reply) => {
    reply.send(DEFAULT_PLANNING_POLICY)
  })
}
