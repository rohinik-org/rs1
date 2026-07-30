import { describe, it, expect } from 'vitest'
import { TrustDecisionEngine } from '@rohinik-org/package-trust-decision'
import { buildStage9JTestSystem } from '../scenarios/test-system-builder.js'
import {
  makeTrustedDecisionRequest,
  makeAuthorizationRequest,
  makeTrustSnapshot,
  AUTH_POLICY,
  ISSUED_AT,
  TRUSTED_PUBLISHER,
  MANUAL_REVIEW_PUBLISHER,
} from '../fixtures/index.js'

describe('degraded paths', () => {
  it('manual-review publisher → manual-review-required decision', () => {
    const engine = new TrustDecisionEngine()
    const result = engine.decide(makeTrustedDecisionRequest({ publisherAssessment: MANUAL_REVIEW_PUBLISHER }))
    expect(result.decision).toBe('manual-review-required')
  })

  it('manual-review trust → no automatic provisioning authorization', async () => {
    const snapshot = makeTrustSnapshot('manual-review-required')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(['manual-review-required', 'denied']).toContain(result.decision.outcome)
  })

  it('conditionally-trusted snapshot → authorized-with-conditions', async () => {
    const snapshot = makeTrustSnapshot('conditionally-trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(result.decision.outcome).toBe('authorized-with-conditions')
  })

  it('conditionally-trusted — conditions present on decision', async () => {
    const snapshot = makeTrustSnapshot('conditionally-trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(result.decision.conditions.length).toBeGreaterThan(0)
  })

  it('missing trust snapshot → denied provisioning', async () => {
    const { harness } = buildStage9JTestSystem([]) // no snapshots
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    expect(result.decision.outcome).toBe('denied')
  })

  it('degraded trust — conditions enforced downstream', async () => {
    const snapshot = makeTrustSnapshot('conditionally-trusted')
    const { harness } = buildStage9JTestSystem([snapshot])
    const result = await harness.authorizeProvisioning(
      makeAuthorizationRequest(),
      AUTH_POLICY, [], [], ISSUED_AT,
    )
    // Conditions array must be non-empty for authorized-with-conditions
    if (result.decision.outcome === 'authorized-with-conditions') {
      expect(result.decision.conditions.length).toBeGreaterThan(0)
    }
  })
})
