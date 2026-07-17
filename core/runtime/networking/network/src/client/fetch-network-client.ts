import type { NetworkRequest, NetworkResponse } from '@rohinik-org/compiler'
import type { NetworkClient } from './network-client.js'

export class FetchNetworkClient implements NetworkClient {
  async request(req: NetworkRequest): Promise<NetworkResponse> {
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), req.timeoutMs)

    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        ...(req.body !== undefined ? { body: req.body } : {}),
        signal: controller.signal,
      })
      const body = await res.text()
      const latencyMs = Date.now() - start
      const headers: Record<string, string> = {}
      res.headers.forEach((v, k) => { headers[k] = v })
      return {
        requestId: req.requestId,
        status: res.status,
        headers,
        body,
        receivedAt: new Date().toISOString(),
        latencyMs,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
