import { randomUUID } from 'node:crypto'
import type { EventBus } from '@rohinik-org/kernel'
import type {
  EvaluationRequest,
  EvaluationRecord,
  EvaluationPolicyIR,
  EvaluationRecordReadyPayload,
} from '@rohinik-org/evaluation-ir'
import { EvaluationEvent } from '@rohinik-org/evaluation-ir'
import type { OutcomeCollector } from '../collector/outcome-collector.js'
import type { PredictionComparator } from '../comparators/prediction-comparator.js'
import type { PlanningComparator } from '../comparators/planning-comparator.js'
import type { ExecutionComparator } from '../comparators/execution-comparator.js'
import { EvaluationScorer } from '../scorer/evaluation-scorer.js'
import type { ExplanationResolver } from '../resolver/explanation-resolver.js'
import type { EvaluationAssembler } from '../assembler/evaluation-assembler.js'

export class DuplicateEvaluationError extends Error {
  constructor(sessionId: string) {
    super(`Session already evaluated: ${sessionId} (Law 47 — one execution → one record)`)
    this.name = 'DuplicateEvaluationError'
  }
}

export class EvaluationPolicyWeightError extends Error {
  constructor(sum: number) {
    super(`EvaluationPolicy weights must sum to 1.0, got ${sum}`)
    this.name = 'EvaluationPolicyWeightError'
  }
}

export class EvaluationEngine {
  private readonly evaluated = new Set<string>()
  private readonly replayMode: boolean

  constructor(
    private readonly collector: OutcomeCollector,
    private readonly predictionComparator: PredictionComparator,
    private readonly planningComparator: PlanningComparator,
    private readonly executionComparator: ExecutionComparator,
    private readonly scorer: EvaluationScorer,
    private readonly explanationResolver: ExplanationResolver,
    private readonly assembler: EvaluationAssembler,
    private readonly policy: EvaluationPolicyIR,
    private readonly events: EventBus,
    options?: { replayMode?: boolean },
  ) {
    // Validate weight sum — throws EvaluationPolicyWeightError if violated
    const sum = policy.predictionWeight + policy.planningWeight + policy.executionWeight
    if (Math.abs(sum - 1.0) > 1e-9) throw new EvaluationPolicyWeightError(sum)
    this.replayMode = options?.replayMode ?? false
  }

  evaluate(request: EvaluationRequest): EvaluationRecord {
    const sessionId = request.session.sessionId

    if (!this.replayMode && this.evaluated.has(sessionId)) {
      throw new DuplicateEvaluationError(sessionId)
    }

    const t0 = Date.now()

    const observed = this.collector.collect(request.execution, request.session)
    const predComp = this.predictionComparator.compare(request.predictions, observed, this.policy)
    const planComp = this.planningComparator.compare(request.decision, observed)
    const execComp = this.executionComparator.compare(request.session)
    const scores = this.scorer.score(predComp, planComp, execComp, this.policy)
    const explanation = this.explanationResolver.resolve(observed, predComp, planComp, execComp, scores)

    const record = this.assembler.assemble(
      request,
      observed,
      predComp,
      planComp,
      execComp,
      scores,
      explanation,
      this.policy,
      EvaluationScorer.VERSION,
      Date.now() - t0,
    )

    this.evaluated.add(sessionId)

    const payload: EvaluationRecordReadyPayload = Object.freeze({
      record,
      request,
      metadata: Object.freeze({
        runtimeVersion: '0.1.0',
        hostId: randomUUID(),
        timestamp: new Date(),
      }),
    })
    this.events.emit(EvaluationEvent.EVALUATION_RECORD_READY, payload)

    return record
  }
}
