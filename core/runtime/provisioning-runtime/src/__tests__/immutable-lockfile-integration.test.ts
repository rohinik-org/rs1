/**
 * Stage 9I integration: executeImmutable with real LockAdmissionControllerImpl
 * Uses mocked LockfileStore to avoid filesystem I/O.
 */
import { describe, it, expect, vi } from 'vitest'
import type {
  AuthorizationId,
  ResolutionPlanId,
  ResolutionPlanSemanticHash,
  IsoTimestamp,
  ProvisioningExecutionId,
  WorkspaceRoot,
  WorkspaceRelativePath,
} from '@rohinik-org/provisioning-ir'
import type { AuthorizedPlanSemanticHash, AuthorizationIssuerId } from '@rohinik-org/provisioning-ir'
import type { RohinikLockfileV1, LockfileStore } from '@rohinik-org/lockfile-ir'
import { LockDriftDetectorImpl, LockAdmissionControllerImpl, LockfileGeneratorImpl } from '@rohinik-org/lockfile'
import { AuthorizedPlanParser } from '../plan-parser.js'
import { AuthorizationValidator } from '../authorization-validator.js'
import { AuthorizationProofStore } from '../authorization-proof-store.js'
import { ActionGraphCompiler } from '../action-graph-compiler.js'
import { SecretReader } from '../secret-reader.js'
import { ProvisioningRuntimeService } from '../provisioning-runtime-service.js'
import type { ActionDispatcher, ActionDispatchResult } from '../action-dispatcher.js'
import type { ImmutableExecutionContext } from '../provisioning-runtime-service.js'
import { canonicalize, sha256Hex } from '../canonicalize.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const ISSUER = 'issuer-lockfile-test' as AuthorizationIssuerId
const now = () => '2026-01-01T00:00:00.000Z' as IsoTimestamp
let execCounter = 0
const execIdFactory = () => `exec-lock-${++execCounter}` as ProvisioningExecutionId

const WORKSPACE_ROOT = '/tmp/ws-lockfile-test' as WorkspaceRoot
const IMMUTABLE_CTX: ImmutableExecutionContext = {
  mode: 'immutable',
  workspace: {
    workspaceId: 'ws-lockfile',
    root: WORKSPACE_ROOT,
    quarantineRoot: '.rohinik/quarantine' as WorkspaceRelativePath,
    stagingRoot: '.rohinik/staging' as WorkspaceRelativePath,
    packageStoreRoot: '.rohinik/packages' as WorkspaceRelativePath,
    modelStoreRoot: '.rohinik/models' as WorkspaceRelativePath,
  },
}

