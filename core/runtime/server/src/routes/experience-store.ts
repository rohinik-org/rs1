import type { FastifyInstance } from 'fastify'
import type { RuntimeHost } from '@rohinik-org/runtime'

export function registerExperienceStoreRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  app.get('/v1/experience/store/stats', async (_req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    reply.send(host.experienceWriter.getStats())
  })

  app.get('/v1/experience/store/health', async (_req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const { dbPath } = host.experienceWriter.getStats()
    const writable = host.experienceWriter.isWritable()
    reply.send({ status: writable ? 'healthy' : 'degraded', dbPath, writable })
  })
}
