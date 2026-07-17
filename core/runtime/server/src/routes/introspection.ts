import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'

export function registerIntrospectionRoutes(app: FastifyInstance, host: RuntimeHost): void {
  app.get('/v1/capabilities', async (_req, reply) => {
    const capabilities = host.state === 'READY' ? host.runtime.listCapabilities() : []
    reply.send({ requestId: randomUUID(), capabilities })
  })

  app.get('/v1/providers', async (_req, reply) => {
    reply.send({ requestId: randomUUID(), providers: [] })
  })

  app.get('/v1/extensions', async (_req, reply) => {
    reply.send({ requestId: randomUUID(), extensions: [] })
  })

  app.get('/v1/metrics', async (_req, reply) => {
    reply.send({ requestId: randomUUID(), counters: {}, histograms: {} })
  })
}
