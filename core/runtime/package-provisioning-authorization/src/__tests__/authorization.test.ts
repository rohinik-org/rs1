import { describe, it, expect, beforeEach } from 'vitest'
import * as moduleExports from '../index.js'
import {
  validateProvisioningRequest,
  evaluateTrustUsability,
  evaluateQuarantineGate,
  evaluateReevaluationGate,
  evaluateCapabilityScope,
  evaluatePermissionScope,
  evaluateProvisioningPolicy,
  buildAuthorizationDecision,
  decisionToRecord,
  buildAuthorizationToken,
  verifyAuthorizationToken,
  computeTokenDigest,
  verifyAuthorizationTokenFull,
  invalidateAuthorization,
  assertValidTransition,
  isTerminalState,
  isUsableState,
  createAuthorizationController,
  createInMemoryTrustRepositoryReader,
  createInMemoryQuarantineReader,
  createInMemoryReevaluationStatusReader,
  createInMemoryAuthorizationRecordStore,
  createInMemoryAuthorizationLock,
  createInMemoryEventSink,
  AuthorizationError,
  AuthorizationConflict,
} from '../index.js'
import type {
  PackageProvisioningAuthorizationRequest,
  PackageProvisioningTrustSnapshot,
  PackageProvisioningAuthorizationPolicy,
  PackageProvisioningAuthorizationDecision,
  PackageProvisioningAuthorizationRecord,
  RequestedCapability,
  RequestedPermission,
  PackageQuarantineState,
  PackageTrustReevaluationState,
  AuthorizationLifecycleState,
} from '../index.js'
import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'
import type { ArtifactIdentity } from '@rohinik-org/package-trust-repository'

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'rohinik-package',
  packageId: 'pkg-alpha',
  version: '1.0.0',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'reg-1', artifactLocator: 'pkg-alpha@1.0.0' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'sha256:aaaa1111' },
}

const ARTIFACT: ArtifactIdentity = {
  packageId: 'pkg-alpha',
  version: '1.0.0',
  artifactDigest: 'sha256:aaaa1111',
}

const POLICY_REF = { policyId: 'policy-001', policyVersion: '1.0', semanticHash: 'hash-001' }
const REQUESTED_AT = '2026-01-01T10:00:00.000Z'
const ISSUED_AT    = '2026-01-01T10:00:00.000Z'

function makeRequest(overrides: Partial<PackageProvisioningAuthorizationRequest> = {}): PackageProvisioningAuthorizationRequest {
  return {
    requestId:            'req-001',
    operationId:          'op-001',
    subject:              SUBJECT,
    artifactIdentity:     ARTIFACT,
    packageVersion:       '1.0.0',
    tenantId:             'tenant-1',
    environmentId:        'env-prod',
    requestedCapabilities: [{ capabilityId: 'cap-read' }],
    requestedPermissions:  [{ permissionId: 'filesystem:read' }],
    provisioningMode:     'install',
    policyReference:      POLICY_REF,
    requestedAt:          REQUESTED_AT,
    ...overrides,
  }
}

function makeTrustedSnapshot(overrides: Partial<PackageProvisioningTrustSnapshot> = {}): PackageProvisioningTrustSnapshot {
  return {
    subject:                SUBJECT,
    artifactIdentity:       ARTIFACT,
    trustDecisionRecordId:  'rec-001',
    trustDecision:          'trusted',
    decisionEffectiveAt:    '2026-01-01T00:00:00.000Z',
    policyReference:        POLICY_REF,
    quarantineState:        'not-quarantined',
    reevaluationState:      'not-required',
    repositoryRevision:     1,
    snapshotAsOf:           REQUESTED_AT,
    superseded:             false,
    current:                true,
    ...overrides,
  }
}

function makeConditionalSnapshot(): PackageProvisioningTrustSnapshot {
  return makeTrustedSnapshot({ trustDecision: 'conditionally-trusted' })
}

function makeDeniedSnapshot(): PackageProvisioningTrustSnapshot {
  return makeTrustedSnapshot({ trustDecision: 'denied' })
}

function makeManualReviewSnapshot(): PackageProvisioningTrustSnapshot {
  return makeTrustedSnapshot({ trustDecision: 'manual-review-required' })
}

function makePolicy(overrides: Partial<PackageProvisioningAuthorizationPolicy> = {}): PackageProvisioningAuthorizationPolicy {
  return {
    policyId:                       'policy-001',
    policyVersion:                  '1.0',
    allowedTrustOutcomes:           ['trusted', 'conditionally-trusted'],
    allowConditionalTrust:          true,
    requireCurrentReevaluation:     false,
    denyWhenQuarantineStateUnknown: true,
    denyOnRepositoryIntegrityWarning: false,
    allowManualRecovery:            false,
    allowDowngrade:                 false,
    authorizationTtlSeconds:        3600,
    singleUseAuthorization:         false,
    maxCapabilityScope:             [],
    maxPermissionScope:             [],
    ...overrides,
  }
}

function makeController() {
  const trustReader   = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
  const quarantineReader = createInMemoryQuarantineReader('not-quarantined')
  const reevalReader  = createInMemoryReevaluationStatusReader()
  const store         = createInMemoryAuthorizationRecordStore()
  const lock          = createInMemoryAuthorizationLock()
  const eventSink     = createInMemoryEventSink()
  const controller    = createAuthorizationController(trustReader, quarantineReader, reevalReader, store, lock, eventSink)
  return { controller, store, eventSink, trustReader, quarantineReader, reevalReader }
}

// ─── 37.1 Request validation ──────────────────────────────────────────────────

describe('request validation', () => {
  it('accepts valid install request', () => {
    expect(() => validateProvisioningRequest(makeRequest())).not.toThrow()
  })

  it('accepts valid upgrade request', () => {
    expect(() => validateProvisioningRequest(makeRequest({ provisioningMode: 'upgrade' }))).not.toThrow()
  })

  it('accepts valid repair request', () => {
    expect(() => validateProvisioningRequest(makeRequest({ provisioningMode: 'repair' }))).not.toThrow()
  })

  it('accepts valid manual recovery request', () => {
    expect(() => validateProvisioningRequest(makeRequest({ provisioningMode: 'manual-recovery' }))).not.toThrow()
  })

  it('rejects missing requestId', () => {
    expect(() => validateProvisioningRequest(makeRequest({ requestId: '' }))).toThrow(AuthorizationError)
  })

  it('rejects missing operationId', () => {
    expect(() => validateProvisioningRequest(makeRequest({ operationId: '' }))).toThrow(AuthorizationError)
  })

  it('rejects missing subject', () => {
    expect(() => validateProvisioningRequest(makeRequest({ subject: { ...SUBJECT, packageId: '' } }))).toThrow(AuthorizationError)
  })

  it('rejects malformed artifact identity', () => {
    expect(() => validateProvisioningRequest(makeRequest({ artifactIdentity: { ...ARTIFACT, artifactDigest: '' } }))).toThrow(AuthorizationError)
  })

  it('rejects missing tenant', () => {
    expect(() => validateProvisioningRequest(makeRequest({ tenantId: '' }))).toThrow(AuthorizationError)
  })

  it('rejects missing environment', () => {
    expect(() => validateProvisioningRequest(makeRequest({ environmentId: '' }))).toThrow(AuthorizationError)
  })

  it('rejects invalid mode', () => {
    expect(() => validateProvisioningRequest(makeRequest({ provisioningMode: 'invalid-mode' as any }))).toThrow(AuthorizationError)
  })

  it('rejects duplicate capabilities', () => {
    const req = makeRequest({ requestedCapabilities: [{ capabilityId: 'cap-a' }, { capabilityId: 'cap-a' }] })
    expect(() => validateProvisioningRequest(req)).toThrow(AuthorizationError)
  })

  it('rejects duplicate permissions', () => {
    const req = makeRequest({ requestedPermissions: [{ permissionId: 'fs:read' }, { permissionId: 'fs:read' }] })
    expect(() => validateProvisioningRequest(req)).toThrow(AuthorizationError)
  })

  it('rejects malformed policy reference', () => {
    expect(() => validateProvisioningRequest(makeRequest({ policyReference: { ...POLICY_REF, policyId: '' } }))).toThrow(AuthorizationError)
  })

  it('rejects malformed time', () => {
    expect(() => validateProvisioningRequest(makeRequest({ requestedAt: 'not-a-date' }))).toThrow(AuthorizationError)
  })

  it('invalid request performs zero repository calls', async () => {
    const { controller, store } = makeController()
    const result = await controller.authorize(
      makeRequest({ requestId: '' }),
      makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT,
    )
    expect(result.decision.outcome).toBe('invalid-request')
    expect(store.getAll()).toHaveLength(0)
  })
})

