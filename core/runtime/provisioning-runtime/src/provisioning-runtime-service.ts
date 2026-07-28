import type {
  AuthorizedCapabilityResolutionPlan,
  ManagedProvisioningResult,
  ObservedProvisioningResult,
  ImmutableProvisioningResult,
  ProvisioningActionResult,
  ProviderProvisioningResult,
  ProvisioningExecutionId,
  ProvisioningWorkspace,
  IsoTimestamp,
  ProvisioningActionId,
  ProvisioningDriftItem,
  ProvisioningDriftCode,
} from '@rohinik-org/provisioning-ir'
import type { LockfileStore, LockAdmissionController, DriftEntry, ObservedEnvironmentSnapshot } from '@rohinik-org/lockfile-ir'
import type { WorkspaceInspectors } from '@rohinik-org/lockfile'
import type { AuthorizedPlanParser } from './plan-parser.js'
import type { AuthorizationValidator } from './authorization-validator.js'
import type { ActionGraphCompiler } from './action-graph-compiler.js'
import type { ActionDispatcher, ActionDispatchResult } from './action-dispatcher.js'
import type { SecretReader } from './secret-reader.js'
import { JournalCoordinator } from './journal-coordinator.js'

// Map lockfile drift types to provisioning drift codes
function driftCode(entry: DriftEntry): ProvisioningDriftCode {
  switch (entry.driftType) {
    case 'package-missing': return 'PACKAGE_MISSING'
    case 'package-unexpected': return 'PACKAGE_UNEXPECTED'
    case 'package-version-drift': return 'PACKAGE_VERSION_MISMATCH'
    case 'package-integrity-drift': return 'PACKAGE_INTEGRITY_MISMATCH'
    case 'model-missing': return 'MODEL_MISSING'
    case 'model-integrity-drift': return 'MODEL_INTEGRITY_MISMATCH'
    case 'provider-registry-drift': return 'PROVIDER_REGISTRY_MISMATCH'
    case 'infrastructure-strategy-drift':
    case 'infrastructure-identity-drift':
    case 'infrastructure-configuration-drift': return 'INFRASTRUCTURE_STATE_MISMATCH'
    default: return 'LOCKFILE_HASH_MISMATCH'
  }
}

// Build a minimal observed snapshot from plan actions for lock comparison
// ponytail: only capability/package lists populated from plan; runtime/infra/models/deps empty
function buildObservedFromPlan(plan: AuthorizedCapabilityResolutionPlan): ObservedEnvironmentSnapshot {
  return {
    kind: 'observed-environment-snapshot',
    snapshotVersion: 1,
    application: {},
    runtime: {},
    capabilities: [],
    packages: plan.authorizedActions
      .filter(a => a.kind === 'install-rohinik-package')
      .map(a => ({ packageId: (a as { packageId: string }).packageId })),
    dependencies: {},
    models: [],
    infrastructure: [],
    providers: [],
    configuration: [],
    policies: {},
  }
}

// Build observed snapshot from real workspace inspectors (L-9I-007)
async function buildObservedFromInspectors(inspectors: WorkspaceInspectors): Promise<ObservedEnvironmentSnapshot> {
  const [runtime, languageDependencies] = await Promise.all([
    inspectors.runtimeInspector().inspectRuntime(),
    inspectors.dependencyInspector().inspectDependencies(),
  ])
  return {
    kind: 'observed-environment-snapshot',
    snapshotVersion: 1,
    application: {},
    runtime,
    capabilities: [],
    packages: [],
    dependencies: languageDependencies,
    models: [],
    infrastructure: [],
    providers: [],
    configuration: [],
    policies: {},
  }
}

export interface ProvisioningObservers {
  onActionStart?: (actionId: ProvisioningActionId) => void
  onActionComplete?: (actionId: ProvisioningActionId, result: ActionDispatchResult) => void
}

export interface ManagedExecutionContext {
  readonly mode: 'managed'
  readonly workspace: ProvisioningWorkspace
  readonly observers?: ProvisioningObservers
}

export interface ObservedExecutionContext {
  readonly mode: 'observed'
  readonly workspace: ProvisioningWorkspace
  readonly observers?: ProvisioningObservers
  // NOTE: Only ProvisioningObservers — NO mutation interfaces
}

export interface ImmutableExecutionContext {
  readonly mode: 'immutable'
  readonly workspace: ProvisioningWorkspace
  // NOTE: No mutation interfaces, no observers
}

export class ProvisioningRuntimeService {
  constructor(
    private readonly planParser: AuthorizedPlanParser,
    private readonly authValidator: AuthorizationValidator,
    private readonly graphCompiler: ActionGraphCompiler,
    private readonly dispatcher: ActionDispatcher,
    private readonly secretReader: SecretReader,
    private readonly clock: () => IsoTimestamp,
    private readonly executionIdFactory: () => ProvisioningExecutionId,
    private readonly lockfileStore?: LockfileStore,
    private readonly admissionController?: LockAdmissionController,
    private readonly inspectorsFactory?: (root: string) => WorkspaceInspectors,
  ) {}

