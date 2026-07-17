import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { ExecuteRequestBody } from '../types.js'
import type { RoutingRequest } from '@rohinik-org/kernel'
import { DEFAULT_BUDGET } from '@rohinik-org/kernel'

export function registerSimulateRoute(app: FastifyInstance, host: RuntimeHost): void {
  app.post<{ Body: ExecuteRequestBody }>('/v1/simulate', async (req, reply) => {
    const body = req.body
    if (!body?.content || !body?.contentType) {
      reply.status(400).send({ code: 'INVALID_REQUEST', message: 'content and contentType are required' })
      return
    }

    const requestId = body.requestId ?? randomUUID()
    const routingRequest: RoutingRequest = {
      id: requestId,
      content: body.content,
      contentType: body.contentType as never,
      intentHint: body.intentHint,
      context: body.context ?? {},
      metadata: {},
      constraints: {
        ...DEFAULT_BUDGET,
        allowReasoning: body.constraints?.allowReasoning ?? true,
      },
      timestamp: new Date(),
    }

    const result = await host.router.simulate(routingRequest)

    reply.send({
      requestId,
      wouldRoute: result.wouldRoute,
      selectedTier: result.selectedTier,
      selectedSkill: result.selectedSkill,
      confidence: result.confidence,
      estimatedCost: result.estimatedCost,
      estimatedLatencyMs: result.estimatedLatencyMs,
      reasoningWouldBeInvoked: result.reasoningWouldBeInvoked,
      candidatesConsidered: result.candidatesConsidered,
    })
  })
}