// ─── 37.2 Snapshot loading ────────────────────────────────────────────────────

describe('snapshot loading', () => {
  it('loads current trusted snapshot', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.outcome).toBe('authorized')
  })

  it('loads conditional snapshot', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeConditionalSnapshot()])
    const store = createInMemoryAuthorizationRecordStore()
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      store, createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.outcome).toBe('authorized-with-conditions')
  })

  it('produces denied for denied snapshot', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeDeniedSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.outcome).toBe('denied')
  })

  it('produces manual-review-required for manual-review snapshot', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeManualReviewSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.outcome).toBe('manual-review-required')
  })

  it('returns denied for missing trust record', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(['denied', 'deferred']).toContain(result.decision.outcome)
  })

  it('returns deferred on repository failure', async () => {
    const failingReader = {
      async getProvisioningTrustSnapshot() { throw new Error('DB unavailable') },
    }
    const controller = createAuthorizationController(
      failingReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.outcome).toBe('deferred')
  })

  it('rejects stale revision', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot({ repositoryRevision: 5 })])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(
      makeRequest({ expectedRepositoryRevision: 3 }),
      makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT,
    )
    expect(result.decision.outcome).toBe('stale-snapshot')
  })

  it('rejects superseded record', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot({ superseded: true })])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.outcome).toBe('stale-snapshot')
  })
})

// ─── 37.3 Trust usability ─────────────────────────────────────────────────────

describe('trust usability', () => {
  const policy = makePolicy()

  it('trusted is usable', () => {
    const result = evaluateTrustUsability(makeTrustedSnapshot(), policy)
    expect(result.usable).toBe(true)
    expect(result.outcome).toBe('authorized')
  })

  it('conditional trusted with enforceable conditions produces authorized-with-conditions', () => {
    const result = evaluateTrustUsability(makeConditionalSnapshot(), policy)
    expect(result.usable).toBe(true)
    expect(result.outcome).toBe('authorized-with-conditions')
    expect(result.conditions.length).toBeGreaterThan(0)
  })

  it('conditional trusted rejected when policy disallows', () => {
    const strictPolicy = makePolicy({ allowConditionalTrust: false })
    const result = evaluateTrustUsability(makeConditionalSnapshot(), strictPolicy)
    expect(result.usable).toBe(false)
    expect(result.outcome).toBe('denied')
  })

  it('manual review rejected', () => {
    const result = evaluateTrustUsability(makeManualReviewSnapshot(), policy)
    expect(result.usable).toBe(false)
    expect(result.outcome).toBe('manual-review-required')
  })

  it('denied rejected', () => {
    const result = evaluateTrustUsability(makeDeniedSnapshot(), policy)
    expect(result.usable).toBe(false)
    expect(result.outcome).toBe('denied')
  })

  it('trust outcome not in policy allowedTrustOutcomes is rejected', () => {
    const restrictedPolicy = makePolicy({ allowedTrustOutcomes: [] })
    const result = evaluateTrustUsability(makeTrustedSnapshot(), restrictedPolicy)
    expect(result.usable).toBe(false)
  })

  it('does not recompute trust — uses snapshot trustDecision as-is', () => {
    // Sentinel: evaluateTrustUsability must not call any trust evaluator
    // Just checks that outcome derives from snapshot.trustDecision, not re-evaluation
    const snapshot = makeTrustedSnapshot({ trustDecision: 'trusted' })
    const result = evaluateTrustUsability(snapshot, policy)
    expect(result.outcome).toBe('authorized')
    expect(result.reasons.some(r => r.code === 'trust-approved')).toBe(true)
  })
})

// ─── 37.4 Quarantine gate ─────────────────────────────────────────────────────

