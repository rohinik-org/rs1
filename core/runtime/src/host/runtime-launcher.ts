import { createProductionHost } from './production-runtime.js'
import { RuntimeHost } from './runtime-host.js'
import type { ResolvedConfig } from '../types.js'

export class RuntimeLauncher {
  private static _instance: RuntimeHost | undefined

  static async attach(config: ResolvedConfig, socketPath?: string): Promise<RuntimeHost> {
    if (RuntimeLauncher._instance && RuntimeLauncher._instance.state === 'READY') {
      return RuntimeLauncher._instance
    }
    const host = createProductionHost(config, socketPath)
    await host.start()
    RuntimeLauncher._instance = host
    return host
  }

  static async detach(): Promise<void> {
    const instance = RuntimeLauncher._instance
    if (!instance) return
    RuntimeLauncher._instance = undefined
    if (instance.state === 'READY') {
      await instance.stop()
    }
  }

  static get current(): RuntimeHost | undefined {
    return RuntimeLauncher._instance
  }

  // ponytail: module-level singleton is sufficient; no process-level lifecycle needed
  static _reset(): void {
    RuntimeLauncher._instance = undefined
  }
}
