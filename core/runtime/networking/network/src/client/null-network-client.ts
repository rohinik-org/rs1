import type { NetworkRequest, NetworkResponse } from '@rohinik-org/compiler'
import type { NetworkClient } from './network-client.js'

export interface NullNetworkClientOptions {
  status?: number
  body?: string
  headers?: Record<string, string>
  latencyMs?: number
}

export class NullNetworkClient implements NetworkClient {
  constructor(private readonly opts: NullNetworkClientOptions = {}) {}

  async request(req: NetworkRequest): Promise<NetworkResponse> {
    return {
      requestId: req.requestId,
      status: this.opts.status ?? 200,
      headers: this.opts.headers ?? {},
      body: this.opts.body ?? '',
      receivedAt: new Date().toISOString(),
      latencyMs: this.opts.latencyMs ?? 0,
    }
  }
}
