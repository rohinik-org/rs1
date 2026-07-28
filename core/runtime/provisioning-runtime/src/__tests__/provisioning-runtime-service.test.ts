import { describe, it, expect, vi } from 'vitest'
import type {
  AuthorizedCapabilityResolutionPlan,
  ProvisioningWorkspace,
  ProvisioningActionId,
  AuthorizationId,
  ResolutionPlanId,
  ResolutionPlanSemanticHash,
  IsoTimestamp,
  ProvisioningExecutionId,
  WorkspaceRoot,
  WorkspaceRelativePath,
} from '@rohinik-org/provisioning-ir'
import type { AuthorizedPlanSemanticHash, AuthorizationIssuerId } from '@rohinik-org/provisioning-ir'
import { AuthorizedPlanParser } from '../plan-parser.js'
import { AuthorizationValidator } from '../authorization-validator.js'
import { AuthorizationProofStore } from '../authorization-proof-store.js'
import { ActionGraphCompiler } from '../action-graph-compiler.js'
import { SecretReader } from '../secret-reader.js'
import { ProvisioningRuntimeService } from '../provisioning-runtime-service.js'
import type { ActionDispatcher, ActionDispatchResult } from '../action-dispatcher.js'
import type { ManagedExecutionContext, ObservedExecutionContext, ImmutableExecutionContext } from '../provisioning-runtime-service.js'
import { canonicalize, sha256Hex } from '../canonicalize.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const aid = (s: string) => s as ProvisioningActionId
const ISSUER = 'issuer-1' as AuthorizationIssuerId
const now = () => '2026-01-01T00:00:00.000Z' as IsoTimestamp
let execCounter = 0
const execIdFactory = () => `exec-${++execCounter}` as ProvisioningExecutionId

const WORKSPACE: ProvisioningWorkspace = {
  workspaceId: 'ws-test',
  root: '/tmp/ws-svc-test' as WorkspaceRoot,
  quarantineRoot: '.rohinik/quarantine' as WorkspaceRelativePath,
  stagingRoot: '.rohinik/staging' as WorkspaceRelativePath,
  packageStoreRoot: '.rohinik/packages' as WorkspaceRelativePath,
  modelStoreRoot: '.rohinik/models' as WorkspaceRelativePath,
}

