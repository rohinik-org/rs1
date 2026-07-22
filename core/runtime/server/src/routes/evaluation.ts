import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { EvaluationRequest } from '@rohinik-org/evaluation-ir'

export function registerEvaluationRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  function buildRequest(body: Record<string, unknown>): EvaluationRequest {
    return {
      evaluationId: randomUUID(),
      context: body.context as never,
      predictions: body.predictions as never,
      decision: body.decision as never,
      execution: body.execution as never,
      session: body.session as never,
      requestedAt: new Date(),
    }
  }

  function evaluate(body: Record<string, unknown>, dryRun: boolean): Record<string, unknown> {
    const record = host.evaluator.evaluate(buildRequest(body)) as Record<string, unknown>
    return dryRun ? { ...record, _dryRun: true } : record
  }

  app.post('/v1/evaluation/evaluate', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    reply.send(evaluate(req.body as Record<string, unknown>, false))
  })

  app.post('/v1/evaluation/evaluate/dry-run', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    reply.send(evaluate(req.body as Record<string, unknown>, true))
  })

  app.get('/v1/evaluation/policy', async (_req, reply) => {
    reply.send(host.evaluationPolicy)
  })
}
