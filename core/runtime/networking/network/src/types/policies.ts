export interface NetworkSecurityPolicy {
  readonly blockedDomains: readonly string[]
  readonly allowedDomains: readonly string[]   // empty = allow all non-blocked
  readonly maxResponseSizeBytes: number
  readonly defaultTimeoutMs: number
}

export const DEFAULT_NETWORK_SECURITY_POLICY: NetworkSecurityPolicy = {
  blockedDomains: [],
  allowedDomains: [],
  maxResponseSizeBytes: 10 * 1024 * 1024,  // 10 MB
  defaultTimeoutMs: 30000,
}

export interface RateLimitPolicy {
  readonly requestsPerSecond: number
  readonly burstSize: number
}

export const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy = {
  requestsPerSecond: 2,
  burstSize: 5,
}

export interface CachePolicy {
  readonly defaultTtlMs: number
  readonly maxEntries: number
}

export const DEFAULT_CACHE_POLICY: CachePolicy = {
  defaultTtlMs: 5 * 60 * 1000,  // 5 minutes
  maxEntries: 200,
}

export type AuthenticationType = 'NONE' | 'API_KEY' | 'BEARER'

export interface AuthenticationPolicy {
  readonly type: AuthenticationType
  readonly headerName?: string
  readonly token?: string
}

export const DEFAULT_AUTHENTICATION_POLICY: AuthenticationPolicy = {
  type: 'NONE',
}

export interface NetworkRetryPolicy {
  readonly maxAttempts: number
  readonly initialDelayMs: number
  readonly backoffMultiplier: number
  readonly retryableStatuses: readonly number[]
}

export const DEFAULT_RETRY_POLICY: NetworkRetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 500,
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
}
