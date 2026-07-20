import type {
  ExecutionDriver,
  DriverDescriptor,
  DriverHealth,
  DriverRequest,
  DriverRawEvent,
} from '@rohinik-org/capability-manifest'
import { DriverErrorCode, makeDriverError, RUNTIME_API_VERSION } from '@rohinik-org/capability-manifest'
import { DuckDuckGoAdapter } from './duckduckgo-adapter.js'
import type { HttpSearchClient } from './search-adapter.js'

export const SEARCH_CAPABILITY_IDS = [
  'search:web',
  'search:web-page',
  'search:image',
] as const

const DESCRIPTOR: DriverDescriptor = {
  id: 'search',
  version: '0.1.0',
  apiVersion: RUNTIME_API_VERSION,
  priority: 10,
  tags: ['search', 'web', 'duckduckgo'],
  capabilities: {
    supportsStreaming: false,
    supportsCancellation: false,
    supportsProgress: false,
    supportsHealth: true,
    offline: false,
    sandboxed: false,
    trusted: true,
  },
}

export class SearchDriver implements ExecutionDriver {
  readonly descriptor = DESCRIPTOR
  private readonly adapter: DuckDuckGoAdapter

  constructor(http?: HttpSearchClient) {
    this.adapter = new DuckDuckGoAdapter(http)
  }

  async *execute(request: DriverRequest): AsyncIterable<DriverRawEvent> {
    const { capabilityId, input } = request
    const inp = input as Record<string, string>

    yield { type: 'STARTED', payload: {} }

    try {
      switch (capabilityId) {
        case 'search:web': {
          const results = await this.adapter.search(inp.query!)
          yield { type: 'RESULT', payload: results }
          break
        }
        case 'search:web-page': {
          const text = await this.adapter.fetchPage(inp.url!)
          yield { type: 'RESULT', payload: text }
          break
        }
        case 'search:image': {
          // ponytail: DDG HTML search doesn't expose images — return empty for now
          yield { type: 'RESULT', payload: [] }
          break
        }
        default: {
          yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.CAPABILITY_NOT_FOUND, `Unknown capability: ${capabilityId}`) }
          return
        }
      }
    } catch (err) {
      yield { type: 'ERROR', payload: makeDriverError(DriverErrorCode.EXECUTION_FAILED, (err as Error).message, { cause: err }) }
      return
    }

    yield { type: 'COMPLETE', payload: {} }
  }

  async health(): Promise<DriverHealth> {
    try {
      const { NodeHttpClient } = await import('./duckduckgo-adapter.js')
      await new NodeHttpClient().get('https://html.duckduckgo.com/')
      return { status: 'healthy', checkedAt: new Date() }
    } catch {
      return { status: 'degraded', message: 'DDG unreachable', checkedAt: new Date() }
    }
  }

  async shutdown(): Promise<void> {}
}