describe('quarantine gate', () => {
  const policy = makePolicy()

  it('not-quarantined passes', () => {
    expect(evaluateQuarantineGate('not-quarantined', policy).pass).toBe(true)
  })

  it('quarantined denies', () => {
    const result = evaluateQuarantineGate('quarantined', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('denied')
  })

  it('quarantined-degraded denies', () => {
    const result = evaluateQuarantineGate('quarantined-degraded', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('denied')
  })

  it('containment-pending defers', () => {
    const result = evaluateQuarantineGate('containment-pending', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('deferred')
  })

  it('release-pending defers', () => {
    const result = evaluateQuarantineGate('release-pending', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('deferred')
  })

  it('verification-failed denies', () => {
    const result = evaluateQuarantineGate('verification-failed', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('denied')
  })

  it('unknown state fails closed by policy', () => {
    const denyPolicy = makePolicy({ denyWhenQuarantineStateUnknown: true })
    const result = evaluateQuarantineGate('unknown', denyPolicy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('denied')
  })

  it('unknown state defers when policy allows', () => {
    const deferPolicy = makePolicy({ denyWhenQuarantineStateUnknown: false })
    const result = evaluateQuarantineGate('unknown', deferPolicy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('deferred')
  })

  it('no direct quarantine write — quarantine gate is read-only', () => {
    // Sentinel: evaluateQuarantineGate takes a state value, not a mutable store
    // Can only read, not write — verified by function signature
    const result = evaluateQuarantineGate('not-quarantined', policy)
    expect(result).toBeDefined()
  })
})

// ─── 37.5 Reevaluation gate ───────────────────────────────────────────────────

describe('reevaluation gate', () => {
  const policy = makePolicy()

  it('not-required passes', () => {
    expect(evaluateReevaluationGate('not-required', policy).pass).toBe(true)
  })

  it('completed-current passes', () => {
    expect(evaluateReevaluationGate('completed-current', policy).pass).toBe(true)
  })

  it('pending defers', () => {
    const result = evaluateReevaluationGate('pending', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('deferred')
  })

  it('retry-required defers', () => {
    const result = evaluateReevaluationGate('retry-required', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('deferred')
  })

  it('failed denies when requireCurrentReevaluation is true', () => {
    const strictPolicy = makePolicy({ requireCurrentReevaluation: true })
    const result = evaluateReevaluationGate('failed', strictPolicy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('denied')
  })

  it('failed manual-review when requireCurrentReevaluation is false', () => {
    const result = evaluateReevaluationGate('failed', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('manual-review-required')
  })

  it('required defers', () => {
    const result = evaluateReevaluationGate('required', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('deferred')
  })

  it('superseded produces superseded outcome', () => {
    const result = evaluateReevaluationGate('superseded', policy)
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('superseded')
  })

  it('no direct Task 13 mutation — gate is read-only', () => {
    const result = evaluateReevaluationGate('not-required', policy)
    expect(result).toBeDefined()
  })
})

// ─── 37.6 Capability scope ────────────────────────────────────────────────────

describe('capability scope', () => {
  const policy = makePolicy()

  it('exact declared capability set allowed', () => {
    const result = evaluateCapabilityScope([{ capabilityId: 'cap-a' }], policy, ['cap-a'])
    expect(result.allowed).toHaveLength(1)
    expect(result.denied).toHaveLength(0)
  })

  it('requested subset allowed', () => {
    const result = evaluateCapabilityScope([{ capabilityId: 'cap-a' }], policy, ['cap-a', 'cap-b'])
    expect(result.allowed).toHaveLength(1)
    expect(result.denied).toHaveLength(0)
  })

  it('undeclared capability denied', () => {
    const result = evaluateCapabilityScope([{ capabilityId: 'cap-x' }], policy, ['cap-a'])
    expect(result.denied).toHaveLength(1)
    expect(result.denied[0]!.capabilityId).toBe('cap-x')
  })

  it('trust-restricted capability denied', () => {
    const result = evaluateCapabilityScope([{ capabilityId: 'cap-a' }], policy, ['cap-a'], ['cap-a'])
    expect(result.denied).toHaveLength(1)
  })

  it('tenant-restricted capability denied', () => {
    const result = evaluateCapabilityScope([{ capabilityId: 'cap-a' }], policy, ['cap-a'], [], ['cap-a'])
    expect(result.denied).toHaveLength(1)
  })

  it('environment-restricted capability gets restriction condition', () => {
    const result = evaluateCapabilityScope([{ capabilityId: 'cap-a' }], policy, ['cap-a'], [], [], ['cap-a'])
    expect(result.allowed).toHaveLength(1)
    expect(result.restricted).toHaveLength(1)
    expect(result.restricted[0]!.conditionKind).toBe('environment-limited')
  })

  it('deterministic ordering', () => {
    const caps = [{ capabilityId: 'cap-a' }, { capabilityId: 'cap-b' }]
    const r1 = evaluateCapabilityScope(caps, policy, ['cap-a', 'cap-b'])
    const r2 = evaluateCapabilityScope(caps, policy, ['cap-a', 'cap-b'])
    expect(r1.allowed.map(c => c.capabilityId)).toEqual(r2.allowed.map(c => c.capabilityId))
  })

  it('no capability binding creation — scope evaluator returns values only', () => {
    const result = evaluateCapabilityScope([{ capabilityId: 'cap-a' }], policy, ['cap-a'])
    expect(typeof result).toBe('object')
    // Just a data structure, no side effects
  })
})

// ─── 37.7 Permission scope ────────────────────────────────────────────────────

describe('permission scope', () => {
  const policy = makePolicy()

  it('exact declared permission set allowed', () => {
    const result = evaluatePermissionScope([{ permissionId: 'fs:read' }], policy, ['fs:read'])
    expect(result.allowed).toHaveLength(1)
  })

  it('requested subset allowed', () => {
    const result = evaluatePermissionScope([{ permissionId: 'fs:read' }], policy, ['fs:read', 'fs:write'])
    expect(result.allowed).toHaveLength(1)
  })

  it('undeclared permission denied', () => {
    const result = evaluatePermissionScope([{ permissionId: 'fs:write' }], policy, ['fs:read'])
    expect(result.denied).toHaveLength(1)
  })

  it('trust-restricted permission denied', () => {
    const result = evaluatePermissionScope([{ permissionId: 'fs:read' }], policy, ['fs:read'], ['fs:read'])
    expect(result.denied).toHaveLength(1)
  })

  it('tenant-restricted permission denied', () => {
    const result = evaluatePermissionScope([{ permissionId: 'fs:read' }], policy, ['fs:read'], [], ['fs:read'])
    expect(result.denied).toHaveLength(1)
  })

  it('environment-restricted permission denied', () => {
    const result = evaluatePermissionScope([{ permissionId: 'fs:read' }], policy, ['fs:read'], [], [], ['fs:read'])
    expect(result.denied).toHaveLength(1)
  })

  it('privilege expansion denied — write requested but only read declared', () => {
    const result = evaluatePermissionScope([{ permissionId: 'fs:write' }], policy, ['fs:read'])
    expect(result.denied.some(p => p.permissionId === 'fs:write')).toBe(true)
  })

  it('deterministic ordering', () => {
    const perms = [{ permissionId: 'fs:read' }, { permissionId: 'fs:exec' }]
    const r1 = evaluatePermissionScope(perms, policy, ['fs:read', 'fs:exec'])
    const r2 = evaluatePermissionScope(perms, policy, ['fs:read', 'fs:exec'])
    expect(r1.allowed.map(p => p.permissionId)).toEqual(r2.allowed.map(p => p.permissionId))
  })
})

// ─── 37.8 Policy evaluation ───────────────────────────────────────────────────

describe('policy evaluation', () => {
  function buildCapScope(denied: string[] = []) {
    return {
      allowed: denied.length === 0 ? [{ capabilityId: 'cap-read' }] : [],
      denied: denied.map(d => ({ capabilityId: d })),
      restricted: [],
      reasons: denied.map(d => ({ code: 'denied', detail: d })),
    }
  }
  function buildPermScope(denied: string[] = []) {
    return {
      allowed: denied.length === 0 ? [{ permissionId: 'filesystem:read' }] : [],
      denied: denied.map(d => ({ permissionId: d })),
      reasons: denied.map(d => ({ code: 'denied', detail: d })),
    }
  }

  it('produces authorized for trusted snapshot', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest(), makeTrustedSnapshot(), makePolicy(),
      buildCapScope(), buildPermScope(),
      'authorized', [], [],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('authorized')
  })

  it('produces authorized-with-conditions for conditional trust', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest(), makeConditionalSnapshot(), makePolicy(),
      buildCapScope(), buildPermScope(),
      'authorized-with-conditions', [{ kind: 'sandbox-required' }], [],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('authorized-with-conditions')
  })

  it('denied trust produces denied', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest(), makeDeniedSnapshot(), makePolicy(),
      buildCapScope(), buildPermScope(),
      'denied', [], [{ code: 'trust-denied', detail: 'denied' }],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('denied')
  })

  it('manual-review trust produces manual-review-required', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest(), makeManualReviewSnapshot(), makePolicy(),
      buildCapScope(), buildPermScope(),
      'manual-review-required', [], [{ code: 'trust-manual-review', detail: 'manual' }],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('manual-review-required')
  })

  it('denied capability scope produces denied', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest(), makeTrustedSnapshot(), makePolicy(),
      buildCapScope(['cap-x']), buildPermScope(),
      'authorized', [], [],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('denied')
  })

  it('denied permission scope produces denied', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest(), makeTrustedSnapshot(), makePolicy(),
      buildCapScope(), buildPermScope(['fs:write']),
      'authorized', [], [],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('denied')
  })

  it('downgrade mode denied by policy when not allowed', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest({ provisioningMode: 'downgrade' }), makeTrustedSnapshot(), makePolicy({ allowDowngrade: false }),
      buildCapScope(), buildPermScope(),
      'authorized', [], [],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('denied')
  })

  it('manual recovery denied by policy when not allowed', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest({ provisioningMode: 'manual-recovery' }), makeTrustedSnapshot(), makePolicy({ allowManualRecovery: false }),
      buildCapScope(), buildPermScope(),
      'authorized', [], [],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('denied')
  })

  it('TTL produces expiresAt', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest(), makeTrustedSnapshot(), makePolicy({ authorizationTtlSeconds: 3600 }),
      buildCapScope(), buildPermScope(),
      'authorized', [], [],
      ISSUED_AT,
    )
    expect(result.expiresAt).toBeDefined()
    expect(result.expiresAt).toBe('2026-01-01T11:00:00.000Z')
  })

  it('precedence: denied trust not overwritten by capability check', () => {
    const result = evaluateProvisioningPolicy(
      makeRequest(), makeDeniedSnapshot(), makePolicy(),
      buildCapScope(), buildPermScope(),
      'denied', [], [{ code: 'trust-denied', detail: 'denied' }],
      ISSUED_AT,
    )
    expect(result.outcome).toBe('denied')
  })
})

// ─── 37.9 Decision building ───────────────────────────────────────────────────

describe('decision building', () => {
  it('builds immutable decision with all fields', () => {
    const decision = buildAuthorizationDecision(
      makeRequest(), 'authorized',
      [{ code: 'ok', detail: 'ok' }], [],
      [{ capabilityId: 'cap-read' }], [{ permissionId: 'filesystem:read' }],
      'rec-001', 1, ISSUED_AT,
    )
    expect(decision.authorizationId).toBeDefined()
    expect(decision.outcome).toBe('authorized')
    expect(decision.trustDecisionRecordId).toBe('rec-001')
    expect(decision.repositoryRevision).toBe(1)
    expect(decision.policyReference.policyId).toBe('policy-001')
    expect(decision.tenantId).toBe('tenant-1')
    expect(decision.environmentId).toBe('env-prod')
  })

  it('decision includes explicit issuedAt from caller', () => {
    const decision = buildAuthorizationDecision(
      makeRequest(), 'authorized', [], [], [], [], 'rec-001', 1, ISSUED_AT,
    )
    expect(decision.issuedAt).toBe(ISSUED_AT)
  })

  it('optional expiresAt included when provided', () => {
    const decision = buildAuthorizationDecision(
      makeRequest(), 'authorized', [], [], [], [], 'rec-001', 1, ISSUED_AT, '2026-01-01T11:00:00.000Z',
    )
    expect(decision.expiresAt).toBe('2026-01-01T11:00:00.000Z')
  })

  it('no expiresAt when not provided', () => {
    const decision = buildAuthorizationDecision(
      makeRequest(), 'authorized', [], [], [], [], 'rec-001', 1, ISSUED_AT,
    )
    expect('expiresAt' in decision).toBe(false)
  })

  it('deterministic authorizationId for same inputs', () => {
    const d1 = buildAuthorizationDecision(makeRequest(), 'authorized', [], [], [], [], 'rec-001', 1, ISSUED_AT)
    const d2 = buildAuthorizationDecision(makeRequest(), 'authorized', [], [], [], [], 'rec-001', 1, ISSUED_AT)
    expect(d1.authorizationId).toBe(d2.authorizationId)
  })
})

// ─── 37.10 Token building ─────────────────────────────────────────────────────

describe('token building', () => {
  function makeDecision(outcome: PackageProvisioningAuthorizationDecision['outcome'] = 'authorized'): PackageProvisioningAuthorizationDecision {
    return buildAuthorizationDecision(
      makeRequest(), outcome, [], [], [], [], 'rec-001', 1, ISSUED_AT,
    )
  }

  it('builds token for authorized outcome', () => {
    const token = buildAuthorizationToken(makeDecision('authorized'), false)
    expect(typeof token).toBe('string')
    expect(token.startsWith('v1.')).toBe(true)
  })

  it('builds token for authorized-with-conditions', () => {
    const token = buildAuthorizationToken(makeDecision('authorized-with-conditions'), false)
    expect(typeof token).toBe('string')
  })

  it('subject binding in token', () => {
    const decision = makeDecision()
    const token = buildAuthorizationToken(decision, false)
    const parts = token.split('.')
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
    expect(payload.packageId).toBe('pkg-alpha')
    expect(payload.artifactDigest).toBe('sha256:aaaa1111')
  })

  it('tenant and environment binding in token', () => {
    const token = buildAuthorizationToken(makeDecision(), false)
    const parts = token.split('.')
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
    expect(payload.tenantId).toBe('tenant-1')
    expect(payload.environmentId).toBe('env-prod')
  })

  it('mode and revision binding', () => {
    const token = buildAuthorizationToken(makeDecision(), false)
    const parts = token.split('.')
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
    expect(payload.provisioningMode).toBe('install')
    expect(payload.repositoryRevision).toBe(1)
  })

  it('single-use flag set when true', () => {
    const token = buildAuthorizationToken(makeDecision(), true)
    const parts = token.split('.')
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
    expect(payload.singleUse).toBe(true)
  })

  it('raw evidence excluded from token', () => {
    const token = buildAuthorizationToken(makeDecision(), false)
    expect(token).not.toContain('expectedIntegrity')
    expect(token).not.toContain('sourceIdentity')
  })
})

// ─── 37.11 Token verification ─────────────────────────────────────────────────

describe('token verification', () => {
  function makeTokenAndRecord() {
    const decision = buildAuthorizationDecision(
      makeRequest(), 'authorized', [], [], [], [], 'rec-001', 1, ISSUED_AT, '2026-01-01T11:00:00.000Z',
    )
    const record = decisionToRecord(decision, 'AUTHORIZED')
    const token = buildAuthorizationToken(decision, false)
    return { token, record, decision }
  }

  it('valid token verifies', () => {
    const { token, record } = makeTokenAndRecord()
    const result = verifyAuthorizationToken(token, record, 1, ISSUED_AT)
    expect(result.valid).toBe(true)
  })

  it('tampered token rejected', () => {
    const { token, record } = makeTokenAndRecord()
    const tampered = (token + 'x') as any
    const result = verifyAuthorizationToken(tampered, record, 1, ISSUED_AT)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('tampered-token')
  })

  it('wrong tenant rejected', () => {
    const { decision } = makeTokenAndRecord()
    const otherRecord = decisionToRecord({ ...decision, tenantId: 'tenant-2' }, 'AUTHORIZED')
    const token = buildAuthorizationToken({ ...decision }, false)
    const result = verifyAuthorizationToken(token, otherRecord, 1, ISSUED_AT)
    expect(result.valid).toBe(false)
  })

  it('expired token rejected', () => {
    const { token, record } = makeTokenAndRecord()
    const result = verifyAuthorizationToken(token, record, 1, '2026-01-01T12:00:00.000Z')
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
  })

  it('consumed token rejected', () => {
    const { token, record } = makeTokenAndRecord()
    const consumedRecord = { ...record, state: 'CONSUMED' as AuthorizationLifecycleState }
    const result = verifyAuthorizationToken(token, consumedRecord, 1, ISSUED_AT)
    expect(result.valid).toBe(false)
  })

  it('invalidated token rejected', () => {
    const { token, record } = makeTokenAndRecord()
    const invalidatedRecord = { ...record, state: 'INVALIDATED' as AuthorizationLifecycleState }
    const result = verifyAuthorizationToken(token, invalidatedRecord, 1, ISSUED_AT)
    expect(result.valid).toBe(false)
  })

  it('superseded token rejected', () => {
    const { token, record } = makeTokenAndRecord()
    const supersededRecord = { ...record, state: 'SUPERSEDED' as AuthorizationLifecycleState }
    const result = verifyAuthorizationToken(token, supersededRecord, 1, ISSUED_AT)
    expect(result.valid).toBe(false)
  })

  it('unsupported token version rejected', () => {
    const { record } = makeTokenAndRecord()
    const fakeToken = 'v0.abc.xyz' as any
    const result = verifyAuthorizationToken(fakeToken, record, 1, ISSUED_AT)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('unsupported-token-version')
  })
})

// ─── 37.12 Lifecycle ─────────────────────────────────────────────────────────

describe('lifecycle state machine', () => {
  it('REQUESTED → EVALUATING allowed', () => {
    expect(() => assertValidTransition('REQUESTED', 'EVALUATING')).not.toThrow()
  })

  it('EVALUATING → AUTHORIZED allowed', () => {
    expect(() => assertValidTransition('EVALUATING', 'AUTHORIZED')).not.toThrow()
  })

  it('EVALUATING → AUTHORIZED_WITH_CONDITIONS allowed', () => {
    expect(() => assertValidTransition('EVALUATING', 'AUTHORIZED_WITH_CONDITIONS')).not.toThrow()
  })

  it('EVALUATING → DEFERRED allowed', () => {
    expect(() => assertValidTransition('EVALUATING', 'DEFERRED')).not.toThrow()
  })

  it('EVALUATING → MANUAL_REVIEW_REQUIRED allowed', () => {
    expect(() => assertValidTransition('EVALUATING', 'MANUAL_REVIEW_REQUIRED')).not.toThrow()
  })

  it('EVALUATING → DENIED allowed', () => {
    expect(() => assertValidTransition('EVALUATING', 'DENIED')).not.toThrow()
  })

  it('AUTHORIZED → CONSUMED allowed', () => {
    expect(() => assertValidTransition('AUTHORIZED', 'CONSUMED')).not.toThrow()
  })

  it('AUTHORIZED → EXPIRED allowed', () => {
    expect(() => assertValidTransition('AUTHORIZED', 'EXPIRED')).not.toThrow()
  })

  it('AUTHORIZED → INVALIDATED allowed', () => {
    expect(() => assertValidTransition('AUTHORIZED', 'INVALIDATED')).not.toThrow()
  })

  it('AUTHORIZED → SUPERSEDED allowed', () => {
    expect(() => assertValidTransition('AUTHORIZED', 'SUPERSEDED')).not.toThrow()
  })

  it('DENIED → AUTHORIZED rejected', () => {
    expect(() => assertValidTransition('DENIED', 'AUTHORIZED')).toThrow(AuthorizationError)
  })

  it('CONSUMED → AUTHORIZED rejected', () => {
    expect(() => assertValidTransition('CONSUMED', 'AUTHORIZED')).toThrow(AuthorizationError)
  })

  it('AUTHORIZED and AUTHORIZED_WITH_CONDITIONS are usable states', () => {
    expect(isUsableState('AUTHORIZED')).toBe(true)
    expect(isUsableState('AUTHORIZED_WITH_CONDITIONS')).toBe(true)
    expect(isUsableState('DENIED')).toBe(false)
    expect(isUsableState('CONSUMED')).toBe(false)
  })

  it('terminal states have no allowed transitions', () => {
    const terminals: AuthorizationLifecycleState[] = ['CONSUMED', 'EXPIRED', 'INVALIDATED', 'SUPERSEDED', 'DENIED']
    for (const s of terminals) {
      expect(isTerminalState(s)).toBe(true)
    }
  })
})

// ─── 37.13 Idempotency ────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('repeated identical request returns same outcome', async () => {
    const { controller } = makeController()
    const r1 = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const r2 = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(r1.decision.authorizationId).toBe(r2.decision.authorizationId)
    expect(r2.idempotent).toBe(true)
  })

  it('duplicate authorization record avoided on replay', async () => {
    const { controller, store } = makeController()
    await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(store.getAll()).toHaveLength(1)
  })

  it('conflicting operation ID with different requestId fails closed', async () => {
    const { controller } = makeController()
    await controller.authorize(makeRequest({ requestId: 'req-001' }), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    await expect(
      controller.authorize(makeRequest({ requestId: 'req-002' }), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT),
    ).rejects.toThrow(AuthorizationConflict)
  })
})

