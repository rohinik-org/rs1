import type { NetworkRequest, NetworkResponse } from '@rohinik-org/compiler'
import type { NetworkClient } from '../client/network-client.js'
import type { NetworkJournal } from '../journal/network-journal.js'

export class RetryEngine implements NetworkClient {
  constructor(
    private readonly inner: NetworkClient,
    private readonly maxAttempts: number,
    private readonly baseDelayMs: number = 100,
    private readonly journal?: NetworkJournal,
  ) {}

  async request(req: NetworkRequest): Promise<NetworkResponse> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (attempt > 1) {
        this.journal?.record({ requestId: req.requestId, timestamp: new Date().toISOString(), kind: 'RETRY_STARTED', url: req.url })
        await new Promise(r => setTimeout(r, this.baseDelayMs * 2 ** (attempt - 2)))
      }
      try {
        const res = await this.inner.request(req)
        if (attempt > 1) {
          this.journal?.record({ requestId: req.requestId, timestamp: new Date().toISOString(), kind: 'RETRY_COMPLETED', url: req.url, status: res.status })
        }
        return res
      } catch (err) {
        lastError = err
      }
    }
    throw lastError
  }
}
