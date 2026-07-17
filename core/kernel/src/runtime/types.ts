import type { AiosManifest } from '@rohinik-org/foundation'
import type { DependencyError } from '../manifest/dependency-graph.js'
import type { Logger } from '../domain/context.js'
import type { Runtime } from '@rohinik-org/foundation'

export type RuntimeState = 'STOPPED' | 'STARTING' | 'READY' | 'STOPPING' | 'FAILED'

export interface ActivationPlan {
  readonly manifests: readonly AiosManifest[]
  readonly errors: readonly DependencyError[]
  readonly warnings: readonly string[]
}

export interface ExtensionContext {
  readonly runtime: Runtime
  readonly manifest: AiosManifest
  readonly logger: Logger
}
