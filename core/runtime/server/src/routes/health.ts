import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'

export function registerHealthRoute(app: FastifyInstance, host: RuntimeHost): void {
  app.get('/v1/health', async (_req, reply) => {
    const runtimeHealthy = host.state === 'READY'
    const overallStatus = runtimeHealthy ? 'HEALTHY' : 'DEGRADED'
    reply.send({
      requestId: randomUUID(),
      status: overallStatus,
      runtime: { status: runtimeHealthy ? 'HEALTHY' : 'UNHEALTHY' },
      kernel: { status: host.state === 'READY' ? 'HEALTHY' : 'DEGRADED' },
      router: { status: host.state === 'READY' ? 'HEALTHY' : 'DEGRADED' },
      providers: { status: 'HEALTHY', items: [] },
      memory: { status: 'HEALTHY', message: 'No MemoryProvider installed (expected in Phase 1)' },
      extensions: { status: 'HEALTHY', items: [] },
    })
  })
}