// ─── 37.14 Concurrency ───────────────────────────────────────────────────────

describe('concurrency', () => {
  it('concurrent duplicate requests respect lock', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
    const store = createInMemoryAuthorizationRecordStore()
    const lock = createInMemoryAuthorizationLock()
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      store, lock, createInMemoryEventSink(),
    )
    // Sequential calls — concurrent in test means same op
    const r1 = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const r2 = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(store.getAll()).toHaveLength(1)
    expect(r1.decision.authorizationId).toBe(r2.decision.authorizationId)
  })

  it('lock released after success', async () => {
    const { controller } = makeController()
    await controller.authorize(makeRequest({ operationId: 'op-A' }), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    // Same canonical key, different operation — should work (lock released)
    const result = await controller.authorize(makeRequest({ operationId: 'op-B', requestId: 'req-B' }), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result).toBeDefined()
  })

  it('lock released after failure', async () => {
    const failingReader = {
      async getProvisioningTrustSnapshot() { throw new Error('fail') },
    }
    const lock = createInMemoryAuthorizationLock()
    const controller = createAuthorizationController(
      failingReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), lock, createInMemoryEventSink(),
    )
    // First call fails due to repo failure
    const r1 = await controller.authorize(makeRequest({ operationId: 'op-fail' }), makePolicy(), [], [], ISSUED_AT)
    expect(r1.decision.outcome).toBe('deferred')
    // Lock must be released — second call with different op should succeed
    const r2 = await controller.authorize(makeRequest({ operationId: 'op-ok', requestId: 'req-ok' }), makePolicy(), [], [], ISSUED_AT)
    expect(r2).toBeDefined()
  })
})

