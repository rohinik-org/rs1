import { describe, it, expect } from 'vitest'
import { AuthorizedPlanParser } from '../plan-parser.js'
import { PlanStructureError } from '@rohinik-org/provisioning-ir'
import type {
  AuthorizationId,
  AuthorizationIssuerId,
  AuthorizedPlanSemanticHash,
  ArtifactAuthorizationId,
  ProvisioningActionId,
  NpmInstallManifestHash,
  ResolutionPlanId,
  ResolutionPlanSemanticHash,
} from '@rohinik-org/provisioning-ir'
import type { IsoTimestamp } from '@rohinik-org/provisioning-ir'
import { canonicalize, sha256Hex } from '../canonicalize.js'

const parser = new AuthorizedPlanParser()

// ── helper ──────────────────────────────────────────────────────────────────
function buildBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'authorized-capability-resolution-plan',
    schemaVersion: 1,
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
    ...overrides,
  }
}

function buildPlan(baseOverrides: Record<string, unknown> = {}, proofOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = buildBase(baseOverrides)
  const semanticHash = sha256Hex(canonicalize(base)) as AuthorizedPlanSemanticHash
  return {
    ...base,
    semanticHash,
    authorizationProof: {
      algorithm: 'in-process-token',
      issuer: 'test-issuer' as AuthorizationIssuerId,
      signedPayloadHash: semanticHash,
      token: 'tok-1',
      ...proofOverrides,
    },
  }
}