  async executeManaged(
    rawPlan: unknown,
    context: ManagedExecutionContext,
  ): Promise<ManagedProvisioningResult> {
    const startedAt = this.clock()
    const executionId = this.executionIdFactory()

    const plan = this.planParser.parse(rawPlan)
    await this.authValidator.validate(plan)
    const graph = this.graphCompiler.compile(plan)

    const journal = new JournalCoordinator(
      executionId,
      plan.proposedPlanId,
      plan.authorizationId,
      this.clock,
    )

    const actionResults: ProvisioningActionResult[] = []
    const providers: ProviderProvisioningResult[] = []
    let anyFailed = false

    for (const actionId of graph.topologicalOrder) {
      const action = graph.actionById.get(actionId)!
      context.observers?.onActionStart?.(actionId)
      const result = await this.dispatcher.dispatch(action, journal)
      context.observers?.onActionComplete?.(actionId, result)

      actionResults.push({
        actionId,
        state: result.state,
        diagnosticCodes: result.diagnosticCodes,
        diagnosticIds: result.diagnosticIds,
        durationMs: result.durationMs,
      })

      if (result.instantiatedProvider) {
        providers.push(result.instantiatedProvider)
      }
      if (result.state === 'failed') {
        anyFailed = true
      }
    }

    const builtJournal = journal.buildJournal()
    const completedAt = this.clock()

    const allProviders = providers
    const status: ManagedProvisioningResult['status'] = anyFailed ? 'failed' : 'success'

    return {
      mode: 'managed',
      executionId,
      authorizationId: plan.authorizationId,
      planId: plan.proposedPlanId,
      status,
      actionResults,
      providers: allProviders,
      semanticJournalHash: builtJournal.semanticJournalHash,
      auditJournalHash: builtJournal.auditJournalHash,
      startedAt,
      completedAt,
    }
  }

  async executeObserved(
    rawPlan: unknown,
    context: ObservedExecutionContext,
  ): Promise<ObservedProvisioningResult> {
    const executionId = this.executionIdFactory()
    const plan = this.planParser.parse(rawPlan)
    await this.authValidator.validate(plan)
    const graph = this.graphCompiler.compile(plan)

    // No mutations executed — describe expected mutations from plan actions
    const expectedMutations: string[] = []
    // ponytail: synthetic 'skipped' result — no dispatch, no journal writes
    const skippedResult: ActionDispatchResult = { state: 'skipped', diagnosticCodes: [], diagnosticIds: [], durationMs: 0 }
    for (const actionId of graph.topologicalOrder) {
      const action = graph.actionById.get(actionId)!
      expectedMutations.push(`${action.kind}:${actionId}`)
      context.observers?.onActionStart?.(actionId)
      context.observers?.onActionComplete?.(actionId, skippedResult)
    }

    const warnings: string[] = []
    // Warn if secrets are missing
    const readiness = await this.secretReader.checkReadiness(plan.secretRequirements)
    if (!readiness.allPresent) {
      for (const name of readiness.missingSecretNames) {
        warnings.push(`missing-secret:${name}`)
      }
    }

    return {
      mode: 'observed',
      executionId,
      authorizationId: plan.authorizationId,
      planId: plan.proposedPlanId,
      expectedMutations,
      warnings,
    }
  }

  async executeImmutable(
    rawPlan: unknown,
    context: ImmutableExecutionContext,
  ): Promise<ImmutableProvisioningResult> {
    const executionId = this.executionIdFactory()
    const plan = this.planParser.parse(rawPlan)
    await this.authValidator.validate(plan)

    // Real lockfile comparison when Stage 9I components are wired
    if (this.lockfileStore !== undefined && this.admissionController !== undefined) {
      const lockfile = await this.lockfileStore.read(context.workspace.root)

      if (lockfile === undefined) {
        // No lockfile — treat as drift: the environment is not locked
        return {
          mode: 'immutable',
          executionId,
          authorizationId: plan.authorizationId,
          planId: plan.proposedPlanId,
          status: 'drift-detected',
          driftItems: [{
            code: 'LOCKFILE_HASH_MISMATCH',
            target: context.workspace.root,
            detail: 'No rohinik.lock found — immutable mode requires a committed lockfile',
          }],
        }
      }

      // Build observed snapshot: use real inspectors if available (L-9I-007), else fall back to plan-derived
      // ponytail: inspectors provide runtime+deps; capabilities/packages/models/infra left empty (no domain inspectors yet)
      const observed = this.inspectorsFactory !== undefined
        ? await buildObservedFromInspectors(this.inspectorsFactory(context.workspace.root))
        : buildObservedFromPlan(plan)
      const decision = this.admissionController.admit(lockfile, observed, 'immutable')

      const driftItems: ProvisioningDriftItem[] = decision.admitted
        ? []
        : decision.report.entries.map(e => ({
            code: driftCode(e),
            target: e.targetId,
            detail: e.remediationHint,
          }))

      return {
        mode: 'immutable',
        executionId,
        authorizationId: plan.authorizationId,
        planId: plan.proposedPlanId,
        status: decision.admitted ? 'compliant' : 'drift-detected',
        driftItems,
      }
    }

    // ponytail: Stage 9H fallback — filesystem probe when lockfile store not injected
    const driftItems: ProvisioningDriftItem[] = []
    for (const action of plan.authorizedActions) {
      if (action.kind === 'install-rohinik-package') {
        const { join } = await import('node:path')
        const { access } = await import('node:fs/promises')
        const expectedPath = join(context.workspace.root, context.workspace.packageStoreRoot, action.packageId)
        try {
          await access(expectedPath)
        } catch {
          driftItems.push({
            code: 'PACKAGE_MISSING',
            target: action.packageId,
            detail: `Expected package at ${expectedPath} but not found`,
          })
        }
      }
    }

    return {
      mode: 'immutable',
      executionId,
      authorizationId: plan.authorizationId,
      planId: plan.proposedPlanId,
      status: driftItems.length === 0 ? 'compliant' : 'drift-detected',
      driftItems,
    }
  }
}