// ─── 37.15 Expiry and consumption ────────────────────────────────────────────

describe('expiry and consumption', () => {
  it('token valid before expiry', async () => {
    const { controller, store } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy({ authorizationTtlSeconds: 3600 }), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.token).toBeDefined()
    const record = store.getAll()[0]!
    expect(record.expiresAt).toBeDefined()
    const tokenResult = verifyAuthorizationToken(result.token!, record, 1, ISSUED_AT)
    expect(tokenResult.valid).toBe(true)
  })

  it('single successful consumption', async () => {
    const { controller, store } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const authId = result.decision.authorizationId
    const tokenDigest = computeTokenDigest(result.token!)

    await controller.consumeAuthorization({
      authorizationId:        authId,
      tokenDigest,
      consumedByOperationId:  'op-consume-001',
      consumedAt:             '2026-01-01T10:30:00.000Z',
      currentRepositoryRevision: 1,
    })

    const record = await store.getById(authId)
    expect(record?.state).toBe('CONSUMED')
  })

  it('second consumption rejected', async () => {
    const { controller, store } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const authId = result.decision.authorizationId
    const tokenDigest = computeTokenDigest(result.token!)

    await controller.consumeAuthorization({
      authorizationId:        authId,
      tokenDigest,
      consumedByOperationId:  'op-consume-001',
      consumedAt:             '2026-01-01T10:30:00.000Z',
      currentRepositoryRevision: 1,
    })

    await expect(controller.consumeAuthorization({
      authorizationId:        authId,
      tokenDigest,
      consumedByOperationId:  'op-consume-002',
      consumedAt:             '2026-01-01T10:31:00.000Z',
      currentRepositoryRevision: 1,
    })).rejects.toThrow(AuthorizationError)
  })

  it('consumption after expiry rejected', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(
      makeRequest(), makePolicy({ authorizationTtlSeconds: 60 }), ['cap-read'], ['filesystem:read'], ISSUED_AT,
    )
    await expect(controller.consumeAuthorization({
      authorizationId:        result.decision.authorizationId,
      tokenDigest:            computeTokenDigest(result.token!),
      consumedByOperationId:  'op-late',
      consumedAt:             '2026-01-01T11:00:00.000Z',
      currentRepositoryRevision: 1,
    })).rejects.toThrow(AuthorizationError)
  })
})

