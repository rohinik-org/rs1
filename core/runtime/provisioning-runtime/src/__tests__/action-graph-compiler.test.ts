import { describe, it, expect } from 'vitest'
import { ActionGraphCompiler } from '../action-graph-compiler.js'
import { PreflightError, CyclicDependencyError } from '@rohinik-org/provisioning-ir'
import type {
  AuthorizedCapabilityResolutionPlan,
  AuthorizedProvisioningAction,
  ProvisioningActionId,
  AuthorizationId,
  AuthorizationIssuerId,
  AuthorizedPlanSemanticHash,
  ArtifactAuthorizationId,
  NpmInstallManifestHash,
  ResolutionPlanId,
  ResolutionPlanSemanticHash,
} from '@rohinik-org/provisioning-ir'
import type { IsoTimestamp } from '@rohinik-org/provisioning-ir'

const compiler = new ActionGraphCompiler()

// ── helpers ──────────────────────────────────────────────────────────────────
const AUTH_REF = {
  authorizationId: 'auth-001' as AuthorizationId,
  authorizationDecisionId: 'dec-001' as any,
  authorizedTargetHash: 'hash',
}

function basePlan(actions: AuthorizedProvisioningAction[], overrides: Partial<AuthorizedCapabilityResolutionPlan> = {}): AuthorizedCapabilityResolutionPlan {
  return {
    kind: 'authorized-capability-resolution-plan',
    schemaVersion: 1,
    authorizationId: 'auth-001' as AuthorizationId,
    proposedPlanId: 'plan-001' as ResolutionPlanId,
    proposedPlanSemanticHash: 'psh' as ResolutionPlanSemanticHash,
    authorizedAt: '2026-01-01T00:00:00.000Z' as IsoTimestamp,
    authorizationPolicyId: 'policy-1',
    authorizedActions: actions,
    verifiedArtifacts: [],
    permissionAuthorizations: [],
    npmInstallManifests: [],
    secretRequirements: [],
    semanticHash: 'sh' as AuthorizedPlanSemanticHash,
    authorizationProof: {
      algorithm: 'in-process-token',
      issuer: 'test' as AuthorizationIssuerId,
      signedPayloadHash: 'sh' as AuthorizedPlanSemanticHash,
      token: 'tok',
    },
    ...overrides,
  }
}

function validateProvider(id: string, deps: string[] = []): AuthorizedProvisioningAction {
  return {
    kind: 'validate-provider',
    actionId: id as ProvisioningActionId,
    dependsOn: deps as ProvisioningActionId[],
    authorization: AUTH_REF,
    mutationPolicy: { mutating: false },
    providerId: 'p1',
    probe: { kind: 'manifest-check' },
  }
}

function registerProvider(id: string, deps: string[] = []): AuthorizedProvisioningAction {
  return {
    kind: 'register-provider',
    actionId: id as ProvisioningActionId,
    dependsOn: deps as ProvisioningActionId[],
    authorization: AUTH_REF,
    mutationPolicy: { mutating: true, compensation: { kind: 'remove-registration', parameters: {} } },
    providerId: 'p1',
    packageId: 'pkg' as any,
    packageVersion: '1.0.0',
    capabilityIds: [],
  }
}

