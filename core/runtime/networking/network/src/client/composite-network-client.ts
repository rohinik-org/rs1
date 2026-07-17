import type { NetworkRequest, NetworkResponse } from '@rohinik-org/compiler'
import type { NetworkClient } from './network-client.js'
import type { NetworkSecurityPolicy } from '../types/policies.js'
import type { NetworkJournal } from '../journal/network-journal.js'
import type { NetworkCache } from '../cache/network-cache.js'
import type { AuthProvider } from '../auth/auth-provider.js'
import { RateLimiter } from '../rate-limit/rate-limiter.js'
import { RobotsChecker } from '../robots/robots-checker.js'

export interface CompositeNetworkClientOptions {
  securityPolicy?: NetworkSecurityPolicy
  cache?: NetworkCache
  rateLimiter?: RateLimiter
  authProvider?: AuthProvider
  robotsChecker?: RobotsChecker
  journal?: NetworkJournal
}

// ponytail: pipeline order is constitutional — see ADR-003 in Stage 6E plan
export class CompositeNetworkClient implements NetworkClient {
  constructor(
    private readonly inner: NetworkClient,
    private readonly opts: CompositeNetworkClientOptions = {},
  ) {}

  async request(req: NetworkRequest): Promise<NetworkResponse> {
    const { securityPolicy, cache, rateLimiter, authProvider, robotsChecker, journal } = this.opts

    // 1. Security
    if (securityPolicy) {
      const url = req.url.toLowerCase()
      const blocked = securityPolicy.blockedDomains?.some(d => url.includes(d))
      if (blocked) {
        journal?.record({ requestId: req.requestId, timestamp: new Date().toISOString(), kind: 'SECURITY_BLOCKED', url: req.url })
        throw new Error(`Blocked by security policy: ${req.url}`)
      }
    }

    // 2. Robots
    if (robotsChecker) {
      const allowed = await robotsChecker.isAllowed(req.url)
      if (!allowed) {
        journal?.record({ requestId: req.requestId, timestamp: new Date().toISOString(), kind: 'ROBOTS_BLOCKED', url: req.url })
        throw new Error(`Blocked by robots.txt: ${req.url}`)
      }
    }

    // 3. Cache
    const cacheKey = `${req.method}:${req.url}`
    if (cache) {
      const cached = cache.get(cacheKey)
      if (cached) {
        journal?.record({ requestId: req.requestId, timestamp: new Date().toISOString(), kind: 'CACHE_HIT', url: req.url })
        return cached
      }
      journal?.record({ requestId: req.requestId, timestamp: new Date().toISOString(), kind: 'CACHE_MISS', url: req.url })
    }

    // 4. Rate limit
    if (rateLimiter && !rateLimiter.tryAcquire(req.url)) {
      journal?.record({ requestId: req.requestId, timestamp: new Date().toISOString(), kind: 'RATE_LIMIT_DELAY', url: req.url })
      throw new Error(`Rate limited: ${req.url}`)
    }

    // 5. Auth
    const authedReq = authProvider ? authProvider.apply(req) : req
    if (authProvider) {
      journal?.record({ requestId: authedReq.requestId, timestamp: new Date().toISOString(), kind: 'AUTH_APPLIED', url: authedReq.url })
    }

    // 6. Fetch
    journal?.record({ requestId: authedReq.requestId, timestamp: new Date().toISOString(), kind: 'REQUEST_STARTED', url: authedReq.url })
    const res = await this.inner.request(authedReq)
    journal?.record({ requestId: res.requestId, timestamp: new Date().toISOString(), kind: 'REQUEST_COMPLETED', url: authedReq.url, status: res.status, latencyMs: res.latencyMs })

    if (cache) cache.set(cacheKey, res, 300_000)
    return res
  }
}