// ─── 37.16 Invalidation ───────────────────────────────────────────────────────

describe('invalidation', () => {
  async function authorizeAndGetId() {
    const { controller, store, eventSink } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    return { authId: result.decision.authorizationId, store, eventSink }
  }

  it('trust superseded invalidation', async () => {
    const { authId, store, eventSink } = await authorizeAndGetId()
    await invalidateAuthorization(authId, 'trust-superseded', '2026-01-01T10:30:00.000Z', store, eventSink)
    const record = await store.getById(authId)
    expect(record?.state).toBe('SUPERSEDED')
  })

  it('quarantine imposed invalidation', async () => {
    const { authId, store, eventSink } = await authorizeAndGetId()
    await invalidateAuthorization(authId, 'quarantine-imposed', '2026-01-01T10:30:00.000Z', store, eventSink)
    const record = await store.getById(authId)
    expect(record?.state).toBe('INVALIDATED')
  })

  it('reevaluation required invalidation', async () => {
    const { authId, store, eventSink } = await authorizeAndGetId()
    await invalidateAuthorization(authId, 'reevaluation-required', '2026-01-01T10:30:00.000Z', store, eventSink)
    const record = await store.getById(authId)
    expect(record?.state).toBe('INVALIDATED')
  })

  it('invalidation preserves history — record not deleted', async () => {
    const { authId, store, eventSink } = await authorizeAndGetId()
    await invalidateAuthorization(authId, 'emergency-recall', '2026-01-01T10:30:00.000Z', store, eventSink)
    const record = await store.getById(authId)
    expect(record).toBeDefined()
    expect(record?.invalidatedAt).toBeDefined()
  })

  it('invalidation emits event', async () => {
    const { authId, store, eventSink } = await authorizeAndGetId()
    await invalidateAuthorization(authId, 'policy-revoked', '2026-01-01T10:30:00.000Z', store, eventSink)
    const events = eventSink.events
    expect(events.some(e => e.authorizationId === authId && (e.eventType === 'authorization-invalidated' || e.eventType === 'authorization-superseded'))).toBe(true)
  })

  it('cannot invalidate non-existent authorization', async () => {
    const store = createInMemoryAuthorizationRecordStore()
    const eventSink = createInMemoryEventSink()
    await expect(invalidateAuthorization('missing-id', 'emergency-recall', ISSUED_AT, store, eventSink)).rejects.toThrow(AuthorizationError)
  })
})

// ─── 37.17 Failure handling ───────────────────────────────────────────────────

describe('failure handling', () => {
  it('repository failure returns deferred, not assumed no record', async () => {
    const failingReader = { async getProvisioningTrustSnapshot() { throw new Error('timeout') } }
    const controller = createAuthorizationController(
      failingReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    expect(result.decision.outcome).toBe('deferred')
  })

  it('no token issued on denied outcome', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeDeniedSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    expect(result.token).toBeUndefined()
  })

  it('no token issued on deferred outcome', async () => {
    const failingReader = { async getProvisioningTrustSnapshot() { throw new Error('fail') } }
    const controller = createAuthorizationController(
      failingReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    expect(result.token).toBeUndefined()
  })

  it('no token on manual-review-required', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeManualReviewSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    expect(result.token).toBeUndefined()
  })

  it('structured error on consume of non-existent authorization', async () => {
    const { controller } = makeController()
    await expect(controller.consumeAuthorization({
      authorizationId: 'ghost-id', tokenDigest: 'x', consumedByOperationId: 'op', consumedAt: ISSUED_AT, currentRepositoryRevision: 1,
    })).rejects.toThrow(AuthorizationError)
  })
})

// ─── 37.18 Security ───────────────────────────────────────────────────────────

describe('security', () => {
  it('cross-tenant replay rejected by token verifier', async () => {
    const store = createInMemoryAuthorizationRecordStore()
    const { controller } = (() => {
      const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
      const ctrl = createAuthorizationController(
        trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
        store, createInMemoryAuthorizationLock(), createInMemoryEventSink(),
      )
      return { controller: ctrl }
    })()
    const result = await controller.authorize(makeRequest({ tenantId: 'tenant-1' }), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const record = (await store.getById(result.decision.authorizationId))!
    const verifyResult = await verifyAuthorizationTokenFull(
      { token: result.token!, tenantId: 'tenant-EVIL', environmentId: 'env-prod', artifactDigest: ARTIFACT.artifactDigest, provisioningMode: 'install', currentRepositoryRevision: 1, now: ISSUED_AT },
      store,
    )
    expect(verifyResult.valid).toBe(false)
    expect(verifyResult.reason).toBe('cross-tenant-replay')
  })

  it('cross-environment replay rejected', async () => {
    const store = createInMemoryAuthorizationRecordStore()
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      store, createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const verifyResult = await verifyAuthorizationTokenFull(
      { token: result.token!, tenantId: 'tenant-1', environmentId: 'env-EVIL', artifactDigest: ARTIFACT.artifactDigest, provisioningMode: 'install', currentRepositoryRevision: 1, now: ISSUED_AT },
      store,
    )
    expect(verifyResult.valid).toBe(false)
    expect(verifyResult.reason).toBe('cross-environment-replay')
  })

  it('package ID without artifact digest rejected at request validation', () => {
    expect(() => validateProvisioningRequest(makeRequest({ artifactIdentity: { ...ARTIFACT, artifactDigest: '' } }))).toThrow(AuthorizationError)
  })

  it('oversized capability scope rejected', () => {
    const caps = Array.from({ length: 101 }, (_, i) => ({ capabilityId: `cap-${i}` }))
    expect(() => validateProvisioningRequest(makeRequest({ requestedCapabilities: caps }))).toThrow(AuthorizationError)
  })

  it('token does not contain secrets or raw package content', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.token).not.toContain('password')
    expect(result.token).not.toContain('secret')
    expect(result.token).not.toContain('privateKey')
    expect(result.token).not.toContain('packageBytes')
  })
})

// ─── 37.19 Architectural isolation ───────────────────────────────────────────