function buildMinimalPlan(store: AuthorizationProofStore, token = 'tok-lock') {
  const base = {
    kind: 'authorized-capability-resolution-plan' as const,
    schemaVersion: 1 as const,
    authorizationId: `auth-${token}` as AuthorizationId,
    proposedPlanId: `plan-${token}` as ResolutionPlanId,
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
  store.register({ token, issuer: ISSUER, authorizationId: `auth-${token}` as AuthorizationId, signedPayloadHash: semanticHash })
  return {
    ...base,
    semanticHash,
    authorizationProof: { algorithm: 'in-process-token' as const, issuer: ISSUER, signedPayloadHash: semanticHash, token },
  }
}

function minimalLockfile(): RohinikLockfileV1 {
  // ponytail: minimal valid lockfile shape for admission controller tests
  return {
    kind: 'rohinik-lockfile',
    lockVersion: 1,
    application: { applicationId: 'app-1', manifestSemanticHash: 'msh', manifestSchemaVersion: 1 },
    runtime: { os: 'linux', architecture: 'x64', runtimeKind: 'nodejs', runtimeVersion: 'v20.0.0' },
    resolution: {
      proposedPlanId: 'plan-lock',
      proposedPlanSemanticHash: 'psh',
      authorizedPlanSemanticHash: 'apsh',
      authorizationId: 'auth-lock',
      resolverIdentity: { implementationId: 'resolver-1', version: '1.0.0' },
      resolutionPolicySemanticHash: 'rpsh',
      catalogSnapshots: [],
    },
    capabilities: [],
    packages: [],
    dependencies: {},
    models: [],
    infrastructure: [],
    providers: [],
    configuration: [],
    policies: { trustPolicySemanticHash: 'tpsh', permissionPolicySemanticHash: 'ppsh', authorizationPolicySemanticHash: 'a-psh' },
    semanticHash: 'shash' as never,
    audit: {
      generatedAt: '2026-01-01T00:00:00.000Z',
      generatedBy: { implementationId: 'rhk', version: '0.1.0' },
      provisioningExecutionId: 'exec-1',
      provisioningSemanticJournalHash: 'psjh',
    },
    auditHash: 'ahash' as never,
  }
}

function makeService(lockfileStore?: LockfileStore) {
  const store = new AuthorizationProofStore()
  const plan = buildMinimalPlan(store)
  const detector = new LockDriftDetectorImpl()
  const admissionController = new LockAdmissionControllerImpl(detector)
  const svc = new ProvisioningRuntimeService(
    new AuthorizedPlanParser(),
    new AuthorizationValidator(store, { resolveEd25519PublicKey: async () => undefined }, new Set([ISSUER])),
    new ActionGraphCompiler(),
    { dispatch: vi.fn<ActionDispatcher['dispatch']>().mockResolvedValue({ state: 'succeeded', diagnosticCodes: [], diagnosticIds: [], durationMs: 0 } satisfies ActionDispatchResult) } as unknown as ActionDispatcher,
    new SecretReader(new Map()),
    now,
    execIdFactory,
    lockfileStore,
    admissionController,
  )
  return { svc, plan }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('executeImmutable — Stage 9I lockfile integration', () => {
  it('no lockfile → drift-detected with LOCKFILE_HASH_MISMATCH', async () => {
    const lockfileStore: LockfileStore = {
      read: vi.fn().mockResolvedValue(undefined),
      readRaw: vi.fn().mockResolvedValue(undefined),
      writeAtomic: vi.fn(),
    }
    const { svc, plan } = makeService(lockfileStore)
    const result = await svc.executeImmutable(plan, IMMUTABLE_CTX)
    expect(result.mode).toBe('immutable')
    expect(result.status).toBe('drift-detected')
    expect(result.driftItems).toHaveLength(1)
    expect(result.driftItems[0]?.code).toBe('LOCKFILE_HASH_MISMATCH')
    expect(lockfileStore.read).toHaveBeenCalledWith(WORKSPACE_ROOT)
  })

  it('compliant lockfile (no drift) → admitted, status compliant', async () => {
    // Use LockfileGeneratorImpl to produce a lockfile with correct semantic/audit hashes.
    // Empty packages/caps/models match the empty observed snapshot buildObservedFromPlan produces.
    const generator = new LockfileGeneratorImpl()
    const lockfile = generator.generate(
      {
        kind: 'delivered-environment-snapshot',
        snapshotVersion: 1,
        application: { applicationId: 'app-1', manifestSemanticHash: 'msh', manifestSchemaVersion: 1 },
        runtime: { os: 'linux', architecture: 'x64', runtimeKind: 'nodejs', runtimeVersion: 'v20.0.0' },
        resolution: {
          proposedPlanId: 'plan-lock',
          proposedPlanSemanticHash: 'psh',
          authorizedPlanSemanticHash: 'apsh',
          authorizationId: 'auth-lock',
          resolverIdentity: { implementationId: 'resolver-1', version: '1.0.0' },
          resolutionPolicySemanticHash: 'rpsh',
          catalogSnapshots: [],
        },
        capabilities: [],
        packages: [],
        dependencies: {},
        models: [],
        infrastructure: [],
        providers: [],
        configuration: [],
        policies: { trustPolicySemanticHash: 'tpsh', permissionPolicySemanticHash: 'ppsh', authorizationPolicySemanticHash: 'a-psh' },
        provisioningEvidence: { executionId: 'exec-1', status: 'success', semanticJournalHash: 'psjh' },
      },
      { generatedAt: '2026-01-01T00:00:00.000Z', generatedBy: { implementationId: 'rhk', version: '0.1.0' }, provisioningExecutionId: 'exec-1', provisioningSemanticJournalHash: 'psjh' },
    )
    const lockfileStore: LockfileStore = {
      read: vi.fn().mockResolvedValue(lockfile),
      readRaw: vi.fn().mockResolvedValue(''),
      writeAtomic: vi.fn(),
    }
    const { svc, plan } = makeService(lockfileStore)
    const result = await svc.executeImmutable(plan, IMMUTABLE_CTX)
    expect(result.mode).toBe('immutable')
    expect(result.status).toBe('compliant')
    expect(result.driftItems).toHaveLength(0)
  })

  it('lockfile with package drift → drift-detected, driftItems populated', async () => {
    const lockfile = minimalLockfile()
    // Add a locked package that observed env won't have
    const lockedWithPkg: RohinikLockfileV1 = {
      ...lockfile,
      packages: [{
        packageId: 'pkg-locked',
        version: '1.0.0',
        integrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
        source: { sourceKind: 'registry', registryId: 'reg-1', artifactLocator: 'pkg-locked@1.0.0' },
        packageStoreIdentity: {},
      }],
    }
    const lockfileStore: LockfileStore = {
      read: vi.fn().mockResolvedValue(lockedWithPkg),
      readRaw: vi.fn().mockResolvedValue(''),
      writeAtomic: vi.fn(),
    }
    const { svc, plan } = makeService(lockfileStore)
    const result = await svc.executeImmutable(plan, IMMUTABLE_CTX)
    expect(result.mode).toBe('immutable')
    // Plan has no packages → observed has no packages → locked has pkg-locked → package-missing drift
    expect(result.status).toBe('drift-detected')
    expect(result.driftItems.length).toBeGreaterThan(0)
  })
})