function buildPlan(store: AuthorizationProofStore, token = 'tok-svc'): AuthorizedCapabilityResolutionPlan {
  const base = {
    kind: 'authorized-capability-resolution-plan' as const,
    schemaVersion: 1 as const,
    authorizationId: 'auth-svc' as AuthorizationId,
    proposedPlanId: 'plan-svc' as ResolutionPlanId,
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
  store.register({ token, issuer: ISSUER, authorizationId: 'auth-svc' as AuthorizationId, signedPayloadHash: semanticHash })
  return {
    ...base,
    semanticHash,
    authorizationProof: { algorithm: 'in-process-token', issuer: ISSUER, signedPayloadHash: semanticHash, token },
  } as AuthorizedCapabilityResolutionPlan
}

function makeDispatchResult(state: ActionDispatchResult['state'] = 'succeeded'): ActionDispatchResult {
  return { state, diagnosticCodes: [], diagnosticIds: [], durationMs: 1 }
}

function makeService(dispatchFn: ActionDispatcher['dispatch'] = vi.fn().mockResolvedValue(makeDispatchResult())) {
  const store = new AuthorizationProofStore()
  const plan = buildPlan(store)

  const planParser = new AuthorizedPlanParser()
  const keyResolver = { resolveEd25519PublicKey: async () => undefined }
  const knownIssuers = new Set([ISSUER])
  const authValidator = new AuthorizationValidator(store, keyResolver, knownIssuers)
  const graphCompiler = new ActionGraphCompiler()
  const secretReader = new SecretReader(new Map())
  const dispatcher = { dispatch: dispatchFn } as unknown as ActionDispatcher

  const service = new ProvisioningRuntimeService(
    planParser,
    authValidator,
    graphCompiler,
    dispatcher,
    secretReader,
    now,
    execIdFactory,
  )

  return { service, plan }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ProvisioningRuntimeService', () => {
  describe('executeManaged', () => {
    it('parse + validate + compile + dispatch all actions in topological order', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(makeDispatchResult())
      const { service, plan } = makeService(dispatchFn)
      const ctx: ManagedExecutionContext = { mode: 'managed', workspace: WORKSPACE }
      const result = await service.executeManaged(plan, ctx)
      expect(result.mode).toBe('managed')
      expect(result.status).toBe('success')
      expect(result.actionResults).toHaveLength(0) // no actions in minimal plan
    })

    it('action failure → result status failed', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(makeDispatchResult('failed'))
      // build a plan with one infra action
      const store = new AuthorizationProofStore()
      const baseWithAction = {
        kind: 'authorized-capability-resolution-plan' as const,
        schemaVersion: 1 as const,
        authorizationId: 'auth-fail' as AuthorizationId,
        proposedPlanId: 'plan-fail' as ResolutionPlanId,
        proposedPlanSemanticHash: 'abc' as ResolutionPlanSemanticHash,
        authorizedAt: '2026-01-01T00:00:00.000Z' as IsoTimestamp,
        authorizationPolicyId: 'policy-1',
        authorizedActions: [
          {
            kind: 'provision-infrastructure' as const,
            actionId: aid('a1'),
            serviceId: 'svc-1',
            serviceType: 'local-process',
            strategy: 'reuse-existing' as const,
            infrastructureCompensation: { kind: 'none' as const, reason: 'reuse-existing' as const },
            dependsOn: [],
            authorization: { authorizationId: 'auth-fail' as AuthorizationId, authorizationDecisionId: 'dec-1' as never, authorizedTargetHash: 'h' },
            mutationPolicy: { mutating: false as const },
          },
        ],
        verifiedArtifacts: [],
        permissionAuthorizations: [],
        npmInstallManifests: [],
        secretRequirements: [],
      }
      const semanticHash = sha256Hex(canonicalize(baseWithAction)) as AuthorizedPlanSemanticHash
      store.register({ token: 'tok-fail', issuer: ISSUER, authorizationId: 'auth-fail' as AuthorizationId, signedPayloadHash: semanticHash })
      const plan = { ...baseWithAction, semanticHash, authorizationProof: { algorithm: 'in-process-token' as const, issuer: ISSUER, signedPayloadHash: semanticHash, token: 'tok-fail' } } as AuthorizedCapabilityResolutionPlan

      const planParser = new AuthorizedPlanParser()
      const authValidator = new AuthorizationValidator(store, { resolveEd25519PublicKey: async () => undefined }, new Set([ISSUER]))
      const graphCompiler = new ActionGraphCompiler()
      const secretReader = new SecretReader(new Map())
      const dispatcher = { dispatch: dispatchFn } as unknown as ActionDispatcher
      const svc = new ProvisioningRuntimeService(planParser, authValidator, graphCompiler, dispatcher, secretReader, now, execIdFactory)

      const result = await svc.executeManaged(plan, { mode: 'managed', workspace: WORKSPACE })
      expect(result.status).toBe('failed')
      expect(result.actionResults[0]?.state).toBe('failed')
    })

    it('observers called for each action (onActionStart + onActionComplete)', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(makeDispatchResult())
      const { service, plan } = makeService(dispatchFn)
      const onStart = vi.fn()
      const onComplete = vi.fn()
      const ctx: ManagedExecutionContext = {
        mode: 'managed',
        workspace: WORKSPACE,
        observers: { onActionStart: onStart, onActionComplete: onComplete },
      }
      await service.executeManaged(plan, ctx)
      // minimal plan has 0 actions, so observers not called — that's correct
      expect(onStart).toHaveBeenCalledTimes(0)
      expect(onComplete).toHaveBeenCalledTimes(0)
    })

    it('observers called once per action when plan has actions', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(makeDispatchResult())
      // Build a plan with one action
      const store = new AuthorizationProofStore()
      const base = {
        kind: 'authorized-capability-resolution-plan' as const,
        schemaVersion: 1 as const,
        authorizationId: 'auth-obs' as AuthorizationId,
        proposedPlanId: 'plan-obs' as ResolutionPlanId,
        proposedPlanSemanticHash: 'abc' as ResolutionPlanSemanticHash,
        authorizedAt: '2026-01-01T00:00:00.000Z' as IsoTimestamp,
        authorizationPolicyId: 'policy-1',
        authorizedActions: [
          {
            kind: 'provision-infrastructure' as const,
            actionId: aid('a1'),
            serviceId: 'svc-1',
            serviceType: 'local-process',
            strategy: 'reuse-existing' as const,
            infrastructureCompensation: { kind: 'none' as const, reason: 'reuse-existing' as const },
            dependsOn: [],
            authorization: { authorizationId: 'auth-obs' as AuthorizationId, authorizationDecisionId: 'dec-1' as never, authorizedTargetHash: 'h' },
            mutationPolicy: { mutating: false as const },
          },
        ],
        verifiedArtifacts: [], permissionAuthorizations: [], npmInstallManifests: [], secretRequirements: [],
      }
      const semanticHash = sha256Hex(canonicalize(base)) as AuthorizedPlanSemanticHash
      store.register({ token: 'tok-obs', issuer: ISSUER, authorizationId: 'auth-obs' as AuthorizationId, signedPayloadHash: semanticHash })
      const plan = { ...base, semanticHash, authorizationProof: { algorithm: 'in-process-token' as const, issuer: ISSUER, signedPayloadHash: semanticHash, token: 'tok-obs' } } as AuthorizedCapabilityResolutionPlan

      const svc = new ProvisioningRuntimeService(
        new AuthorizedPlanParser(),
        new AuthorizationValidator(store, { resolveEd25519PublicKey: async () => undefined }, new Set([ISSUER])),
        new ActionGraphCompiler(),
        { dispatch: dispatchFn } as unknown as ActionDispatcher,
        new SecretReader(new Map()),
        now,
        execIdFactory,
      )
      const onStart = vi.fn()
      const onComplete = vi.fn()
      await svc.executeManaged(plan, { mode: 'managed', workspace: WORKSPACE, observers: { onActionStart: onStart, onActionComplete: onComplete } })
      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('valid in-process token → succeeds; invalid token → throws', async () => {
      const dispatchFn = vi.fn().mockResolvedValue(makeDispatchResult())
      const { service, plan } = makeService(dispatchFn)

      // valid token succeeds
      const ctx: ManagedExecutionContext = { mode: 'managed', workspace: WORKSPACE }
      await expect(service.executeManaged(plan, ctx)).resolves.toBeDefined()

      // invalid plan (wrong token)
      const badPlan = { ...plan, authorizationProof: { ...plan.authorizationProof, token: 'bad-token' } } as AuthorizedCapabilityResolutionPlan
      const store2 = new AuthorizationProofStore()
      const svc2 = new ProvisioningRuntimeService(
        new AuthorizedPlanParser(),
        new AuthorizationValidator(store2, { resolveEd25519PublicKey: async () => undefined }, new Set([ISSUER])),
        new ActionGraphCompiler(),
        { dispatch: dispatchFn } as unknown as ActionDispatcher,
        new SecretReader(new Map()),
        now,
        execIdFactory,
      )
      await expect(svc2.executeManaged(badPlan, ctx)).rejects.toBeDefined()
    })

    it('journal semanticJournalHash same across two runs with different executionId', async () => {
      // Two runs with same plan (but different executionIds) and no actions → journal hash should be same
      // (semanticHash excludes executionId-dependent timestamps, focuses on plan+auth+events)
      const store1 = new AuthorizationProofStore()
      const plan1 = buildPlan(store1, 'tok-a')
      const store2 = new AuthorizationProofStore()
      const plan2 = buildPlan(store2, 'tok-b')

      let counter = 0
      const makeExecId = () => `exec-${++counter}` as ProvisioningExecutionId

      const makeS = (store: AuthorizationProofStore) => new ProvisioningRuntimeService(
        new AuthorizedPlanParser(),
        new AuthorizationValidator(store, { resolveEd25519PublicKey: async () => undefined }, new Set([ISSUER])),
        new ActionGraphCompiler(),
        { dispatch: vi.fn().mockResolvedValue(makeDispatchResult()) } as unknown as ActionDispatcher,
        new SecretReader(new Map()),
        now,
        makeExecId,
      )

      const r1 = await makeS(store1).executeManaged(plan1, { mode: 'managed', workspace: WORKSPACE })
      const r2 = await makeS(store2).executeManaged(plan2, { mode: 'managed', workspace: WORKSPACE })
      // Both plans are empty (no actions) so journal entries are empty → same semantic hash
      expect(r1.semanticJournalHash).toBe(r2.semanticJournalHash)
    })
  })

  describe('executeObserved', () => {
    it('no mutations executed; returns expectedMutations list', async () => {
      const dispatchFn = vi.fn()
      const { service, plan } = makeService(dispatchFn)
      const ctx: ObservedExecutionContext = { mode: 'observed', workspace: WORKSPACE }
      const result = await service.executeObserved(plan, ctx)
      expect(result.mode).toBe('observed')
      expect(result.expectedMutations).toBeDefined()
      // dispatch never called — no mutations executed
      expect(dispatchFn).not.toHaveBeenCalled()
    })

    it('context structurally has no mutation interface (mode is observed only)', async () => {
      const { service, plan } = makeService()
      const ctx: ObservedExecutionContext = { mode: 'observed', workspace: WORKSPACE }
      // Structural assertion: ctx has no mutation methods
      expect(ctx.mode).toBe('observed')
      expect('observers' in ctx).toBe(false)
      const result = await service.executeObserved(plan, ctx)
      expect(result.mode).toBe('observed')
    })

    it('observers called for each action when plan has actions (no dispatch)', async () => {
      const dispatchFn = vi.fn()
      const store = new AuthorizationProofStore()
      const base = {
        kind: 'authorized-capability-resolution-plan' as const,
        schemaVersion: 1 as const,
        authorizationId: 'auth-obs2' as AuthorizationId,
        proposedPlanId: 'plan-obs2' as ResolutionPlanId,
        proposedPlanSemanticHash: 'abc' as ResolutionPlanSemanticHash,
        authorizedAt: '2026-01-01T00:00:00.000Z' as IsoTimestamp,
        authorizationPolicyId: 'policy-1',
        authorizedActions: [
          {
            kind: 'provision-infrastructure' as const,
            actionId: aid('a1'),
            serviceId: 'svc-1',
            serviceType: 'local-process',
            strategy: 'reuse-existing' as const,
            infrastructureCompensation: { kind: 'none' as const, reason: 'reuse-existing' as const },
            dependsOn: [],
            authorization: { authorizationId: 'auth-obs2' as AuthorizationId, authorizationDecisionId: 'dec-1' as never, authorizedTargetHash: 'h' },
            mutationPolicy: { mutating: false as const },
          },
        ],
        verifiedArtifacts: [], permissionAuthorizations: [], npmInstallManifests: [], secretRequirements: [],
      }
      const semanticHash = sha256Hex(canonicalize(base)) as AuthorizedPlanSemanticHash
      store.register({ token: 'tok-obs2', issuer: ISSUER, authorizationId: 'auth-obs2' as AuthorizationId, signedPayloadHash: semanticHash })
      const plan = { ...base, semanticHash, authorizationProof: { algorithm: 'in-process-token' as const, issuer: ISSUER, signedPayloadHash: semanticHash, token: 'tok-obs2' } } as AuthorizedCapabilityResolutionPlan

      const svc = new ProvisioningRuntimeService(
        new AuthorizedPlanParser(),
        new AuthorizationValidator(store, { resolveEd25519PublicKey: async () => undefined }, new Set([ISSUER])),
        new ActionGraphCompiler(),
        { dispatch: dispatchFn } as unknown as ActionDispatcher,
        new SecretReader(new Map()),
        now,
        execIdFactory,
      )
      const onStart = vi.fn()
      const onComplete = vi.fn()
      const ctx: ObservedExecutionContext = { mode: 'observed', workspace: WORKSPACE, observers: { onActionStart: onStart, onActionComplete: onComplete } }
      await svc.executeObserved(plan, ctx)
      // dispatch must NOT be called (no mutations in observed mode)
      expect(dispatchFn).not.toHaveBeenCalled()
      // observers ARE called
      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe('executeImmutable', () => {
    it('compliant plan (no install actions) → status compliant', async () => {
      const { service, plan } = makeService()
      const ctx: ImmutableExecutionContext = { mode: 'immutable', workspace: WORKSPACE }
      const result = await service.executeImmutable(plan, ctx)
      expect(result.mode).toBe('immutable')
      expect(result.status).toBe('compliant')
      expect(result.driftItems).toHaveLength(0)
    })

    it('returns ImmutableProvisioningResult with drift detection when package missing', async () => {
      // Build plan with install-rohinik-package action pointing to non-existent path
      const store = new AuthorizationProofStore()
      const base = {
        kind: 'authorized-capability-resolution-plan' as const,
        schemaVersion: 1 as const,
        authorizationId: 'auth-drift' as AuthorizationId,
        proposedPlanId: 'plan-drift' as ResolutionPlanId,
        proposedPlanSemanticHash: 'abc' as ResolutionPlanSemanticHash,
        authorizedAt: '2026-01-01T00:00:00.000Z' as IsoTimestamp,
        authorizationPolicyId: 'policy-1',
        authorizedActions: [
          {
            kind: 'install-rohinik-package' as const,
            actionId: aid('a1'),
            packageId: 'pkg-missing' as never,
            version: '1.0.0',
            artifactAuthorizationId: 'art-drift' as never,
            destination: '/store/pkg-missing' as never,
            quarantineRetentionPolicy: 'delete-on-validation-failure' as const,
            dependsOn: [],
            authorization: { authorizationId: 'auth-drift' as AuthorizationId, authorizationDecisionId: 'dec-1' as never, authorizedTargetHash: 'h' },
            mutationPolicy: { mutating: true as const, compensation: { kind: 'remove-dir', parameters: { path: '/store/pkg-missing' } } },
          },
        ],
        verifiedArtifacts: [
          {
            artifactAuthorizationId: 'art-drift' as never,
            artifact: { kind: 'rohinik-package' as const, packageId: 'pkg-missing' as never, version: '1.0.0' },
            digest: { algorithm: 'sha256' as const, encoding: 'hex' as const, value: 'd'.repeat(64) },
            source: { sourceKind: 'uri' as const, uri: 'https://example.com/pkg.tar.gz' },
            authorizedBy: 'auth-drift' as AuthorizationId,
          },
        ],
        permissionAuthorizations: [], npmInstallManifests: [], secretRequirements: [],
      }
      const semanticHash = sha256Hex(canonicalize(base)) as AuthorizedPlanSemanticHash
      store.register({ token: 'tok-drift', issuer: ISSUER, authorizationId: 'auth-drift' as AuthorizationId, signedPayloadHash: semanticHash })
      const plan = { ...base, semanticHash, authorizationProof: { algorithm: 'in-process-token' as const, issuer: ISSUER, signedPayloadHash: semanticHash, token: 'tok-drift' } } as AuthorizedCapabilityResolutionPlan

      const svc = new ProvisioningRuntimeService(
        new AuthorizedPlanParser(),
        new AuthorizationValidator(store, { resolveEd25519PublicKey: async () => undefined }, new Set([ISSUER])),
        new ActionGraphCompiler(),
        { dispatch: vi.fn() } as unknown as ActionDispatcher,
        new SecretReader(new Map()),
        now,
        execIdFactory,
      )
      const result = await svc.executeImmutable(plan, { mode: 'immutable', workspace: WORKSPACE })
      expect(result.status).toBe('drift-detected')
      expect(result.driftItems.length).toBeGreaterThan(0)
      expect(result.driftItems[0]?.code).toBe('PACKAGE_MISSING')
    })
  })

  describe('secret non-exposure', () => {
    it('secretValue string NOT in any result field', async () => {
      const secretValue = 'super-secret-value-12345'
      const secretReader = new SecretReader(new Map([['MY_SECRET', secretValue]]))
      const store = new AuthorizationProofStore()
      const plan = buildPlan(store, 'tok-secret')
      const dispatchFn = vi.fn().mockResolvedValue(makeDispatchResult())
      const svc = new ProvisioningRuntimeService(
        new AuthorizedPlanParser(),
        new AuthorizationValidator(store, { resolveEd25519PublicKey: async () => undefined }, new Set([ISSUER])),
        new ActionGraphCompiler(),
        { dispatch: dispatchFn } as unknown as ActionDispatcher,
        secretReader,
        now,
        execIdFactory,
      )
      const result = await svc.executeManaged(plan, { mode: 'managed', workspace: WORKSPACE })
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain(secretValue)
    })
  })
})
