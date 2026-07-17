import type { FastifyInstance } from 'fastify'
import type { DecisionStore } from '../decision-store.js'

export function registerDecisionsRoute(app: FastifyInstance, store: DecisionStore): void {
  app.get<{ Params: { requestId: string } }>('/v1/decisions/:requestId', async (req, reply) => {
    const trace = store.get(req.params.requestId)
    if (!trace) {
      reply.status(404).send({ code: 'DECISION_NOT_FOUND', message: `No decision found for requestId '${req.params.requestId}'` })
      return
    }
    reply.send({ requestId: req.params.requestId, trace })
  })
}
