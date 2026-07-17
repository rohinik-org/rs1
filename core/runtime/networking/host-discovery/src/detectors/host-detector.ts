import type { HostObservation, HostResourceType } from '@rohinik-org/compiler'

export interface HostDetector {
  readonly name: string                     // 'python'
  readonly id: string                       // 'rohinik://host/python'
  readonly resourceType: HostResourceType
  detect(): Promise<HostObservation | null>
}
