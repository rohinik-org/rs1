import type { ServiceStatus } from '@rohinik-org/compiler'

export interface RuntimeService {
  readonly serviceId: string
  start(): Promise<void>
  stop(): Promise<void>
  health(): Promise<ServiceStatus>
}
