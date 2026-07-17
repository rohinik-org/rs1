import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NETWORK_SECURITY_POLICY,
  DEFAULT_RATE_LIMIT_POLICY,
  DEFAULT_CACHE_POLICY,
  DEFAULT_AUTHENTICATION_POLICY,
  DEFAULT_RETRY_POLICY,
} from '../types/policies.js'

describe('network policies', () => {
  it('all defaults exist', () => {
    expect(DEFAULT_NETWORK_SECURITY_POLICY).toBeDefined()
    expect(DEFAULT_RATE_LIMIT_POLICY).toBeDefined()
    expect(DEFAULT_CACHE_POLICY).toBeDefined()
    expect(DEFAULT_AUTHENTICATION_POLICY).toBeDefined()
    expect(DEFAULT_RETRY_POLICY).toBeDefined()
  })

  it('default auth type is NONE', () => {
    expect(DEFAULT_AUTHENTICATION_POLICY.type).toBe('NONE')
  })

  it('defaults are conservative (reasonable limits)', () => {
    expect(DEFAULT_NETWORK_SECURITY_POLICY.defaultTimeoutMs).toBeGreaterThan(0)
    expect(DEFAULT_RATE_LIMIT_POLICY.requestsPerSecond).toBeGreaterThan(0)
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBeGreaterThan(0)
  })
})
