import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { AuthorizationValidator } from '../authorization-validator.js'
import { AuthorizationProofStore } from '../authorization-proof-store.js'
import type { InProcessAuthorizationRecord } from '../authorization-proof-store.js'
import { AuthorizationValidationError } from '@rohinik-org/provisioning-ir'
import type {
  AuthorizationId,
  AuthorizationIssuerId,
  AuthorizedPlanSemanticHash,
  ResolutionPlanId,
  ResolutionPlanSemanticHash,
  AuthorizationKeyResolver,
} from '@rohinik-org/provisioning-ir'
import type { IsoTimestamp } from '@rohinik-org/provisioning-ir'
import { canonicalize, sha256Hex } from '../canonicalize.js'
import type { AuthorizedCapabilityResolutionPlan } from '@rohinik-org/provisioning-ir'

// ── helpers ──────────────────────────────────────────────────────────────────

function buildValidPlan(issuer: AuthorizationIssuerId = 'issuer-1' as AuthorizationIssuerId, token = 'tok-1'): AuthorizedCapabilityResolutionPlan {
  const base = {
    kind: 'authorized-capability-resolution-plan' as const,
    schemaVersion: 1 as const,
    authorizationId: 'auth-001' as AuthorizationId,
    proposedPlanId: 'plan-001' as ResolutionPlanId,
    proposedPlanSemanticHash: 'abc' as ResolutionPlanSemanticHash,
    authorizedAt: '2026-01-01T00:00:00.000Z' as IsoTimestamp,
    authorizationPolicyId: 'policy-1',
    authorizedActions: [],
    verifiedArtifacts: [],
    permissionAuthorizations: [],
    npmInstallManifests: [],
    secretRequirements: [],
  }
  const semanticHash = sha256Hex(canonicalize(base)) as AuthorizedPlanSemanticHash
  return {
    ...base,
    semanticHash,
    authorizationProof: {
      algorithm: 'in-process-token',
      issuer,
      signedPayloadHash: semanticHash,
      token,
    },
  }
}

function makeNullKeyResolver(): AuthorizationKeyResolver {
  return { resolveEd25519PublicKey: async () => undefined }
}

// ── proof store tests ─────────────────────────────────────────────────────────
describe('AuthorizationProofStore', () => {
  it('duplicate token registration → throws', () => {
    const store = new AuthorizationProofStore()
    const rec: InProcessAuthorizationRecord = {
      token: 'tok-dup',
      issuer: 'issuer-1' as AuthorizationIssuerId,
      authorizationId: 'auth-001' as AuthorizationId,
      signedPayloadHash: 'hash-1' as AuthorizedPlanSemanticHash,
    }
    store.register(rec)
    expect(() => store.register(rec)).toThrow('duplicate token registration')
  })

  it('consume() removes token; second call returns undefined', () => {
    const store = new AuthorizationProofStore()
    const rec: InProcessAuthorizationRecord = {
      token: 'tok-consume',
      issuer: 'issuer-1' as AuthorizationIssuerId,
      authorizationId: 'auth-001' as AuthorizationId,
      signedPayloadHash: 'hash-1' as AuthorizedPlanSemanticHash,
    }
    store.register(rec)
    expect(store.consume('tok-consume')).toBe(rec)
    expect(store.consume('tok-consume')).toBeUndefined()
  })
})

// ── validator tests ───────────────────────────────────────────────────────────
describe('AuthorizationValidator — in-process-token', () => {
  const ISSUER = 'issuer-1' as AuthorizationIssuerId
  const knownIssuers = new Set([ISSUER])

  function makeStoreWithToken(plan: AuthorizedCapabilityResolutionPlan): AuthorizationProofStore {
    const store = new AuthorizationProofStore()
    store.register({
      token: 'tok-1',
      issuer: ISSUER,
      authorizationId: plan.authorizationId,
      signedPayloadHash: plan.semanticHash,
    })
    return store
  }

  it('tampered plan field → SEMANTIC_HASH_MISMATCH', async () => {
    const plan = buildValidPlan()
    const store = makeStoreWithToken(plan)
    const tampered = { ...plan, authorizationPolicyId: 'tampered-policy' }
    const validator = new AuthorizationValidator(store, makeNullKeyResolver(), knownIssuers)
    await expect(validator.validate(tampered as AuthorizedCapabilityResolutionPlan)).rejects.toMatchObject({ code: 'SEMANTIC_HASH_MISMATCH' })
  })

  it('token not in store → PROOF_INVALID', async () => {
    const plan = buildValidPlan()
    const store = new AuthorizationProofStore() // empty
    const validator = new AuthorizationValidator(store, makeNullKeyResolver(), knownIssuers)
    await expect(validator.validate(plan)).rejects.toMatchObject({ code: 'PROOF_INVALID' })
  })

  it('token in store but authorizationId mismatch → PROOF_INVALID', async () => {
    const plan = buildValidPlan()
    const store = new AuthorizationProofStore()
    store.register({
      token: 'tok-1',
      issuer: ISSUER,
      authorizationId: 'wrong-auth' as AuthorizationId, // mismatch
      signedPayloadHash: plan.semanticHash,
    })
    const validator = new AuthorizationValidator(store, makeNullKeyResolver(), knownIssuers)
    await expect(validator.validate(plan)).rejects.toMatchObject({ code: 'PROOF_INVALID' })
  })

  it('token in store but signedPayloadHash mismatch → PROOF_INVALID', async () => {
    const plan = buildValidPlan()
    const store = new AuthorizationProofStore()
    store.register({
      token: 'tok-1',
      issuer: ISSUER,
      authorizationId: plan.authorizationId,
      signedPayloadHash: 'wrong-hash' as AuthorizedPlanSemanticHash, // mismatch
    })
    const validator = new AuthorizationValidator(store, makeNullKeyResolver(), knownIssuers)
    await expect(validator.validate(plan)).rejects.toMatchObject({ code: 'PROOF_INVALID' })
  })

  it('issuer not in known-issuers → ISSUER_UNKNOWN', async () => {
    const plan = buildValidPlan()
    const store = makeStoreWithToken(plan)
    const emptyIssuers = new Set<AuthorizationIssuerId>()
    const validator = new AuthorizationValidator(store, makeNullKeyResolver(), emptyIssuers)
    await expect(validator.validate(plan)).rejects.toMatchObject({ code: 'ISSUER_UNKNOWN' })
  })

  it('valid in-process proof → passes', async () => {
    const plan = buildValidPlan()
    const store = makeStoreWithToken(plan)
    const validator = new AuthorizationValidator(store, makeNullKeyResolver(), knownIssuers)
    await expect(validator.validate(plan)).resolves.toBeUndefined()
  })
})

