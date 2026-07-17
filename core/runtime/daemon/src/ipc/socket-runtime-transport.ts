import type { RuntimeCommand, RuntimeResponse } from '@rohinik-org/compiler'
import { IpcClient } from './ipc-client.js'
import type { RuntimeTransport } from './runtime-transport.js'

export class SocketRuntimeTransport implements RuntimeTransport {
  private readonly client: IpcClient

  constructor(socketPath: string, timeoutMs?: number) {
    this.client = new IpcClient(socketPath, timeoutMs)
  }

  async connect(): Promise<void> { await this.client.connect() }
  async disconnect(): Promise<void> { this.client.disconnect() }
  async send(command: RuntimeCommand): Promise<RuntimeResponse> { return this.client.send(command) }
}
