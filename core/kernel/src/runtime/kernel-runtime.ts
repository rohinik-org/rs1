import type { Runtime, SdkCapability, SdkProvider, SdkServices } from '@rohinik-org/foundation'
import type { RuntimeRegistry } from './runtime-registry.js'
import type { RuntimeServices } from '../domain/context.js'
import type { ActivationPlan, RuntimeState } from './types.js'

export class KernelRuntime implements Runtime {
  readonly version = '0.1.0'
  private _state: RuntimeState = 'STOPPED'
  private shutdownHandlers: Array<() => void | Promise<void>> = []

  constructor(
    private readonly registry: RuntimeRegistry,
    private readonly _services: RuntimeServices,
  ) {}

  get state(): RuntimeState {
    return this._state
  }

  private readonly _sdkServices: SdkServices = {
    logger: {
      info: (msg, data) => this._services.logger.info(msg, data),
      error: (msg, data) => this._services.logger.error(msg, data),
    },
  }

  get services(): SdkServices {
    return this._sdkServices
  }

  registerCapability(capability: SdkCapability): void {
    this.registry.registerCapability(capability)
  }

  registerProvider(provider: SdkProvider): void {
    this.registry.registerProvider(provider)
  }

  listCapabilities(): Array<{ skillId: string; name: string; tierId: string; version: string }> {
    return this.registry.listRegisteredSkills()
  }

  onShutdown(fn: () => void | Promise<void>): void {
    this.shutdownHandlers.push(fn)
  }

  async activate(plan: ActivationPlan): Promise<void> {
    if (this._state !== 'STOPPED') {
      throw new Error(`Cannot activate: runtime is in state '${this._state}'`)
    }
    this._state = 'STARTING'

    if (plan.errors.length > 0) {
      this._state = 'FAILED'
      const messages = plan.errors.map(e => e.message).join('; ')
      throw new Error(`Cannot activate: dependency errors present — ${messages}`)
    }

    try {
      for (const manifest of plan.manifests) {
        const module = await this._dynamicImport(manifest.entry)
        if (typeof module.activate !== 'function') {
          throw new Error(`Extension '${manifest.id}' does not export an activate() function`)
        }
        await module.activate(this)
      }
      this._state = 'READY'
    } catch (err) {
      this._state = 'FAILED'
      throw err
    }
  }

  async shutdown(): Promise<void> {
    this._state = 'STOPPING'
    const errors: unknown[] = []
    for (const handler of [...this.shutdownHandlers].reverse()) {
      try {
        await handler()
      } catch (err) {
        errors.push(err)
      }
    }
    this._state = 'STOPPED'
    if (errors.length > 0) {
      // Report first error; all handlers still ran
      throw errors[0]
    }
  }

  protected async _dynamicImport(entry: string): Promise<{ activate: (runtime: Runtime) => void | Promise<void> }> {
    return import(entry)
  }
}