function activateProvider(id: string, providerId: string, deps: string[] = []): AuthorizedProvisioningAction {
  return {
    kind: 'activate-provider',
    actionId: id as ProvisioningActionId,
    dependsOn: deps as ProvisioningActionId[],
    authorization: AUTH_REF,
    mutationPolicy: { mutating: true, compensation: { kind: 'deactivate-provider', parameters: {} } },
    activation: {
      providerId,
      packageId: 'pkg' as any,
      version: '1.0.0',
      capabilityIds: [],
      activationMode: 'new',
    },
  }
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('ActionGraphCompiler', () => {
  it('compiles empty plan', () => {
    const result = compiler.compile(basePlan([]))
    expect(result.topologicalOrder).toEqual([])
    expect(result.actionById.size).toBe(0)
  })

  it('compiles valid single action', () => {
    const action = validateProvider('a1')
    const result = compiler.compile(basePlan([action]))
    expect(result.topologicalOrder).toEqual(['a1'])
    expect(result.actionById.get('a1' as ProvisioningActionId)).toBe(action)
  })

  it('produces correct topological order: a1 → a2 → a3', () => {
    const actions = [
      registerProvider('a1'),
      registerProvider('a2', ['a1']),
      registerProvider('a3', ['a2']),
    ]
    const result = compiler.compile(basePlan(actions))
    expect(result.topologicalOrder).toEqual(['a1', 'a2', 'a3'])
  })

  it('tie-breaks by code-unit actionId ordering (deterministic)', () => {
    // c1 depends on nothing, b1 depends on nothing, a1 depends on nothing
    // code-unit order: a1 < b1 < c1
    const actions = [
      registerProvider('c1'),
      registerProvider('b1'),
      registerProvider('a1'),
    ]
    const result = compiler.compile(basePlan(actions))
    expect(result.topologicalOrder).toEqual(['a1', 'b1', 'c1'])
  })

  it('topological order is deterministic regardless of insertion order', () => {
    const order1 = [registerProvider('z1'), registerProvider('m1'), registerProvider('a1')]
    const order2 = [registerProvider('a1'), registerProvider('z1'), registerProvider('m1')]
    const r1 = compiler.compile(basePlan(order1))
    const r2 = compiler.compile(basePlan(order2))
    expect(r1.topologicalOrder).toEqual(r2.topologicalOrder)
    expect(r1.topologicalOrder).toEqual(['a1', 'm1', 'z1'])
  })

  it('throws PreflightError on duplicate actionId', () => {
    const actions = [validateProvider('dup'), validateProvider('dup')]
    expect(() => compiler.compile(basePlan(actions)))
      .toThrow(PreflightError)
  })

  it('throws PreflightError on missing dependency', () => {
    const action: AuthorizedProvisioningAction = {
      ...validateProvider('a1'),
      dependsOn: ['missing' as ProvisioningActionId],
    }
    expect(() => compiler.compile(basePlan([action])))
      .toThrow(PreflightError)
  })

  it('throws PreflightError on self-loop', () => {
    const action: AuthorizedProvisioningAction = {
      ...validateProvider('a1'),
      dependsOn: ['a1' as ProvisioningActionId],
    }
    expect(() => compiler.compile(basePlan([action])))
      .toThrow(PreflightError)
  })

  it('throws CyclicDependencyError on A→B→C→A cycle', () => {
    const actions: AuthorizedProvisioningAction[] = [
      { ...registerProvider('a'), dependsOn: ['c' as ProvisioningActionId] },
      { ...registerProvider('b'), dependsOn: ['a' as ProvisioningActionId] },
      { ...registerProvider('c'), dependsOn: ['b' as ProvisioningActionId] },
    ]
    expect(() => compiler.compile(basePlan(actions)))
      .toThrow(CyclicDependencyError)
  })

  it('throws PreflightError: validate-only template with mutating: true', () => {
    const action: AuthorizedProvisioningAction = {
      kind: 'apply-configuration-template',
      actionId: 'cfg1' as ProvisioningActionId,
      dependsOn: [],
      authorization: AUTH_REF,
      mutationPolicy: { mutating: true, compensation: { kind: 'remove-file', parameters: {} } },
      template: {
        templateId: 't1',
        configurationKey: 'k',
        destination: 'x.yaml' as any,
        valueType: 'string',
        canonicalContent: '{}',
        contentSemanticHash: 'h',
        writePolicy: 'validate-only',
      },
      secretRequirements: [],
    }
    expect(() => compiler.compile(basePlan([action])))
      .toThrow(PreflightError)
  })

  it('throws PreflightError: create-if-absent template with mutating: false', () => {
    const action: AuthorizedProvisioningAction = {
      kind: 'apply-configuration-template',
      actionId: 'cfg2' as ProvisioningActionId,
      dependsOn: [],
      authorization: AUTH_REF,
      mutationPolicy: { mutating: false },
      template: {
        templateId: 't2',
        configurationKey: 'k',
        destination: 'x.yaml' as any,
        valueType: 'string',
        canonicalContent: '{}',
        contentSemanticHash: 'h',
        writePolicy: 'create-if-absent',
      },
      secretRequirements: [],
    }
    expect(() => compiler.compile(basePlan([action])))
      .toThrow(PreflightError)
  })

  it('throws PreflightError: duplicate activate-provider for same providerId', () => {
    const actions = [activateProvider('act1', 'provider-x'), activateProvider('act2', 'provider-x')]
    expect(() => compiler.compile(basePlan(actions)))
      .toThrow(PreflightError)
  })

  it('throws PreflightError: install-language-package with unknown npmManifestHash', () => {
    const action: AuthorizedProvisioningAction = {
      kind: 'install-language-package',
      actionId: 'npm1' as ProvisioningActionId,
      dependsOn: [],
      authorization: AUTH_REF,
      mutationPolicy: { mutating: true, compensation: { kind: 'remove-node-modules', parameters: {} } },
      ecosystem: 'npm',
      npmManifestHash: 'unknown-hash' as NpmInstallManifestHash,
      existingNodeModulesPolicy: 'require-absent',
    }
    expect(() => compiler.compile(basePlan([action])))
      .toThrow(PreflightError)
  })

  it('throws PreflightError: fetch-artifact with unknown artifactAuthorizationId', () => {
    const action: AuthorizedProvisioningAction = {
      kind: 'fetch-artifact',
      actionId: 'fetch1' as ProvisioningActionId,
      dependsOn: [],
      authorization: AUTH_REF,
      mutationPolicy: { mutating: true, compensation: { kind: 'delete-quarantine', parameters: {} } },
      artifactAuthorizationId: 'unknown-art-id' as ArtifactAuthorizationId,
      quarantineRetentionPolicy: 'delete-on-validation-failure',
    }
    expect(() => compiler.compile(basePlan([action])))
      .toThrow(PreflightError)
  })

  it('accepts valid plan with all action kinds', () => {
    const manifestHash = 'manifest-hash-1' as NpmInstallManifestHash
    const artifactAuthId = 'art-auth-1' as ArtifactAuthorizationId

    const npmAction: AuthorizedProvisioningAction = {
      kind: 'install-language-package',
      actionId: 'npm1' as ProvisioningActionId,
      dependsOn: [],
      authorization: AUTH_REF,
      mutationPolicy: { mutating: true, compensation: { kind: 'remove-node-modules', parameters: {} } },
      ecosystem: 'npm',
      npmManifestHash: manifestHash,
      existingNodeModulesPolicy: 'require-absent',
    }
    const fetchAction: AuthorizedProvisioningAction = {
      kind: 'fetch-artifact',
      actionId: 'fetch1' as ProvisioningActionId,
      dependsOn: [],
      authorization: AUTH_REF,
      mutationPolicy: { mutating: true, compensation: { kind: 'delete-quarantine', parameters: {} } },
      artifactAuthorizationId: artifactAuthId,
      quarantineRetentionPolicy: 'delete-on-validation-failure',
    }
    const plan = basePlan([npmAction, fetchAction], {
      npmInstallManifests: [{
        ecosystem: 'npm',
        lockfileVersion: 3,
        packageJsonCanonicalContent: '{}',
        packageJsonSemanticHash: 'pjs',
        packageLockCanonicalContent: '{}',
        packageLockSemanticHash: 'pls',
        packageRecords: [],
        semanticHash: manifestHash,
      }],
      verifiedArtifacts: [{
        artifactAuthorizationId: artifactAuthId,
        artifact: { kind: 'adapter', adapterId: 'a1', version: '1.0.0' },
        digest: { algorithm: 'sha256', encoding: 'hex', value: 'abc123' },
        source: { sourceKind: 'uri', uri: 'https://example.com/pkg' },
        authorizedBy: 'auth-001' as AuthorizationId,
      }],
    })

    const result = compiler.compile(plan)
    expect(result.topologicalOrder.length).toBe(2)
  })
})