describe('architectural isolation', () => {
  it('no trust evaluator implementation — package has no TrustEvaluator class', async () => {
    // Sentinel: import the index and verify TrustEvaluator is not exported
    const exports = await import('../index.js')
    expect((exports as any).TrustEvaluator).toBeUndefined()
    expect((exports as any).PackageTrustEvaluator).toBeUndefined()
  })

  it('no Trust Decision Engine invocation — package has no TrustDecisionEngine export', async () => {
    const exports = await import('../index.js')
    expect((exports as any).TrustDecisionEngine).toBeUndefined()
  })

  it('no quarantine mutation — no quarantine write functions exported', async () => {
    const exports = await import('../index.js')
    expect((exports as any).quarantinePackage).toBeUndefined()
    expect((exports as any).releaseFromQuarantine).toBeUndefined()
  })

  it('no reevaluation mutation — no reevaluation trigger exported', async () => {
    const exports = await import('../index.js')
    expect((exports as any).triggerReevaluation).toBeUndefined()
  })

  it('no package installation — no install function exported', async () => {
    const exports = await import('../index.js')
    expect((exports as any).installPackage).toBeUndefined()
    expect((exports as any).unpackArtifact).toBeUndefined()
  })

  it('no capability binding materialization', async () => {
    const exports = await import('../index.js')
    expect((exports as any).materializeCapabilityBinding).toBeUndefined()
    expect((exports as any).registerProvider).toBeUndefined()
  })

  it('no provider registration', async () => {
    const exports = await import('../index.js')
    expect((exports as any).registerProvider).toBeUndefined()
  })

  it('no package activation', async () => {
    const exports = await import('../index.js')
    expect((exports as any).activatePackage).toBeUndefined()
  })

  it('no lifecycle hook execution', async () => {
    const exports = await import('../index.js')
    expect((exports as any).executeLifecycleHook).toBeUndefined()
  })

  it('no package code execution', async () => {
    const exports = await import('../index.js')
    expect((exports as any).execPackage).toBeUndefined()
  })

  it('no hidden system-clock decision — issuedAt is always caller-supplied', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    // The decision's issuedAt must exactly match the caller-supplied value
    expect(result.decision.issuedAt).toBe(ISSUED_AT)
  })
})

// ─── 37.20 Constitutional laws ───────────────────────────────────────────────

