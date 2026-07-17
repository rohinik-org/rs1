import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { DEFAULT_OBSERVATION_POLICY } from '@rohinik-org/compiler'
import { NullNetworkClient } from '@rohinik-org/network'
import { NpmObservationSource, ObservationPolicyEngine, InMemoryObservationStore, ObservationStateManager } from '@rohinik-org/observer'
import { CapabilityAcquisitionEngine, NullCapabilitySource, NullAcquisitionStore } from '@rohinik-org/acquisition'
import { StaticIntentTranslator, WorkflowPlanner, DEFAULT_PLANNING_POLICY } from '@rohinik-org/planner'
import { ExecutionEngine, SequentialExecutionScheduler, NullExecutionStore } from '@rohinik-org/executor'
import type { ExecutorCapabilityResolver } from '@rohinik-org/executor'
import { EpisodicRecorder } from '@rohinik-org/memory'

const nullResolver: ExecutorCapabilityResolver = {
  resolve: (skillId, input) => ({
    skillId, input,
    invoke: async () => ({ output: null, providerUsed: 'null', latencyMs: 0 }),
  }),
}

class LocalMemoryStore {
  readonly artifacts: import('@rohinik-org/compiler').MemoryArtifact[] = []
  async saveArtifact(a: import('@rohinik-org/compiler').MemoryArtifact) { this.artifacts.push(a) }
  async findRelevant() { return [] }
  async getAll() { return this.artifacts }
  async removeById() { return false }
}

export async function runFullPipelineScenario(
  loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  // Stage 1: Observation → LearningTrigger
  const client = new NullNetworkClient({ status: 200, body: JSON.stringify({ name: 'left-pad', deprecated: 'use pad-left instead' }) })
  const source = new NpmObservationSource(client)
  const observations = await source.observe({ categories: ['PACKAGE'], terms: ['left-pad'] })

  const obsStore = new InMemoryObservationStore()
  const stateMgr = new ObservationStateManager(obsStore)
  const policyEngine = new ObservationPolicyEngine(DEFAULT_OBSERVATION_POLICY)
  let triggerEmitted = false
  let trigger: import('@rohinik-org/compiler').LearningTrigger | undefined
  for (const obs of observations) {
    await obsStore.save(obs)
    const state = await stateMgr.activate(obs)
    const t = policyEngine.decide(obs, state)
    if (t) { triggerEmitted = true; trigger = t }
  }

  // Stage 2: Acquisition (using the trigger if emitted, else synthetic)
  const acqEngine = new CapabilityAcquisitionEngine([new NullCapabilitySource()], new NullAcquisitionStore())
  const acqTrigger = trigger ?? {
    kind: 'LearningTrigger' as const, schemaVersion: '1.0' as const,
    triggerId: 'synthetic-001', detectedAt: new Date().toISOString(),
    triggerKind: 'DEPRECATION_SIGNAL' as const,
    evidence: { metric: 'deprecated', observedValue: 1, confidence: 1, confidenceMethod: 'DIRECT_OBSERVATION' as const, sampleSize: 1 },
    suggestedCommand: 'rhk acquire left-pad', corpusWindowStart: '', corpusWindowEnd: '', recordCount: 1,
  }
  const acqResult = await acqEngine.acquire(acqTrigger)

  // Stage 3: Plan
  const translator = new StaticIntentTranslator([
    { input: 'fetch weather', concepts: ['weather'], preferredSkills: ['weather.fetch'] },
  ])
  const translation = await translator.translate({ input: 'fetch weather' })
  const planner = new WorkflowPlanner(DEFAULT_PLANNING_POLICY, '0.1.0')
  const plan = planner.plan(translation.intent, translation, [], loaded.fixture.graphRevision, 0)

  // Stage 4: Execute
  const execStore = new NullExecutionStore()
  const engine = new ExecutionEngine(nullResolver, new SequentialExecutionScheduler(), execStore)
  const handle = await engine.execute(plan)
  const result = await handle.wait()

  // Stage 5: Memory
  const memStore = new LocalMemoryStore()
  const recorder = new EpisodicRecorder(memStore)
  await recorder.record(result)
  const episodes = memStore.artifacts.filter(a => a.artifactKind === 'EPISODE')

  return {
    triggerEmitted,
    acquisitionRan: acqResult.triggerId === acqTrigger.triggerId,
    planProduced: plan.kind === 'WorkflowPlan',
    executionCompleted: result.termination.reason === 'COMPLETED',
    episodeRecorded: episodes.length > 0,
  }
}