// ── tests ────────────────────────────────────────────────────────────────────
describe('AuthorizedPlanParser', () => {
  it('missing kind → PlanStructureError', () => {
    // Build a valid plan then corrupt kind after hash is computed
    const plan = { ...buildPlan(), kind: 'wrong-kind' }
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('wrong schemaVersion → PlanStructureError', () => {
    const plan = buildPlan({ schemaVersion: 2 })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('unknown action kind → PlanStructureError', () => {
    const plan = buildPlan({
      authorizedActions: [{
        kind: 'hack-system',
        actionId: 'a1' as ProvisioningActionId,
        dependsOn: [],
        mutationPolicy: { mutating: false },
        authorization: { authorizationId: 'auth-001', authorizationDecisionId: 'd1', authorizedTargetHash: 'h1' },
      }],
    })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('malformed sha256 digest (not 64 hex chars) → PlanStructureError', () => {
    const plan = buildPlan({
      verifiedArtifacts: [{
        artifactAuthorizationId: 'aai-1' as ArtifactAuthorizationId,
        artifact: { kind: 'rohinik-package', packageId: 'pkg', version: '1.0.0' },
        digest: { algorithm: 'sha256', encoding: 'hex', value: 'tooshort' },
        source: { sourceKind: 'uri', uri: 'https://example.com' },
        authorizedBy: 'auth-001',
      }],
    })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('malformed SRI value (not sha512-<base64>) → PlanStructureError', () => {
    const plan = buildPlan({
      verifiedArtifacts: [{
        artifactAuthorizationId: 'aai-2' as ArtifactAuthorizationId,
        artifact: { kind: 'rohinik-package', packageId: 'pkg', version: '1.0.0' },
        digest: { algorithm: 'sha512', encoding: 'sri-base64', value: 'notvalidformat' },
        source: { sourceKind: 'uri', uri: 'https://example.com' },
        authorizedBy: 'auth-001',
      }],
    })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('validate-only template with mutating: true → PlanStructureError', () => {
    const plan = buildPlan({
      authorizedActions: [{
        kind: 'apply-configuration-template',
        actionId: 'a1' as ProvisioningActionId,
        dependsOn: [],
        mutationPolicy: { mutating: true, compensation: { kind: 'noop', parameters: {} } },
        authorization: { authorizationId: 'auth-001', authorizationDecisionId: 'd1', authorizedTargetHash: 'h1' },
        template: {
          templateId: 't1',
          configurationKey: 'k',
          destination: 'cfg/x.json',
          valueType: 'string',
          canonicalContent: '{}',
          contentSemanticHash: 'h',
          writePolicy: 'validate-only',
        },
        secretRequirements: [],
      }],
    })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('create-if-absent template with mutating: false → PlanStructureError', () => {
    const plan = buildPlan({
      authorizedActions: [{
        kind: 'apply-configuration-template',
        actionId: 'a2' as ProvisioningActionId,
        dependsOn: [],
        mutationPolicy: { mutating: false },
        authorization: { authorizationId: 'auth-001', authorizationDecisionId: 'd1', authorizedTargetHash: 'h1' },
        template: {
          templateId: 't2',
          configurationKey: 'k',
          destination: 'cfg/x.json',
          valueType: 'string',
          canonicalContent: '{}',
          contentSemanticHash: 'h',
          writePolicy: 'create-if-absent',
        },
        secretRequirements: [],
      }],
    })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('duplicate actionIds → PlanStructureError', () => {
    const action = {
      kind: 'validate-provider',
      actionId: 'dup' as ProvisioningActionId,
      dependsOn: [],
      mutationPolicy: { mutating: false },
      authorization: { authorizationId: 'auth-001', authorizationDecisionId: 'd1', authorizedTargetHash: 'h1' },
      providerId: 'p1',
      probe: { kind: 'manifest-check' },
    }
    const plan = buildPlan({ authorizedActions: [action, { ...action }] })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('install-language-package with no matching manifest hash → PlanStructureError', () => {
    const plan = buildPlan({
      authorizedActions: [{
        kind: 'install-language-package',
        actionId: 'a3' as ProvisioningActionId,
        dependsOn: [],
        ecosystem: 'npm',
        npmManifestHash: 'no-such-hash' as NpmInstallManifestHash,
        existingNodeModulesPolicy: 'require-absent',
        mutationPolicy: { mutating: true, compensation: { kind: 'noop', parameters: {} } },
        authorization: { authorizationId: 'auth-001', authorizationDecisionId: 'd1', authorizedTargetHash: 'h1' },
      }],
    })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('fetch-artifact with no matching verifiedArtifact → PlanStructureError', () => {
    const plan = buildPlan({
      authorizedActions: [{
        kind: 'fetch-artifact',
        actionId: 'a4' as ProvisioningActionId,
        dependsOn: [],
        artifactAuthorizationId: 'no-such-aai' as ArtifactAuthorizationId,
        quarantineRetentionPolicy: 'retain-until-cleanup',
        mutationPolicy: { mutating: true, compensation: { kind: 'noop', parameters: {} } },
        authorization: { authorizationId: 'auth-001', authorizationDecisionId: 'd1', authorizedTargetHash: 'h1' },
      }],
    })
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })

  it('valid minimal plan parses successfully', () => {
    const plan = buildPlan()
    const result = parser.parse(plan)
    expect(result.kind).toBe('authorized-capability-resolution-plan')
  })

  it('ed25519 proof missing keyId → PlanStructureError', () => {
    const plan = buildPlan({}, { algorithm: 'ed25519', signatureEncoding: 'base64', signature: 'abc=', token: undefined })
    // Remove keyId — proofOverrides won't have it and default token override removes in-process fields
    const planWithBadProof = {
      ...plan,
      authorizationProof: {
        algorithm: 'ed25519',
        issuer: 'test-issuer' as AuthorizationIssuerId,
        signedPayloadHash: (plan as Record<string, unknown>)['semanticHash'],
        signatureEncoding: 'base64',
        signature: 'abc=',
        // keyId intentionally absent
      },
    }
    expect(() => parser.parse(planWithBadProof)).toThrowError(PlanStructureError)
  })

  it('in-process-token proof missing token → PlanStructureError', () => {
    const base = buildBase()
    const semanticHash = sha256Hex(canonicalize(base)) as AuthorizedPlanSemanticHash
    const plan = {
      ...base,
      semanticHash,
      authorizationProof: {
        algorithm: 'in-process-token',
        issuer: 'test-issuer' as AuthorizationIssuerId,
        signedPayloadHash: semanticHash,
        // token intentionally absent
      },
    }
    expect(() => parser.parse(plan)).toThrowError(PlanStructureError)
  })
})
