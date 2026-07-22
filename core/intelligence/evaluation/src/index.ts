// Each export below is a stateless deterministic pipeline stage — see ARCHITECTURE.md §Stateless Pipeline Services
export { OutcomeCollector } from './collector/outcome-collector.js'
export { PredictionComparator } from './comparators/prediction-comparator.js'
export { PlanningComparator } from './comparators/planning-comparator.js'
export { ExecutionComparator } from './comparators/execution-comparator.js'
export { EvaluationScorer } from './scorer/evaluation-scorer.js'
export { ExplanationResolver } from './resolver/explanation-resolver.js'
export { EvaluationAssembler } from './assembler/evaluation-assembler.js'
export { EvaluationEngine, DuplicateEvaluationError, EvaluationPolicyWeightError } from './engine/evaluation-engine.js'
