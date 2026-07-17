import { EventEmitter } from 'node:events'
import {
  InMemoryCapabilityCatalog,
  DefaultExecutionResolver,
  RuntimeBuilder,
  KernelRuntime,
  AiosRouter,
  ManifestLoader,
  ManifestParser,
  ManifestValidator,
  CapabilityDependencyGraph,
  DEFAULT_SYSTEM_CONFIG,
  createRuntimeServices,
  MemoryTier,
  DeterministicTier,
  LocalToolTier,
  ExternalTier,
  ReasoningTier,
  ExecutionContextFactory,
  SingleStepPlanner,
  ExecutionEngine,
} from '@rohinik-org/kernel'
import type { ResolvedConfig, RuntimeHostState, RuntimeHostEvent } from '../types.js'

export class RuntimeHost {
  private _state: RuntimeHostState = 'STOPPED'
  private _runtime: KernelRuntime | undefined
  private _router: AiosRouter | undefined
  private readonly emitter = new EventEmitter()

  constructor(readonly config: ResolvedConfig) {}

  get state(): RuntimeHostState {
    return this._state
  }

  get runtimeId(): string {
    return this.config.runtimeId
  }

  get runtime(): KernelRuntime {
    if (!this._runtime) throw new Error('RuntimeHost not started')
    return this._runtime
  }

  get router(): AiosRouter {
    if (!this._router) throw new Error('RuntimeHost not started')
    return this._router
  }

  on(event: RuntimeHostEvent, handler: () => void): void {
    this.emitter.on(event, handler)
  }

  async start(): Promise<void> {
    if (this._state !== 'STOPPED') {
      throw new Error(`Cannot start: RuntimeHost is in state '${this._state}'`)
    }
    this._state = 'STARTING'
    try {
      const systemConfig = DEFAULT_SYSTEM_CONFIG
      const services = createRuntimeServices(systemConfig)
      const catalog = new InMemoryCapabilityCatalog()
      const resolver = new DefaultExecutionResolver(systemConfig)

      const kernelRuntime = new RuntimeBuilder(catalog, resolver, services).build()
      this._runtime = kernelRuntime

      let activated = false
      try {
        const loader = new ManifestLoader(
          new ManifestParser(),
          new ManifestValidator(systemConfig.runtime.manifest, '0.1.0'),
          new CapabilityDependencyGraph(),
        )
        const plan = await loader.load(this.config.extensions.paths)
        if (plan.manifests.length > 0) {
          await kernelRuntime.activate(plan)
          activated = true
        }
      } catch {
        // Extension load failure is non-fatal — runtime starts without extensions
      }

      if (!activated) {
        await kernelRuntime.activate({ manifests: [], errors: [], warnings: [] })
      }

      const factory = new ExecutionContextFactory(systemConfig, services)
      const planner = new SingleStepPlanner()
      const engine = new ExecutionEngine(catalog)
      const tiers = [
        new MemoryTier(catalog, resolver),
        new DeterministicTier(catalog, resolver),
        new LocalToolTier(catalog, resolver),
        new ExternalTier(catalog, resolver),
        new ReasoningTier(catalog, resolver),
      ]
      this._router = new AiosRouter(tiers, factory, planner, engine)

      this._state = 'READY'
      this.emitter.emit('runtime:ready')
    } catch (err) {
      this._state = 'FAILED'
      throw err
    }
  }

  async stop(): Promise<void> {
    if (this._state === 'STOPPED') return
    this._state = 'STOPPING'
    this.emitter.emit('runtime:stopping')
    if (this._runtime) {
      await this._runtime.shutdown()
    }
    this._state = 'STOPPED'
    this.emitter.emit('runtime:stopped')
  }
}
