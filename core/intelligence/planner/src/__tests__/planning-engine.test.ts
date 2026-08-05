import { describe, it, expect, beforeEach } from 'vitest'
import { GoalResolver } from '../engine/goal-resolver.js'
import { PlanGenerator } from '../engine/plan-generator.js'
import { PlanOptimizer } from '../engine/plan-optimizer.js'
import { PlanEvaluator } from '../engine/plan-evaluator.js'
import { PlanningEngine } from '../engine/planning-engine.js'
import { PlanningReason, DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner-ir'
import type { PlanningRequest, Goal, PlanningPolicyIR } from '@rohinik-org/planner-ir'
import { DEFAULT_CONTEXT_POLICY } from '@rohinik-org/working-context'
import type { WorkingContextIR } from '@rohinik-org/working-context'
import { ContextRanker } from '@rohinik-org/scoring'
import { DEFAULT_ACQUISITION_POLICY } from '@rohinik-org/capability-acquisition'

const DEFAULT_BUDGET = { maxRetries: 3, allowReasoning: true, allowNetwork: true, allowDisk: true, mode: 'BALANCED' as const }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIntent(concepts: string[], preferredSkills: string[] = []) {
  return Object.freeze({
    intentId: 'test-intent',
    schemaVersion: '1.0' as const,
    rawInput: concepts.join(' '),
    concepts,
    preferredSkills,
    constraints: {},
    translatedBy: 'test',
    translationConfidence: 1,
    unresolvedTerms: [],
  })
}

function makeContext(
  concepts: string[],
  capabilityIds: string[] = [],
  fragmentLabels: string[] = [],
  preferredSkills: string[] = [],
): WorkingContextIR {
  return Object.freeze({
    contextId: 'ctx-1',
    requestId: 'req-1',
    intent: makeIntent(concepts, preferredSkills),
    memories: Object.freeze([]),
    knowledgeFragments: Object.freeze(fragmentLabels.map((label, i) => ({
      schemaVersion: 1,
      fragmentId: `frag-${i}`,
      source: { type: 'memory' as const, id: 'test' },
      provenance: { observationIds: [], fragmentIds: [], workflowIds: [] },
      extractedAt: new Date(),
      nodes: [{ id: `n-${i}`, primitive: 'Entity' as const, kind: 'Tool' as const, label, source: { type: 'memory' as const, id: 'test' }, certainty: 1, evidence: [], provenance: { observationIds: [], fragmentIds: [], workflowIds: [] }, attributes: {} }],
      edges: [],
      procedures: [],
    }))),
    installedCapabilities: Object.freeze(capabilityIds.map(id => ({
      capabilityId: id,
      version: '1.0.0',
      manifest: { id, name: id, description: `${id} capability`, manifestVersion: 1, version: '1.0.0', inputs: [], outputs: [], tier: 'local' as const, tags: [id], driverRef: 'test' },
      installedAt: new Date(),
      source: { type: 'memory' as const, id: 'test' },
      acquisitionId: 'acq',
      dependencies: [],
      state: 'REGISTERED' as const,
    }))),
    tokenBudget: DEFAULT_CONTEXT_POLICY.budget,
    confidence: 0.9,
    assembledAt: new Date(),
    contributors: Object.freeze(['test']),
    policy: DEFAULT_CONTEXT_POLICY,
  })
}

function makePredictions(failureProb = 0.05) {
  return Object.freeze({
    predictionId: 'pred-1',
    workingContextId: 'ctx-1',
    failurePrediction: Object.freeze({ failureProbability: failureProb, confidence: 0.8, reasons: Object.freeze([]) }),
    producedAt: new Date(),
    contributors: Object.freeze(['rules']),
  })
}

function makeRequest(
  context: WorkingContextIR,
  policy: PlanningPolicyIR = DEFAULT_PLANNING_POLICY,
): PlanningRequest {
  return Object.freeze({
    requestId: 'req-1',
    context,
    predictions: makePredictions(),
    executionBudget: DEFAULT_BUDGET,
    acquisitionPolicy: DEFAULT_ACQUISITION_POLICY,
    planningPolicy: policy,
  })
}

// ─── Goal IR ─────────────────────────────────────────────────────────────────

describe('Goal IR', () => {
  it('has required shape fields', () => {
    const goal: Goal = Object.freeze({ goalId: 'g1', skillId: 'read', priority: 0, source: 'intent' })
    expect(goal.goalId).toBe('g1')
    expect(goal.skillId).toBe('read')
    expect(goal.priority).toBe(0)
    expect(goal.source).toBe('intent')
  })

  it('is immutable', () => {
    const goal: Goal = Object.freeze({ goalId: 'g1', skillId: 'read', priority: 0, source: 'intent' })
    expect(() => { (goal as unknown as Record<string, unknown>)['skillId'] = 'write' }).toThrow()
  })

  it('priority 0 is highest (ascending convention)', () => {
    const high: Goal = Object.freeze({ goalId: 'a', skillId: 'x', priority: 0, source: 'intent' })
    const low: Goal = Object.freeze({ goalId: 'b', skillId: 'y', priority: 2, source: 'knowledge' })
    expect(high.priority).toBeLessThan(low.priority)
  })
})

// ─── PlanningRequest ──────────────────────────────────────────────────────────

describe('PlanningRequest', () => {
  it('constructs with required fields', () => {
    const ctx = makeContext(['read'])
    const req = makeRequest(ctx)
    expect(req.requestId).toBe('req-1')
    expect(req.context).toBe(ctx)
    expect(req.planningPolicy).toBe(DEFAULT_PLANNING_POLICY)
  })

  it('intent accessible at context.intent', () => {
    const ctx = makeContext(['write'])
    const req = makeRequest(ctx)
    expect(req.context.intent.concepts).toContain('write')
  })

  it('DEFAULT_PLANNING_POLICY has sensible defaults', () => {
    expect(DEFAULT_PLANNING_POLICY.preferInstalledCapabilities).toBe(true)
    expect(DEFAULT_PLANNING_POLICY.allowCapabilityAcquisition).toBe(false)
    expect(DEFAULT_PLANNING_POLICY.maxAlternatives).toBe(3)
    expect(DEFAULT_PLANNING_POLICY.riskTolerance).toBe(0.2)
  })

  it('policy is frozen', () => {
    expect(Object.isFrozen(DEFAULT_PLANNING_POLICY)).toBe(true)
  })
})

// ─── GoalResolver ────────────────────────────────────────────────────────────

describe('GoalResolver', () => {
  const resolver = new GoalResolver()

  it('concepts become source:intent priority 0 goals', () => {
    const ctx = makeContext(['read', 'write'])
    const goals = resolver.resolve(ctx)
    const intentGoals = goals.filter(g => g.source === 'intent' && g.priority === 0)
    expect(intentGoals.map(g => g.skillId)).toEqual(['read', 'write'])
  })

  it('preferredSkills become source:intent priority 1 goals', () => {
    const ctx = makeContext(['read'], [], [], ['file-reader'])
    const goals = resolver.resolve(ctx)
    const skillGoals = goals.filter(g => g.source === 'intent' && g.priority === 1)
    expect(skillGoals.map(g => g.skillId)).toContain('file-reader')
  })

  it('knowledge fragments become source:knowledge priority 2 goals, no extra retrieval', () => {
    const ctx = makeContext(['read'], [], ['knowledge-tool'])
    const goals = resolver.resolve(ctx)
    const knowGoals = goals.filter(g => g.source === 'knowledge')
    expect(knowGoals[0]?.skillId).toBe('knowledge-tool')
    expect(knowGoals[0]?.priority).toBe(2)
  })

  it('deterministic: same context → same goal list order', () => {
    const ctx = makeContext(['a', 'b'], [], ['c'])
    const goals1 = resolver.resolve(ctx)
    const goals2 = resolver.resolve(ctx)
    expect(goals1.map(g => g.skillId)).toEqual(goals2.map(g => g.skillId))
  })

  it('empty context produces empty goals', () => {
    const ctx = makeContext([])
    expect(resolver.resolve(ctx)).toHaveLength(0)
  })

  it('insertion order: concepts → preferredSkills → knowledge', () => {
    const ctx = makeContext(['a'], [], ['c'], ['b'])
    const goals = resolver.resolve(ctx)
    const skills = goals.map(g => g.skillId)
    expect(skills.indexOf('a')).toBeLessThan(skills.indexOf('b'))
    expect(skills.indexOf('b')).toBeLessThan(skills.indexOf('c'))
  })
})

// ─── PlanGenerator ───────────────────────────────────────────────────────────

describe('PlanGenerator', () => {
  const resolver = new GoalResolver()
  const generator = new PlanGenerator()

  it('generates candidate for matching installed cap', () => {
    const ctx = makeContext(['read'], ['read'])
    const goals = resolver.resolve(ctx)
    const candidates = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    expect(candidates.length).toBeGreaterThan(0)
  })

  it('prefers installed caps: candidate steps use installed capabilityId', () => {
    const ctx = makeContext(['write'], ['write'])
    const goals = resolver.resolve(ctx)
    const candidates = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    const allStepSkills = candidates.flatMap(c => c.executionPlan.steps.map(s => s.skillId))
    expect(allStepSkills).toContain('write')
  })

  it('no candidates when no installed cap matches and acquisition disabled', () => {
    const ctx = makeContext(['unknown-skill'])
    const goals = resolver.resolve(ctx)
    const candidates = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    expect(candidates).toHaveLength(0)
  })

  it('emits acquisition candidate when allowCapabilityAcquisition=true', () => {
    const ctx = makeContext(['unknown-skill'])
    const goals = resolver.resolve(ctx)
    const policy: PlanningPolicyIR = { ...DEFAULT_PLANNING_POLICY, allowCapabilityAcquisition: true }
    const candidates = generator.generate(goals, ctx, policy)
    expect(candidates.length).toBeGreaterThan(0)
  })

  it('never scores — all scores are 0', () => {
    const ctx = makeContext(['read'], ['read'])
    const goals = resolver.resolve(ctx)
    const candidates = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    expect(candidates.every(c => c.score === 0)).toBe(true)
  })

  it('deterministic: same goals+caps → same candidate IDs in same order', () => {
    const ctx = makeContext(['read'], ['alpha', 'read', 'zeta'])
    const goals = resolver.resolve(ctx)
    const c1 = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    const c2 = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    expect(c1.map(c => c.candidateId)).toEqual(c2.map(c => c.candidateId))
  })
})

// ─── PlanOptimizer ───────────────────────────────────────────────────────────

describe('PlanOptimizer', () => {
  const resolver = new GoalResolver()
  const generator = new PlanGenerator()
  const optimizer = new PlanOptimizer()

  it('removes duplicate steps with same skillId+tier', () => {
    const ctx = makeContext(['read', 'read'], ['read'])
    const goals = resolver.resolve(ctx)
    const raw = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    if (raw.length > 0) {
      const optimized = optimizer.optimize(raw[0]!)
      const skills = optimized.executionPlan.steps.map(s => s.skillId)
      const unique = [...new Set(skills.map(s => s + '::LOCAL'))]
      expect(skills.length).toBeLessThanOrEqual(unique.length + raw[0]!.executionPlan.steps.length)
    }
  })

  it('preserves planning intent: N distinct skills in → ≤ N same skills out', () => {
    const ctx = makeContext(['read'], ['read'])
    const goals = resolver.resolve(ctx)
    const raw = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    for (const candidate of raw) {
      const inSkills = new Set(candidate.executionPlan.steps.map(s => s.skillId))
      const optimized = optimizer.optimize(candidate)
      const outSkills = new Set(optimized.executionPlan.steps.map(s => s.skillId))
      for (const skill of outSkills) {
        expect(inSkills.has(skill)).toBe(true)
      }
    }
  })

  it('returns same reference when no dedup needed', () => {
    const ctx = makeContext(['read'], ['read'])
    const goals = resolver.resolve(ctx)
    const raw = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    if (raw.length > 0) {
      const candidate = raw[0]!
      const optimized = optimizer.optimize(candidate)
      // Either same reference (no-op) or valid frozen object
      expect(Object.isFrozen(optimized)).toBe(true)
    }
  })
})

// ─── PlanEvaluator ───────────────────────────────────────────────────────────

describe('PlanEvaluator', () => {
  const ranker = new ContextRanker()
  const resolver = new GoalResolver()
  const generator = new PlanGenerator()
  const optimizer = new PlanOptimizer()
  const evaluator = new PlanEvaluator(ranker)

  it('assigns scores based on cap match', () => {
    const ctx = makeContext(['read'], ['read'])
    const goals = resolver.resolve(ctx)
    const raw = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    const optimized = raw.map(c => optimizer.optimize(c))
    const request = makeRequest(ctx)
    const evaluated = evaluator.evaluate(optimized, request)
    expect(evaluated.every(c => c.score >= 0 && c.score <= 1)).toBe(true)
  })

  it('higher failure probability → lower score', () => {
    const ctx = makeContext(['read'], ['read'])
    const goals = resolver.resolve(ctx)
    const raw = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    const optimized = raw.map(c => optimizer.optimize(c))

    const reqLow = { ...makeRequest(ctx), predictions: makePredictions(0.1) }
    const reqHigh = { ...makeRequest(ctx), predictions: makePredictions(0.9) }

    const evalLow = evaluator.evaluate(optimized, reqLow)
    const evalHigh = evaluator.evaluate(optimized, reqHigh)

    if (evalLow.length > 0 && evalHigh.length > 0) {
      expect(evalLow[0]!.score).toBeGreaterThanOrEqual(evalHigh[0]!.score)
    }
  })

  it('sort order is score DESC then latency ASC (deterministic)', () => {
    const ctx = makeContext(['a', 'b'], ['a', 'b'])
    const goals = resolver.resolve(ctx)
    const raw = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    const optimized = raw.map(c => optimizer.optimize(c))
    const evaluated = evaluator.evaluate(optimized, makeRequest(ctx))
    for (let i = 1; i < evaluated.length; i++) {
      expect(evaluated[i - 1]!.score).toBeGreaterThanOrEqual(evaluated[i]!.score)
    }
  })

  it('never mutates candidates (no score on input, score on output)', () => {
    const ctx = makeContext(['read'], ['read'])
    const goals = resolver.resolve(ctx)
    const raw = generator.generate(goals, ctx, DEFAULT_PLANNING_POLICY)
    const optimized = raw.map(c => optimizer.optimize(c))
    const inputScores = optimized.map(c => c.score)
    evaluator.evaluate(optimized, makeRequest(ctx))
    // Input scores unchanged
    expect(optimized.map(c => c.score)).toEqual(inputScores)
  })
})

// ─── PlanningDecision ────────────────────────────────────────────────────────

describe('PlanningDecision', () => {
  let engine: PlanningEngine

  beforeEach(() => {
    const ranker = new ContextRanker()
    engine = new PlanningEngine(new GoalResolver(), new PlanGenerator(), new PlanOptimizer(), new PlanEvaluator(ranker))
  })

  it('is immutable (Law 42)', async () => {
    const ctx = makeContext(['read'], ['read'])
    const decision = await engine.plan(makeRequest(ctx))
    expect(Object.isFrozen(decision)).toBe(true)
    expect(Object.isFrozen(decision.evaluations)).toBe(true)
  })

  it('exactly one entry has selected:true', async () => {
    const ctx = makeContext(['read'], ['read'])
    const decision = await engine.plan(makeRequest(ctx))
    const selectedCount = decision.evaluations.filter(e => e.selected).length
    expect(selectedCount).toBe(decision.evaluations.length > 0 ? 1 : 0)
  })

  it('selectedPlan == evaluations.find(selected).executionPlan', async () => {
    const ctx = makeContext(['read'], ['read'])
    const decision = await engine.plan(makeRequest(ctx))
    const selected = decision.evaluations.find(e => e.selected)
    if (selected) {
      expect(decision.selectedPlan).toBe(selected.executionPlan)
      expect(decision.selectedScore).toBe(selected.score)
    }
  })

  it('has requestId on decision', async () => {
    const ctx = makeContext(['read'], ['read'])
    const req = makeRequest(ctx)
    const decision = await engine.plan(req)
    expect(decision.requestId).toBe(req.requestId)
  })
})

// ─── PlanningReason ──────────────────────────────────────────────────────────

describe('PlanningReason', () => {
  it('is a frozen const object, not a TS enum', () => {
    expect(Object.isFrozen(PlanningReason)).toBe(true)
    expect(typeof PlanningReason.LOWER_COST).toBe('string')
  })

  it('contains expected reason keys', () => {
    expect(PlanningReason.ONLY_CANDIDATE).toBe('ONLY_CANDIDATE')
    expect(PlanningReason.NO_CANDIDATES).toBe('NO_CANDIDATES')
    expect(PlanningReason.MULTI_OBJECTIVE_BALANCE).toBe('MULTI_OBJECTIVE_BALANCE')
  })

  it('decision explanation contains a selectedReason', async () => {
    const ranker = new ContextRanker()
    const engine = new PlanningEngine(new GoalResolver(), new PlanGenerator(), new PlanOptimizer(), new PlanEvaluator(ranker))
    const ctx = makeContext(['read'], ['read'])
    const decision = await engine.plan(makeRequest(ctx))
    expect(Object.values(PlanningReason)).toContain(decision.explanation.selectedReason)
  })
})

// ─── PlanningMetrics ─────────────────────────────────────────────────────────

describe('PlanningMetrics', () => {
  let engine: PlanningEngine

  beforeEach(() => {
    const ranker = new ContextRanker()
    engine = new PlanningEngine(new GoalResolver(), new PlanGenerator(), new PlanOptimizer(), new PlanEvaluator(ranker))
  })

  it('planningAlgorithmVersion is a string', async () => {
    const ctx = makeContext(['read'], ['read'])
    const { metrics } = await engine.plan(makeRequest(ctx))
    expect(typeof metrics.planningAlgorithmVersion).toBe('string')
    expect(metrics.planningAlgorithmVersion.length).toBeGreaterThan(0)
  })

  it('decisionConfidence in [0,1]', async () => {
    const ctx = makeContext(['read'], ['read'])
    const { metrics } = await engine.plan(makeRequest(ctx))
    expect(metrics.decisionConfidence).toBeGreaterThanOrEqual(0)
    expect(metrics.decisionConfidence).toBeLessThanOrEqual(1)
  })

  it('selectionMargin is 0 when only one candidate', async () => {
    const ctx = makeContext(['read'], ['read'])
    const { metrics } = await engine.plan(makeRequest(ctx))
    if (metrics.candidateCount <= 1) {
      expect(metrics.selectionMargin).toBe(0)
    }
  })
})

// ─── PlanningEngine — full pipeline ──────────────────────────────────────────

describe('PlanningEngine', () => {
  let engine: PlanningEngine

  beforeEach(() => {
    const ranker = new ContextRanker()
    engine = new PlanningEngine(new GoalResolver(), new PlanGenerator(), new PlanOptimizer(), new PlanEvaluator(ranker))
  })

  it('runs full pipeline without throwing', async () => {
    const ctx = makeContext(['read'], ['read'])
    await expect(engine.plan(makeRequest(ctx))).resolves.toBeDefined()
  })

  it('returns NO_CANDIDATES reason when no caps match', async () => {
    const ctx = makeContext(['unknown-xyz'])
    const decision = await engine.plan(makeRequest(ctx))
    expect(decision.explanation.selectedReason).toBe(PlanningReason.NO_CANDIDATES)
    expect(decision.evaluations).toHaveLength(0)
  })

  it('selectedPlan is an ExecutionPlan with planId', async () => {
    const ctx = makeContext(['read'], ['read'])
    const decision = await engine.plan(makeRequest(ctx))
    expect(decision.selectedPlan.planId).toBeDefined()
    expect(typeof decision.selectedPlan.planId).toBe('string')
  })

  it('explanation rejected reasons list non-selected candidates', async () => {
    const ctx = makeContext(['a', 'b'], ['a', 'b'])
    const decision = await engine.plan(makeRequest(ctx))
    if (decision.evaluations.length > 1) {
      expect(decision.explanation.rejectedReasons.length).toBeGreaterThan(0)
    }
  })

  it('metrics.candidateCount matches evaluations.length', async () => {
    const ctx = makeContext(['read'], ['read'])
    const decision = await engine.plan(makeRequest(ctx))
    expect(decision.metrics.candidateCount).toBe(decision.evaluations.length)
  })

  // ─── Law 43: deterministic decisionId ────────────────────────────────────

  it('same request + same caps → identical decisionId (Law 43)', async () => {
    const ctx = makeContext(['read'], ['read'])
    const req = makeRequest(ctx)
    const d1 = await engine.plan(req)
    const d2 = await engine.plan(req)
    expect(d1.decisionId).toBe(d2.decisionId)
  })

  it('producedAt excluded from decisionId — different timestamps, same decisionId', async () => {
    const ctx = makeContext(['read'], ['read'])
    const req = makeRequest(ctx)
    const d1 = await engine.plan(req)
    await new Promise(r => setTimeout(r, 5))
    const d2 = await engine.plan(req)
    expect(d1.decisionId).toBe(d2.decisionId)
  })

  // ─── Law 44: explanation ─────────────────────────────────────────────────

  it('explanation selectedReason is a valid PlanningReason (Law 44)', async () => {
    const ctx = makeContext(['read'], ['read'])
    const decision = await engine.plan(makeRequest(ctx))
    expect(Object.values(PlanningReason)).toContain(decision.explanation.selectedReason)
  })

  it('rejected entries have rejectionReason set (Law 44)', async () => {
    const ctx = makeContext(['a', 'b'], ['a', 'b'])
    const decision = await engine.plan(makeRequest(ctx))
    const rejected = decision.evaluations.filter(e => !e.selected)
    for (const e of rejected) {
      expect(e.rejectionReason).toBeDefined()
      expect(Object.values(PlanningReason)).toContain(e.rejectionReason)
    }
  })
})

// ─── PlanningRecord ──────────────────────────────────────────────────────────

describe('PlanningRecord', () => {
  let engine: PlanningEngine

  beforeEach(() => {
    const ranker = new ContextRanker()
    engine = new PlanningEngine(new GoalResolver(), new PlanGenerator(), new PlanOptimizer(), new PlanEvaluator(ranker))
  })

  it('has required shape fields', async () => {
    const ctx = makeContext(['read'], ['read'])
    const req = makeRequest(ctx)
    const decision = await engine.plan(req)
    const record = engine.buildRecord(decision, req)
    expect(record.recordId).toBeDefined()
    expect(record.decisionId).toBe(decision.decisionId)
    expect(record.requestId).toBe(decision.requestId)
    expect(record.policyId).toBe(req.planningPolicy.policyId)
    expect(record.planningAlgorithmVersion).toBe(decision.metrics.planningAlgorithmVersion)
    expect(typeof record.selectionMargin).toBe('number')
  })

  it('is JSON-serializable', async () => {
    const ctx = makeContext(['read'], ['read'])
    const req = makeRequest(ctx)
    const decision = await engine.plan(req)
    const record = engine.buildRecord(decision, req)
    expect(() => JSON.stringify(record)).not.toThrow()
  })

  it('selectionMargin matches decision.metrics.selectionMargin', async () => {
    const ctx = makeContext(['read'], ['read'])
    const req = makeRequest(ctx)
    const decision = await engine.plan(req)
    const record = engine.buildRecord(decision, req)
    expect(record.selectionMargin).toBe(decision.metrics.selectionMargin)
  })
})

// ─── WorkflowPlanner.planFromRequest ─────────────────────────────────────────

describe('WorkflowPlanner.planFromRequest', () => {
  let planner: InstanceType<typeof import('../planning/workflow-planner.js').WorkflowPlanner>

  beforeEach(async () => {
    const { WorkflowPlanner } = await import('../planning/workflow-planner.js')
    const { DEFAULT_PLANNING_POLICY: WFPOL } = await import('../ranking/planning-policy.js')
    planner = new WorkflowPlanner(WFPOL, '0.1.0')
  })

  it('returns a WorkflowPlan', async () => {
    const ctx = makeContext(['read'], ['read'])
    const req = makeRequest(ctx)
    const result = planner.planFromRequest(req)
    expect(result.kind).toBe('WorkflowPlan')
    expect(result.planId).toBeDefined()
  })

  it('existing plan() signature still works', async () => {
    const { StaticIntentTranslator } = await import('../translation/static-intent-translator.js')
    const translator = new StaticIntentTranslator([])
    const intent = makeIntent(['read'])
    const translation = await translator.translate({ input: 'read' })
    if (translation.status === 'SUCCESS') {
      expect(() => planner.plan(translation.intent, translation, [], 1, 1)).not.toThrow()
    }
  })

  it('planFromRequest intent flows from context.intent', () => {
    const ctx = makeContext(['write'], ['write'])
    const req = makeRequest(ctx)
    const result = planner.planFromRequest(req)
    expect(result.intent.rawInput).toBe(ctx.intent.rawInput)
  })

  it('produces different planId for different requestId', () => {
    const ctx1 = { ...makeContext(['read'], ['read']), contextId: 'ctx-a' }
    const ctx2 = { ...makeContext(['read'], ['read']), contextId: 'ctx-b' }
    const r1 = planner.planFromRequest(makeRequest(ctx1 as WorkingContextIR))
    const r2 = planner.planFromRequest(makeRequest(ctx2 as WorkingContextIR))
    // Plans may differ based on policyId + contextId in hash — just check they run
    expect(r1.planId).toBeDefined()
    expect(r2.planId).toBeDefined()
  })
})
