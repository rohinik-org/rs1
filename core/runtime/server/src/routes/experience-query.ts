import type { FastifyInstance } from 'fastify'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { ExperienceQuery } from '@rohinik-org/experience-query-ir'
import { ExperienceQueryValidationError, ExperienceQueryUnavailableError, ExperienceQueryIntegrityError } from '@rohinik-org/runtime'

export function registerExperienceQueryRoutes(app: FastifyInstance, host: RuntimeHost): void {
  function ready(): boolean {
    return host.state === 'READY' || host.state === 'DEGRADED'
  }

  app.post('/v1/experience/query', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    try {
      const result = await host.experienceQueryEngine.query(req.body as ExperienceQuery)
      reply.send(result)
    } catch (err) {
      if (err instanceof ExperienceQueryValidationError) return reply.status(400).send({ code: 'VALIDATION_ERROR', message: err.message })
      if (err instanceof ExperienceQueryIntegrityError) return reply.status(500).send({ code: 'INTEGRITY_ERROR', message: err.message })
      if (err instanceof ExperienceQueryUnavailableError) return reply.status(503).send({ code: 'UNAVAILABLE', message: err.message })
      throw err
    }
  })

  app.get('/v1/experience/:experienceId', async (req, reply) => {
    if (!ready()) return reply.status(503).send({ code: 'NOT_READY' })
    const { experienceId } = req.params as { experienceId: string }
    try {
      const record = await host.experienceQueryEngine.getById(experienceId)
      if (!record) return reply.status(404).send({ code: 'NOT_FOUND', experienceId })
      reply.send(record)
    } catch (err) {
      if (err instanceof ExperienceQueryIntegrityError) return reply.status(500).send({ code: 'INTEGRITY_ERROR', message: (err as Error).message })
      if (err instanceof ExperienceQueryUnavailableError) return reply.status(503).send({ code: 'UNAVAILABLE', message: (err as Error).message })
      throw err
    }
  })
}
