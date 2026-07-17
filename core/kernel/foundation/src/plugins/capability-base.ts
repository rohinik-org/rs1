import type { Runtime } from '../index.js'
import type { SdkCapabilityMetadata, SdkSkill, SdkCapability } from '../index.js'

export abstract class Capability implements SdkCapability {
  abstract readonly metadata: SdkCapabilityMetadata
  abstract readonly skills: readonly SdkSkill[]

  activate(_runtime: Runtime): void | Promise<void> {}
  deactivate(): void | Promise<void> {}
}
