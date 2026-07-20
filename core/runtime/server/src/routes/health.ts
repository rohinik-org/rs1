import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'

export function registerHealthRoute(app: FastifyInstance, host: RuntimeHost): void {
  app.get('/v1/health', async (_req, reply) => {
    const report = await host.health()
    reply.send({
      requestId: randomUUID(),
      status: report.status.toUpperCase(),
      runtimeId: host.runtimeId,
      state: host.state,
      uptimeMs: Math.round(process.uptime() * 1000),
      checks: report.checks,
      timestamp: report.timestamp,
    })
  })
}
