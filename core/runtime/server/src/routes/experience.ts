import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { ExperienceRequest } from '@rohinik-org/experience-ir'

export function registerExperienceRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  function buildRequest(body: Record<string, unknown>): ExperienceRequest {
    return {
      experienceRequestId: randomUUID(),
      evaluation: body.evaluation as never,
      context: body.context as never,
      requestedAt: new Date(),
    }
  }

  function record(body: Record<string, unknown>, dryRun: boolean): Record<string, unknown> {
    const r = host.experienceRecorder.record(buildRequest(body)) as unknown as Record<string, unknown>
    return dryRun ? { record: r, _dryRun: true } : r
  }

  app.post('/v1/experience/record', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    reply.send(record(req.body as Record<string, unknown>, false))
  })

  app.post('/v1/experience/record/dry-run', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    reply.send(record(req.body as Record<string, unknown>, true))
  })
}
