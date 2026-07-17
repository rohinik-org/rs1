import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { DecisionStore } from '../decision-store.js'
import type { ExecuteRequestBody } from '../types.js'
import type { RoutingRequest } from '@rohinik-org/kernel'
import { DEFAULT_BUDGET } from '@rohinik-org/kernel'

export function registerExecuteRoute(app: FastifyInstance, host: RuntimeHost, store: DecisionStore): void {
  app.post<{ Body: ExecuteRequestBody }>('/v1/execute', async (req, reply) => {
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

    const result = await host.router.route(routingRequest)
    store.put(requestId, result.decisionTrace)

    reply.send({
      requestId,
      output: result.output,
      skillId: result.skillId,
      tierId: result.tierId,
      reasoningInvoked: result.reasoningInvoked,
      confidence: result.confidence,
      executionTimeMs: result.executionTimeMs,
      resourceCost: result.resourceCost,
      explanation: result.explanation,
    })
  })
}
