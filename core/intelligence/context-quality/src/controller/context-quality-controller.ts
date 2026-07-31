import {
  DEFAULT_QUALITY_WEIGHTS,
  QualityDimension,
  ContextAdmissionDecision,
  BudgetStatus,
  ContextQualityErrorCode,
  computePackageHash,
  SystemClock,
  clampScore,
} from '@rohinik-org/context-quality-ir'
import type {
  ContextPackage,
  ContextContract,
  ConsumerContextProfile,
  ContextAdmissionResult,
  ContextQualityVector,
  ContextQualityService,
  ContextQualityTelemetry,
  QualityWarning,
  Clock,
  IdGenerator,
} from '@rohinik-org/context-quality-ir'
import { emitAdmissionTelemetry, emitEvaluationStarted, emitEvaluationCompleted } from '../telemetry/telemetry-bus.js'
import { makeContextFreeDeclaration } from '../invocation/invocation-context.js'
import { BudgetGovernor }         from '../budget/budget-governor.js'
import { CoverageEvaluator }      from '../evaluators/coverage-evaluator.js'
import { AuthorityEvaluator }     from '../evaluators/authority-evaluator.js'
import { FreshnessEvaluator }     from '../evaluators/freshness-evaluator.js'
import { ProvenanceEvaluator }    from '../evaluators/provenance-evaluator.js'
import { CoherenceEvaluator }     from '../evaluators/coherence-evaluator.js'
import { ConsistencyEvaluator }   from '../evaluators/consistency-evaluator.js'
import { EfficiencyEvaluator }    from '../evaluators/efficiency-evaluator.js'
import { SafetyEvaluator }        from '../evaluators/safety-evaluator.js'
import { QualityReportBuilder }   from '../report/quality-report-builder.js'
import { AdmissionPolicyEngine }  from '../admission/admission-policy-engine.js'
import { ContextManifestBuilder } from '../manifest/manifest-builder.js'

export const CONTROLLER_VERSION = '1.0.0'

interface ControllerDeps {
  readonly clock?:       Clock
  readonly idGenerator?: IdGenerator
  readonly telemetry?:   ContextQualityTelemetry
}

let _idCounter = 0
// ponytail: simple counter id generator; replace with crypto.randomUUID if uniqueness across restarts matters
const defaultIdGenerator: IdGenerator = { nextId: (kind) => `${kind}-${++_idCounter}-${Date.now()}` }

export class ContextQualityController implements ContextQualityService {
  private readonly budget      = new BudgetGovernor()
  private readonly coverage    = new CoverageEvaluator()
  private readonly authority   = new AuthorityEvaluator()
  private readonly freshness   = new FreshnessEvaluator()
  private readonly provenance  = new ProvenanceEvaluator()
  private readonly coherence   = new CoherenceEvaluator()
  private readonly consistency = new ConsistencyEvaluator()
  private readonly efficiency  = new EfficiencyEvaluator()
  private readonly safety      = new SafetyEvaluator()
  private readonly admission:      AdmissionPolicyEngine
  private readonly reportBuilder:  QualityReportBuilder
  private readonly clock:          Clock
  private readonly telemetry?:     ContextQualityTelemetry

  constructor(deps: ControllerDeps = {}) {
    const idGen = deps.idGenerator ?? defaultIdGenerator
    this.clock         = deps.clock ?? SystemClock
    if (deps.telemetry !== undefined) this.telemetry = deps.telemetry
    this.admission     = new AdmissionPolicyEngine(new ContextManifestBuilder(idGen))
    this.reportBuilder = new QualityReportBuilder({ clock: this.clock, idGenerator: idGen })
  }

