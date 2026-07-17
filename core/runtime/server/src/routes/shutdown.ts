import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'

export function registerShutdownRoute(app: FastifyInstance, host: RuntimeHost): void {
  app.post('/v1/shutdown', async (_req, reply) => {
    const requestId = randomUUID()
    reply.send({ requestId, message: 'Shutdown initiated' })
    setImmediate(() => host.stop().catch(console.error))
  })
}
