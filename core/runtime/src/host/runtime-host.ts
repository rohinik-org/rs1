import { EventEmitter } from 'node:events'
import type { KernelRuntime, AiosRouter } from '@rohinik-org/kernel'
import type { RuntimeHostState, RuntimeHostEvent } from '../types.js'
import type { BootstrapPlan } from './bootstrap-plan.js'
import type { BootstrapMetadata, ProviderEntry, HealthReport } from './bootstrap-context.js'
import { BootstrapPipeline } from './bootstrap-pipeline.js'
import { ShutdownPipeline } from './shutdown-pipeline.js'

export class RuntimeHost {
  private _state: RuntimeHostState = 'CREATED'
  private _runtime: KernelRuntime | undefined
  private _router: AiosRouter | undefined
  private _metadata: BootstrapMetadata | undefined
  private readonly emitter = new EventEmitter()

  constructor(private readonly plan: BootstrapPlan) {}

  get state(): RuntimeHostState {
    return this._state
  }

  get runtimeId(): string {
    return this.plan.config.runtimeId
  }

  get runtime(): KernelRuntime {
    if (!this._runtime) throw new Error('RuntimeHost not started')
    return this._runtime
  }

  get router(): AiosRouter {
    if (!this._router) throw new Error('RuntimeHost not started')
    return this._router
  }

  get config() {
    return this.plan.config
  }

  on(event: RuntimeHostEvent, handler: () => void): void {
    this.emitter.on(event, handler)
  }

  listProviders(): ReadonlyArray<ProviderEntry> {
    return this._metadata?.providers ?? []
  }

  async health(): Promise<HealthReport> {
    const checks = [
      {
        subsystem: 'kernel',
        status: (this._runtime ? 'healthy' : 'unavailable') as 'healthy' | 'degraded' | 'unavailable',
      },
      {
        subsystem: 'eventbus',
        status: (this._runtime ? 'healthy' : 'unavailable') as 'healthy' | 'degraded' | 'unavailable',
      },
      {
        subsystem: 'providers',
        status: (() => {
          const providers = this._metadata?.providers ?? []
          const healthy = providers.filter(p => p.status === 'HEALTHY').length
          return (healthy > 0 ? 'healthy' : 'degraded') as 'healthy' | 'degraded' | 'unavailable'
        })(),
        data: {
          healthy: (this._metadata?.providers ?? []).filter(p => p.status === 'HEALTHY').length,
          total: (this._metadata?.providers ?? []).length,
        },
      },
    ]

    const overallFailed = checks.some(c => c.status === 'unavailable')
    const overallDegraded = checks.some(c => c.status === 'degraded')

    return {
      startupId: this._metadata?.startupId,
      status: overallFailed ? 'unavailable' : overallDegraded ? 'degraded' : 'healthy',
      checks,
      timestamp: Date.now(),
    }
  }

  async start(): Promise<void> {
    if (this._state !== 'CREATED' && this._state !== 'STOPPED') {
      throw new Error(`Cannot start: RuntimeHost is in state '${this._state}'`)
    }
    this._state = 'INITIALIZING'
    this._state = 'BOOTSTRAPPING'
    try {
      const result = await new BootstrapPipeline(this.plan).execute()
      this._runtime = result.runtime
      this._router = result.router
      this._metadata = result.metadata
      this._state = 'READY'
      this.emitter.emit('runtime:ready')
    } catch (err) {
      this._state = 'FAILED'
      throw err
    }
  }

  async stop(): Promise<void> {
    this._state = 'STOPPING'
    this.emitter.emit('runtime:stopping')
    if (this._runtime) await new ShutdownPipeline(this._runtime).execute()
    this._state = 'STOPPED'
    this.emitter.emit('runtime:stopped')
  }
}