describe('AuthorizationValidator — ed25519', () => {
  const ISSUER = 'issuer-ed' as AuthorizationIssuerId
  const knownIssuers = new Set([ISSUER])

  function buildEd25519Plan(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], publicKey: ReturnType<typeof generateKeyPairSync>['publicKey'], issuer: AuthorizationIssuerId = ISSUER, keyId = 'key-1'): AuthorizedCapabilityResolutionPlan {
    const base = {
      kind: 'authorized-capability-resolution-plan' as const,
      schemaVersion: 1 as const,
      authorizationId: 'auth-ed' as AuthorizationId,
      proposedPlanId: 'plan-ed' as ResolutionPlanId,
      proposedPlanSemanticHash: 'def' as ResolutionPlanSemanticHash,
      authorizedAt: '2026-01-01T00:00:00.000Z' as IsoTimestamp,
      authorizationPolicyId: 'policy-ed',
      authorizedActions: [],
      verifiedArtifacts: [],
      permissionAuthorizations: [],
      npmInstallManifests: [],
      secretRequirements: [],
    }
    const semanticHash = sha256Hex(canonicalize(base)) as AuthorizedPlanSemanticHash
    const hashBytes = Buffer.from(semanticHash, 'hex')
    const signature = sign(null, hashBytes, privateKey).toString('base64')
    return {
      ...base,
      semanticHash,
      authorizationProof: {
        algorithm: 'ed25519',
        issuer,
        keyId,
        signedPayloadHash: semanticHash,
        signatureEncoding: 'base64',
        signature,
      },
    }
  }

  it('Ed25519 valid signature → passes', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const plan = buildEd25519Plan(privateKey, publicKey)
    const resolver: AuthorizationKeyResolver = {
      resolveEd25519PublicKey: async () => publicKey as unknown as Uint8Array,
    }
    const validator = new AuthorizationValidator(new AuthorizationProofStore(), resolver, knownIssuers)
    await expect(validator.validate(plan)).resolves.toBeUndefined()
  })

  it('Ed25519 invalid signature → SIGNATURE_INVALID', async () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const { publicKey: otherPublicKey } = generateKeyPairSync('ed25519') // wrong key
    const plan = buildEd25519Plan(privateKey, otherPublicKey)
    const resolver: AuthorizationKeyResolver = {
      resolveEd25519PublicKey: async () => otherPublicKey as unknown as Uint8Array,
    }
    const validator = new AuthorizationValidator(new AuthorizationProofStore(), resolver, knownIssuers)
    await expect(validator.validate(plan)).rejects.toMatchObject({ code: 'SIGNATURE_INVALID' })
  })

  it('Ed25519 unknown keyId → ISSUER_UNKNOWN', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const plan = buildEd25519Plan(privateKey, publicKey, ISSUER, 'unknown-key')
    const resolver: AuthorizationKeyResolver = {
      resolveEd25519PublicKey: async () => undefined, // not found
    }
    const validator = new AuthorizationValidator(new AuthorizationProofStore(), resolver, knownIssuers)
    await expect(validator.validate(plan)).rejects.toMatchObject({ code: 'ISSUER_UNKNOWN' })
  })

  it('Ed25519 unknown issuer → ISSUER_UNKNOWN', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const plan = buildEd25519Plan(privateKey, publicKey, 'unknown-issuer' as AuthorizationIssuerId)
    const resolver: AuthorizationKeyResolver = {
      resolveEd25519PublicKey: async () => publicKey.export({ type: 'spki', format: 'der' }) as Uint8Array,
    }
    const emptyIssuers = new Set<AuthorizationIssuerId>()
    const validator = new AuthorizationValidator(new AuthorizationProofStore(), resolver, emptyIssuers)
    await expect(validator.validate(plan)).rejects.toMatchObject({ code: 'ISSUER_UNKNOWN' })
  })

  it('Ed25519 proof signedPayloadHash mismatch → PROOF_INVALID', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const plan = buildEd25519Plan(privateKey, publicKey)
    // Tamper: set signedPayloadHash to something that doesn't match semanticHash
    const tampered = {
      ...plan,
      authorizationProof: {
        ...plan.authorizationProof,
        signedPayloadHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as AuthorizedPlanSemanticHash,
      },
    }
    const resolver: AuthorizationKeyResolver = {
      resolveEd25519PublicKey: async () => publicKey as unknown as Uint8Array,
    }
    const validator = new AuthorizationValidator(new AuthorizationProofStore(), resolver, knownIssuers)
    await expect(validator.validate(tampered as AuthorizedCapabilityResolutionPlan)).rejects.toMatchObject({ code: 'PROOF_INVALID' })
  })
})
