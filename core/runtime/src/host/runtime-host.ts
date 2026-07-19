import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
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
  private readonly _registeredProviders: Array<{ id: string; name: string; status: 'HEALTHY' | 'UNAVAILABLE' }> = []

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

  listProviders(): Array<{ id: string; name: string; status: 'HEALTHY' | 'UNAVAILABLE' }> {
    return [...this._registeredProviders]
  }

  async start(): Promise<void> {
    if (this._state !== 'STOPPED') {
      throw new Error(`Cannot start: RuntimeHost is in state '${this._state}'`)
    }
    this._state = 'INITIALIZING'
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

      // Wire providers from rohinik.yaml config
      await this.registerConfiguredProviders(kernelRuntime)

      // Register built-in reasoning capability if any provider loaded
      if (this._registeredProviders.length > 0) {
        this.registerBuiltinReasoningCapability(kernelRuntime)
      }

      this._state = 'READY'
      this.emitter.emit('runtime:ready')
    } catch (err) {
      this._state = 'FAILED'
      throw err
    }
  }

  private registerBuiltinReasoningCapability(runtime: KernelRuntime): void {
    // ponytail: catch-all reasoning skill — routes any unmatched request to the
    // first available REASONING_ENGINE provider. Installed capabilities take
    // priority (higher score wins).
    const skill = {
      metadata: {
        skillId: 'builtin:reasoning',
        name: 'Reasoning',
        tierId: 'REASONING' as const,
        version: '1.0.0',
        executionModel: 'NETWORK' as const,
        requirements: { providerCapabilities: { reasoningEngine: true } },
        matching: { matcher: { match: () => ({ matched: true as const, score: 0.5, explanation: [] }) } },
      },
      estimatedCost: () => ({ estimated: { tokens: 1000, usd: 0.01, cpuMs: 2000 } }),
      evaluate: () => ({ matched: true as const, score: 0.5, explanation: [] }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (ctx: any, providers: any) => {
        const provider = providers['reasoningEngine']?.provider
        if (!provider?.reason) {
          return {
            status: 'FAILURE' as const, result: undefined,
            skillId: 'builtin:reasoning', stepId: 'step-0',
            diagnostics: [{ code: 'NO_PROVIDER', message: 'No reasoning provider available' }],
            metrics: { durationMs: 0, resourceCost: { estimated: { cpuMs: 0 } }, cacheHit: false },
            cacheable: false, retryable: false,
          }
        }
        return provider.reason({ prompt: ctx.request.content }, ctx)
      },
    }
    runtime.registerCapability({
      metadata: {
        capabilityId: 'builtin:reasoning',
        name: 'Built-in Reasoning',
        version: '1.0.0',
        contractVersion: '1.0',
        description: 'Catch-all reasoning capability backed by the configured provider',
        category: 'reasoning' as const,
        tags: ['builtin', 'reasoning'],
        execution: { tierId: 'REASONING' as const },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      skills: [skill as any],
    })
  }

  private async registerConfiguredProviders(runtime: KernelRuntime): Promise<void> {
    const { providers } = this.config
    const driverPaths: Record<string, string[]> = {
      anthropic: ['core/drivers/anthropic/dist/index.js'],
      openai:    ['core/drivers/openai/dist/index.js'],
    }

    // ponytail: dynamic import keeps runtime decoupled from driver packages at compile time
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadDriver = async (pkg: string, paths: string[]): Promise<any> => {
      try {
        const req = createRequire(process.cwd() + '/package.json')
        return await import(req.resolve(pkg))
      } catch { /* fall through */ }
      for (const rel of paths) {
        const candidate = resolve(process.cwd(), rel)
        if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
      }
      return null
    }

    for (const [name, cfg] of Object.entries(providers)) {
      if (!cfg.apiKey) continue
      try {
        const paths = driverPaths[name] ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await loadDriver(`@rohinik-org/${name}`, paths)
        if (!mod) continue
        if (name === 'anthropic' && mod.AnthropicProvider) {
          const provider = new mod.AnthropicProvider({
            apiKey: cfg.apiKey,
            ...(cfg.baseUrl && { baseUrl: cfg.baseUrl }),
          })
          runtime.registerProvider(provider)
          this._registeredProviders.push({ id: 'anthropic', name: provider.metadata?.name ?? 'Anthropic', status: 'HEALTHY' })
        } else if (name === 'openai' && mod.OpenAIProvider) {
          const provider = new mod.OpenAIProvider({
            apiKey: cfg.apiKey,
            ...(cfg.baseUrl && { baseUrl: cfg.baseUrl }),
          })
          runtime.registerProvider(provider)
          this._registeredProviders.push({ id: 'openai', name: provider.metadata?.name ?? 'OpenAI', status: 'HEALTHY' })
        }
      } catch { /* driver not installed — skip silently */ }
    }
  }

  async stop(): Promise<void> {
    this._state = 'STOPPING'
    this.emitter.emit('runtime:stopping')
    if (this._runtime) {
      await this._runtime.shutdown()
    }
    this._state = 'STOPPED'
    this.emitter.emit('runtime:stopped')
  }
}
