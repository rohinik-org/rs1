import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { ExecutionContext } from '@rohinik-org/capability-manifest'
import { DriverErrorCode } from '@rohinik-org/capability-manifest'

type DriverErrorLike = { code?: string; message?: string; details?: unknown }

function errorCode(err: DriverErrorLike): number {
  if (err.code === DriverErrorCode.CAPABILITY_NOT_FOUND || err.code === DriverErrorCode.DRIVER_NOT_FOUND) return 404
  if (err.code === DriverErrorCode.ACCESS_DENIED) return 403
  return 500
}

function buildContext(req: { headers: Record<string, unknown> }, requestId: string, signal: AbortSignal): ExecutionContext {
  return {
    requestId,
    executionId: randomUUID(),
    sessionId: (req.headers['x-session-id'] as string) ?? randomUUID(),
    workspaceId: (req.headers['x-workspace-id'] as string) ?? 'default',
    permissions: [],
    signal,
  }
}

export function registerCapabilityRoutes(app: FastifyInstance, host: RuntimeHost): void {
  // Generic capability execution endpoint — covers /v1/files, /v1/shell, /v1/search, /v1/document
  app.post<{ Body: { capabilityId: string; input: unknown }; Params: { pack: string } }>(
    '/v1/:pack',
    async (req, reply) => {
      const body = req.body
      if (!body?.capabilityId) {
        reply.status(400).send({ code: 'INVALID_REQUEST', message: 'capabilityId is required' })
        return
      }
      const requestId = (req.headers['x-request-id'] as string) ?? randomUUID()
      const controller = new AbortController()
      req.raw.on('close', () => controller.abort())
      const context = buildContext(req as unknown as { headers: Record<string, unknown> }, requestId, controller.signal)

      try {
        const result = await host.executor.execute(body.capabilityId, body.input ?? {}, context)
        reply.send({
          requestId,
          executionId: result.executionId,
          driverId: result.driverId,
          capabilityId: result.capabilityId,
          value: result.value,
          durationMs: result.durationMs,
        })
      } catch (err) {
        const e = err as DriverErrorLike
        // strip cause — never serialize internal errors
        const { cause: _cause, ...safePayload } = e as { cause?: unknown } & DriverErrorLike
        void _cause
        reply.status(errorCode(e)).send({ code: e.code ?? 'EXECUTION_FAILED', message: e.message, details: e.details })
      }
    }
  )

  // /v1/drivers — list all registered drivers with capabilities + health
  app.get('/v1/drivers', async (_req, reply) => {
    if (!host.driverRegistry) {
      reply.status(503).send({ code: 'NOT_READY' })
      return
    }
    const bindings = host.driverRegistry.list()
    const health = await host.driverRegistry.health()
    const healthMap = new Map(health.map(h => [h.driverId, h]))

    reply.send(
      bindings.map(b => ({
        id: b.descriptor.id,
        version: b.descriptor.version,
        apiVersion: b.descriptor.apiVersion,
        priority: b.descriptor.priority,
        capabilities: b.descriptor.capabilities,
        health: healthMap.get(b.descriptor.id),
      }))
    )
  })
}
