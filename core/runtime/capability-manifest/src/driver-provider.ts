import type { DriverBinding } from './driver-types.js'

export interface DriverProviderEntry {
  readonly binding: DriverBinding
  readonly capabilityIds: ReadonlyArray<string>
}

export interface DriverProvider {
  readonly id: string
  readonly type: 'builtin' | 'plugin' | 'enterprise' | 'remote'
  load(): Promise<ReadonlyArray<DriverProviderEntry>>
}
