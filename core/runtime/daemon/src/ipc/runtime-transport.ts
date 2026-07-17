import type { RuntimeCommand, RuntimeResponse } from '@rohinik-org/compiler'

export interface RuntimeTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(command: RuntimeCommand): Promise<RuntimeResponse>
}
