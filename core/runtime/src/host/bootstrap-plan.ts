import type { ResolvedConfig } from '../types.js'
import type { BuiltinRegistry } from './builtin-registry.js'

export interface ExtensionBootstrapConfig {
  readonly paths: ReadonlyArray<string>
  readonly failureMode: 'non-fatal' | 'fatal'
}

export interface ServiceBootstrapConfig {
  readonly corpus: boolean
}

export interface BootstrapPlan {
  readonly config: ResolvedConfig
  readonly builtins: BuiltinRegistry
  readonly extensions: ExtensionBootstrapConfig
  readonly services: ServiceBootstrapConfig
  readonly socketPath?: string
}

export function defaultBootstrapPlan(
  config: ResolvedConfig,
  builtins: BuiltinRegistry,
): BootstrapPlan {
  return {
    config,
    builtins,
    extensions: {
      paths: config.extensions.paths,
      failureMode: 'non-fatal',
    },
    services: {
      corpus: true,
    },
  }
}
