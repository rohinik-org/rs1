import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { DecisionStore } from '../decision-store.js'

export function registerRuntimeRoute(app: FastifyInstance, host: RuntimeHost, _store: DecisionStore): void {
  app.get('/v1/runtime', async (_req, reply) => {
    const requestId = randomUUID()
    reply.send({
      requestId,
      runtimeId: host.runtimeId,
      build: {
        version: '0.1.0-alpha',
        apiVersion: 'v1',
        protocolVersion: '1.0',
        buildDate: new Date().toISOString(),
      },
      phase: 'Execution Runtime',
      state: host.state,
      uptime: process.uptime() * 1000,
      features: {
        memory: false,
        simulation: true,
        decisionReplay: true,
        events: true,
        autonomy: false,
        distributed: false,
      },
    })
  })
}