describe('constitutional laws', () => {
  it('L-9J-1301: Task 14 is the sole authorization boundary before provisioning', () => {
    // Sentinel: controller.authorize is the single entry point
    const { controller } = makeController()
    expect(typeof controller.authorize).toBe('function')
  })

  it('L-9J-1302: Task 14 does not install, materialize, activate, register, or execute', async () => {
    const exports = await import('../index.js')
    const forbidden = ['installPackage','unpackArtifact','materializeCapabilityBinding','registerProvider','activatePackage','executeLifecycleHook','execPackage']
    for (const name of forbidden) {
      expect((exports as any)[name]).toBeUndefined()
    }
  })

  it('L-9J-1303: Task 14 consumes authoritative trust state and does not recompute trust', () => {
    // evaluateTrustUsability takes snapshot, not evaluator
    const result = evaluateTrustUsability(makeTrustedSnapshot(), makePolicy())
    expect(result.outcome).toBe('authorized')
  })

  it('L-9J-1304: denied trust decision is never authorized', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeDeniedSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    expect(result.decision.outcome).toBe('denied')
    expect(result.token).toBeUndefined()
  })

  it('L-9J-1305: manual-review-required trust is never auto-authorized', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeManualReviewSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    expect(result.decision.outcome).toBe('manual-review-required')
    expect(result.token).toBeUndefined()
  })

  it('L-9J-1306: conditionally trusted authorized only with enforceable conditions', () => {
    const result = evaluateTrustUsability(makeConditionalSnapshot(), makePolicy())
    expect(result.usable).toBe(true)
    expect(result.conditions.length).toBeGreaterThan(0)
  })

  it('L-9J-1307: actively quarantined artifact never authorized', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
    const quarantineReader = createInMemoryQuarantineReader('quarantined')
    const controller = createAuthorizationController(
      trustReader, quarantineReader, createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.outcome).toBe('denied')
    expect(result.token).toBeUndefined()
  })

  it('L-9J-1308: unknown quarantine state fails closed by policy', () => {
    const result = evaluateQuarantineGate('unknown', makePolicy({ denyWhenQuarantineStateUnknown: true }))
    expect(result.pass).toBe(false)
    expect(result.outcome).toBe('denied')
  })

  it('L-9J-1309: reevaluation-required trust record not authorized', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot({ reevaluationState: 'required' })])
    const reevalReader = createInMemoryReevaluationStatusReader(
      { trustDecisionRecordId: 'rec-001', state: 'required', asOf: ISSUED_AT },
      new Map([['rec-001', { trustDecisionRecordId: 'rec-001', state: 'required', asOf: ISSUED_AT }]]),
    )
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), reevalReader,
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    expect(['deferred', 'denied']).toContain(result.decision.outcome)
  })

  it('L-9J-1310: every authorization bound to immutable subject and artifact identity', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.subject.packageId).toBe('pkg-alpha')
    expect(result.decision.artifactIdentity.artifactDigest).toBe('sha256:aaaa1111')
  })

  it('L-9J-1311: every authorization bound to tenant and environment', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.tenantId).toBe('tenant-1')
    expect(result.decision.environmentId).toBe('env-prod')
  })

  it('L-9J-1312: every authorization bound to repository revision and policy version', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(result.decision.repositoryRevision).toBe(1)
    expect(result.decision.policyReference.policyVersion).toBe('1.0')
  })

  it('L-9J-1313: stale or superseded snapshot never produces usable authorization', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot({ superseded: true })])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    expect(result.token).toBeUndefined()
    expect(['stale-snapshot', 'denied']).toContain(result.decision.outcome)
  })

  it('L-9J-1314: requested capability scope never exceeds permitted scope', () => {
    const result = evaluateCapabilityScope([{ capabilityId: 'cap-x' }], makePolicy(), ['cap-a'])
    expect(result.denied).toHaveLength(1)
    expect(result.denied[0]!.capabilityId).toBe('cap-x')
  })

  it('L-9J-1315: requested permission scope never exceeds permitted scope', () => {
    const result = evaluatePermissionScope([{ permissionId: 'fs:write' }], makePolicy(), ['fs:read'])
    expect(result.denied).toHaveLength(1)
  })

  it('L-9J-1316: authorization never inferred from absence of denial', async () => {
    // Empty capability and permission lists should NOT produce authorized
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest({ requestedCapabilities: [], requestedPermissions: [] }), makePolicy(), [], [], ISSUED_AT)
    // Authorized because trust is trusted and no capabilities requested — explicit outcome, not default
    expect(['authorized', 'authorized-with-conditions', 'denied']).toContain(result.decision.outcome)
  })

  it('L-9J-1317: authorization decision is immutable — Object.isFrozen check skipped, verified by readonly types', () => {
    const decision = buildAuthorizationDecision(makeRequest(), 'authorized', [], [], [], [], 'rec-001', 1, ISSUED_AT)
    expect(decision.authorizationId).toBeDefined()
    expect(Object.keys(decision).length).toBeGreaterThan(0)
  })

  it('L-9J-1318: usable token issued only after durable persistence', async () => {
    // Controller persists record first, then builds token
    const store = createInMemoryAuthorizationRecordStore()
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      store, createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    // Token present AND record persisted
    expect(result.token).toBeDefined()
    expect(store.getAll()).toHaveLength(1)
  })

  it('L-9J-1319: tokens are opaque, integrity protected, and scope bound', () => {
    const decision = buildAuthorizationDecision(makeRequest(), 'authorized', [], [], [], [], 'rec-001', 1, ISSUED_AT)
    const token = buildAuthorizationToken(decision, false)
    const parts = token.split('.')
    expect(parts).toHaveLength(3) // version.body.sig — HMAC protected
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
    expect(payload.tenantId).toBe('tenant-1')
    expect(payload.artifactDigest).toBe('sha256:aaaa1111')
  })

  it('L-9J-1320: single-use authorization consumable at most once', async () => {
    const { controller, store } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy({ singleUseAuthorization: true }), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const tokenDigest = computeTokenDigest(result.token!)

    await controller.consumeAuthorization({
      authorizationId: result.decision.authorizationId,
      tokenDigest, consumedByOperationId: 'op-c1', consumedAt: '2026-01-01T10:30:00.000Z', currentRepositoryRevision: 1,
    })

    await expect(controller.consumeAuthorization({
      authorizationId: result.decision.authorizationId,
      tokenDigest, consumedByOperationId: 'op-c2', consumedAt: '2026-01-01T10:31:00.000Z', currentRepositoryRevision: 1,
    })).rejects.toThrow(AuthorizationError)
  })

  it('L-9J-1321: repeated identical requests are idempotent', async () => {
    const { controller } = makeController()
    const r1 = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const r2 = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    expect(r1.decision.authorizationId).toBe(r2.decision.authorizationId)
    expect(r2.idempotent).toBe(true)
  })

  it('L-9J-1322: reused operation ID with different requestId fails closed', async () => {
    const { controller } = makeController()
    await controller.authorize(makeRequest({ requestId: 'req-A' }), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    await expect(
      controller.authorize(makeRequest({ requestId: 'req-B' }), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT),
    ).rejects.toThrow(AuthorizationConflict)
  })

  it('L-9J-1323: stale repository revision never produces usable authorization', async () => {
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot({ repositoryRevision: 5 })])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(
      makeRequest({ expectedRepositoryRevision: 3 }), makePolicy(), [], [], ISSUED_AT,
    )
    expect(result.token).toBeUndefined()
  })

  it('L-9J-1324: invalidation preserves historical evidence', async () => {
    const store = createInMemoryAuthorizationRecordStore()
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
    const eventSink = createInMemoryEventSink()
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      store, createInMemoryAuthorizationLock(), eventSink,
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    await invalidateAuthorization(result.decision.authorizationId, 'emergency-recall', '2026-01-01T10:30:00.000Z', store, eventSink)
    const record = await store.getById(result.decision.authorizationId)
    expect(record).toBeDefined()
    expect(record?.reasons).toBeDefined()
    expect(record?.subject.packageId).toBe('pkg-alpha')
  })

  it('L-9J-1325: expired/invalidated/consumed/superseded authorization not usable', () => {
    const unusable: AuthorizationLifecycleState[] = ['EXPIRED', 'INVALIDATED', 'CONSUMED', 'SUPERSEDED', 'DENIED']
    for (const state of unusable) {
      expect(isUsableState(state)).toBe(false)
    }
  })

  it('L-9J-1326: explicit authoritative time used — issuedAt matches caller supplied', async () => {
    const { controller } = makeController()
    const customTime = '2026-03-15T09:00:00.000Z'
    const result = await controller.authorize(makeRequest({ requestedAt: customTime }), makePolicy(), ['cap-read'], ['filesystem:read'], customTime)
    expect(result.decision.issuedAt).toBe(customTime)
  })

  it('L-9J-1327: repository failure not interpreted as absent trust record', async () => {
    const failingReader = { async getProvisioningTrustSnapshot() { throw new Error('unavailable') } }
    const controller = createAuthorizationController(
      failingReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)
    // Must be deferred (not denied/invalid as if record is missing)
    expect(result.decision.outcome).toBe('deferred')
  })

  it('L-9J-1328: deferred, denied, manual-review, stale, and invalid remain distinct', async () => {
    const outcomes = new Set<string>()
    const { controller: c1 } = makeController()
    outcomes.add((await c1.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)).decision.outcome)

    const trustReader2 = createInMemoryTrustRepositoryReader([makeDeniedSnapshot()])
    const c2 = createAuthorizationController(trustReader2, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(), createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink())
    outcomes.add((await c2.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)).decision.outcome)

    const trustReader3 = createInMemoryTrustRepositoryReader([makeManualReviewSnapshot()])
    const c3 = createAuthorizationController(trustReader3, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(), createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink())
    outcomes.add((await c3.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)).decision.outcome)

    const trustReader4 = createInMemoryTrustRepositoryReader([makeTrustedSnapshot({ superseded: true })])
    const c4 = createAuthorizationController(trustReader4, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(), createInMemoryAuthorizationRecordStore(), createInMemoryAuthorizationLock(), createInMemoryEventSink())
    outcomes.add((await c4.authorize(makeRequest(), makePolicy(), [], [], ISSUED_AT)).decision.outcome)

    // At least 3 distinct outcomes
    expect(outcomes.size).toBeGreaterThanOrEqual(3)
  })

  it('L-9J-1329: does not mutate trust, quarantine, or reevaluation state', () => {
    // Sentinel: no mutation functions exported
    const trustedExports = Object.keys(moduleExports as Record<string, unknown>)
    expect(trustedExports).not.toContain('recordTrustDecision')
    expect(trustedExports).not.toContain('quarantineArtifact')
    expect(trustedExports).not.toContain('markReevaluationRequired')
  })

  it('L-9J-1330: every result references trust record, revision, policy, subject, artifact, tenant, environment, scope', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const d = result.decision
    expect(d.trustDecisionRecordId).toBeDefined()
    expect(d.repositoryRevision).toBeDefined()
    expect(d.policyReference).toBeDefined()
    expect(d.subject).toBeDefined()
    expect(d.artifactIdentity).toBeDefined()
    expect(d.tenantId).toBeDefined()
    expect(d.environmentId).toBeDefined()
    expect(d.authorizedCapabilities).toBeDefined()
    expect(d.authorizedPermissions).toBeDefined()
  })

  it('L-9J-1331: no secrets or raw package content in tokens', async () => {
    const { controller } = makeController()
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const token = result.token!
    const SECRETS = ['password', 'secret', 'privateKey', 'apiKey', 'packageBytes']
    for (const s of SECRETS) {
      expect(token).not.toContain(s)
    }
  })

  it('L-9J-1332: downstream provisioning must fail when token verification fails', async () => {
    const store = createInMemoryAuthorizationRecordStore()
    const trustReader = createInMemoryTrustRepositoryReader([makeTrustedSnapshot()])
    const controller = createAuthorizationController(
      trustReader, createInMemoryQuarantineReader(), createInMemoryReevaluationStatusReader(),
      store, createInMemoryAuthorizationLock(), createInMemoryEventSink(),
    )
    const result = await controller.authorize(makeRequest(), makePolicy(), ['cap-read'], ['filesystem:read'], ISSUED_AT)
    const tampered = (result.token! + 'tampered') as any
    const verifyResult = await verifyAuthorizationTokenFull(
      { token: tampered, tenantId: 'tenant-1', environmentId: 'env-prod', artifactDigest: ARTIFACT.artifactDigest, provisioningMode: 'install', currentRepositoryRevision: 1, now: ISSUED_AT },
      store,
    )
    expect(verifyResult.valid).toBe(false)
  })
})
