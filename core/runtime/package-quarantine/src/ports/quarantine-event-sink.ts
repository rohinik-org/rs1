import type { PackageQuarantineEvent } from '../types.js'

export interface QuarantineEventSink {
  publish(event: PackageQuarantineEvent): Promise<void>
}
