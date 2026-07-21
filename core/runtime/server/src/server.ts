import Fastify from 'fastify'
import type { RuntimeHost } from '@rohinik-org/runtime'
import type { ServerConfig } from './types.js'
import { DecisionStore } from './decision-store.js'
import { registerRuntimeRoute } from './routes/runtime.js'
import { registerHealthRoute } from './routes/health.js'
import { registerExecuteRoute } from './routes/execute.js'
import { registerSimulateRoute } from './routes/simulate.js'
import { registerDecisionsRoute } from './routes/decisions.js'
import { registerIntrospectionRoutes } from './routes/introspection.js'
import { registerMemoryRoutes } from './routes/memory.js'
import { registerEventsRoute } from './routes/events.js'
import { registerShutdownRoute } from './routes/shutdown.js'
import { registerCapabilityRoutes } from './routes/capabilities.js'
import { registerKnowledgeRoutes } from './routes/knowledge.js'
import { registerAcquisitionRoutes } from './routes/acquisition.js'

export class AiosServer {
  private readonly app = Fastify({ logger: false })
  private readonly store: DecisionStore

  constructor(
    private readonly host: RuntimeHost,
    private readonly config: ServerConfig,
  ) {
    this.store = new DecisionStore(host.config.runtime.routing.traceBuffer)
    registerRuntimeRoute(this.app, host, this.store)
    registerHealthRoute(this.app, host)
    registerExecuteRoute(this.app, host, this.store)
    registerSimulateRoute(this.app, host)
    registerDecisionsRoute(this.app, this.store)
    registerIntrospectionRoutes(this.app, host)
    registerMemoryRoutes(this.app)
    registerEventsRoute(this.app)
    registerShutdownRoute(this.app, host)
    registerCapabilityRoutes(this.app, host)
    registerKnowledgeRoutes(this.app, host)
    registerAcquisitionRoutes(this.app, host)
  }

  async listen(): Promise<void> {
    await this.app.listen({ port: this.config.port, host: this.config.host })
  }

  async close(): Promise<void> {
    await this.app.close()
  }
}