  async evaluateAndAdmit(
    pkg:         ContextPackage,
    contract:    ContextContract,
    consumer:    ConsumerContextProfile,
    attemptCount = 0,
  ): Promise<ContextAdmissionResult> {
    if (this.telemetry) emitEvaluationStarted(this.telemetry, pkg.packageId, this.clock)

    // For early-exit paths (pre-evaluation rejections), emit with score=0
    const earlyReject = (result: ContextAdmissionResult): ContextAdmissionResult => {
      if (this.telemetry) {
        emitEvaluationCompleted(this.telemetry, pkg.packageId, this.clock, 0)
        emitAdmissionTelemetry(this.telemetry, pkg.packageId, result, this.clock)
      }
      return result
    }

    // INV-11D-008 / L-11D-008: verify package has not been mutated since assembly
    const expectedHash = computePackageHash(pkg)
    if (expectedHash !== pkg.packageHash) {
      return earlyReject({
        decision: ContextAdmissionDecision.REJECTED,
        reasons: [{ code: ContextQualityErrorCode.PACKAGE_MUTATED, message: 'Package hash mismatch — mutated after assembly' }],
      })
    }

    // Enforce contextRequirement
    if (contract.contextRequirement === 'required' && pkg.items.length === 0) {
      return earlyReject({
        decision: ContextAdmissionDecision.REJECTED,
        reasons: [{ code: ContextQualityErrorCode.REQUIRED_ITEM_MISSING, message: 'Contract requires context but package has no items' }],
      })
    }
    if (contract.contextRequirement === 'none' && pkg.items.length > 0) {
      return earlyReject({
        decision: ContextAdmissionDecision.REJECTED,
        reasons: [{ code: ContextQualityErrorCode.REQUIRED_ITEM_MISSING, message: 'Contract declares no-context but package contains items' }],
      })
    }
    // contextRequirement='none' + empty package → context-free declaration (L-11D-001 compliant)
    if (contract.contextRequirement === 'none' && pkg.items.length === 0) {
      const declaration = makeContextFreeDeclaration(contract.operationId, contract.contractId, contract)
      const result: ContextAdmissionResult = {
        decision: ContextAdmissionDecision.ADMITTED,
        reasons: [],
        contextFreeDeclaration: declaration,
      }
      if (this.telemetry) emitAdmissionTelemetry(this.telemetry, pkg.packageId, result, this.clock)
      return result
    }

    // Hard budget pre-check (INV-11D-003)
    const budgetResult = this.budget.assess(pkg, contract.budget, consumer)
    if (budgetResult.status === BudgetStatus.HARD_LIMIT_EXCEEDED || budgetResult.status === BudgetStatus.CONSUMER_UNIT_UNSUPPORTED) {
      const code = budgetResult.status === BudgetStatus.CONSUMER_UNIT_UNSUPPORTED
        ? ContextQualityErrorCode.CONSUMER_PROFILE_INCOMPATIBLE
        : ContextQualityErrorCode.BUDGET_EXCEEDED
      return earlyReject({
        decision: ContextAdmissionDecision.REJECTED,
        reasons: [{ code, message: `Budget: ${budgetResult.status} (${budgetResult.totalEstimatedTokens} vs ${budgetResult.effectiveBudget})` }],
      })
    }
    const softBudgetWarnings: QualityWarning[] = budgetResult.status === BudgetStatus.SOFT_LIMIT_EXCEEDED
      ? [{ dimension: QualityDimension.EFFICIENCY, message: `Context package exceeds soft budget threshold (${budgetResult.totalEstimatedTokens} of ${budgetResult.effectiveBudget} tokens)` }]
      : []

    // Safety gate — metadata check before scoring
    const safetyResult = this.safety.evaluate(pkg.items, consumer)
    if (safetyResult.blocked) {
      return earlyReject({
        decision: ContextAdmissionDecision.REJECTED,
        reasons: safetyResult.reasons.map(r => ({ code: ContextQualityErrorCode.SAFETY_POLICY_VIOLATION, message: r })),
      })
    }

    // Evaluate all quality dimensions
    const coverageResult = this.coverage.evaluate(pkg.items, contract.requirements)
    const items = pkg.items

    const vector: ContextQualityVector = {
      relevance:   items.length > 0 ? clampScore(items.reduce((s, i) => s + i.relevance.score, 0) / items.length) : 1.0,
      authority:   this.authority.evaluate(items),
      coverage:    coverageResult.score,
      coherence:   this.coherence.evaluate(items, pkg.relationships),
      consistency: this.consistency.evaluate(items, pkg.relationships),
      freshness:   this.freshness.evaluate(items, contract.requirements),
      provenance:  this.provenance.evaluate(items),
      efficiency:  this.efficiency.evaluate(items),
      safety:      1.0,
    }

    const report = this.reportBuilder.build(
      pkg.packageId,
      vector,
      coverageResult.coverage,
      safetyResult.warnings,
      softBudgetWarnings,
      CONTROLLER_VERSION,
      contract.admissionPolicy,
    )

    if (this.telemetry) emitEvaluationCompleted(this.telemetry, pkg.packageId, this.clock, report.compositeScore)
    const result = await this.admission.decide(report, contract.admissionPolicy, pkg, contract, attemptCount)
    if (this.telemetry) emitAdmissionTelemetry(this.telemetry, pkg.packageId, result, this.clock)
    return result
  }
}
