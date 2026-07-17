export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'PATCH'

export type NetworkJournalEntryKind =
  | 'REQUEST_STARTED'
  | 'REQUEST_COMPLETED'
  | 'REQUEST_FAILED'
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'RATE_LIMIT_DELAY'
  | 'AUTH_APPLIED'
  | 'RETRY_STARTED'
  | 'RETRY_COMPLETED'
  | 'ROBOTS_BLOCKED'
  | 'SECURITY_BLOCKED'

export interface NetworkRequest {
  readonly requestId: string
  readonly method: HttpMethod
  readonly url: string
  readonly headers: Record<string, string>
  readonly body?: string
  readonly timeoutMs: number
}

export interface NetworkResponse {
  readonly requestId: string
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
  readonly receivedAt: string
  readonly latencyMs: number
}

export interface NetworkJournalEntry {
  readonly requestId: string
  readonly timestamp: string
  readonly kind: NetworkJournalEntryKind
  readonly url?: string
  readonly status?: number
  readonly latencyMs?: number
  readonly reason?: string
}

export interface NetworkMetrics {
  readonly requestCount: number
  readonly successCount: number
  readonly failureCount: number
  readonly cacheHitRate: number
  readonly averageLatencyMs: number
  readonly averageResponseSizeBytes: number
}
