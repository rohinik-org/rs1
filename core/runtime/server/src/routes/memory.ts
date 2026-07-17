import type { FastifyInstance } from 'fastify'

export function registerMemoryRoutes(app: FastifyInstance): void {
  const memoryUnavailable = {
    code: 'MEMORY_UNAVAILABLE',
    message: 'No MemoryProvider is registered in this Rohinik runtime.',
    installHint: 'pnpm add @rohinik-org/provider-memory-sqlite',
  }

  app.post('/v1/memory/store', async (_req, reply) => {
    reply.status(503).send(memoryUnavailable)
  })

  app.post('/v1/memory/search', async (_req, reply) => {
    reply.status(503).send(memoryUnavailable)
  })
}
