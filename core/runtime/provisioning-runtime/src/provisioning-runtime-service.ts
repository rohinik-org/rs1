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
} from '@rohinik-org/provisioning-ir'
import type { AuthorizedPlanParser } from './plan-parser.js'
import type { AuthorizationValidator } from './authorization-validator.js'
import type { ActionGraphCompiler } from './action-graph-compiler.js'
import type { ActionDispatcher, ActionDispatchResult } from './action-dispatcher.js'
import type { SecretReader } from './secret-reader.js'
import { JournalCoordinator } from './journal-coordinator.js'

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
    // ponytail: Stage 9H temporary drift detection — Stage 9I will own rohinik.lock as source of truth
    // When Stage 9I lands, replace this with lock-file comparison for authoritative drift detection.
    const executionId = this.executionIdFactory()
    const plan = this.planParser.parse(rawPlan)
    await this.authValidator.validate(plan)

    const driftItems: ProvisioningDriftItem[] = []

    // Check for rohinik packages listed in plan but workspace root is not guaranteed to exist
    // Lightweight structural check: verify package store path expectations from plan
    for (const action of plan.authorizedActions) {
      if (action.kind === 'install-rohinik-package') {
        // ponytail: basic filesystem probe — Stage 9I replaces with lock-file hash comparison
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
