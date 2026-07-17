import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import { runFailureInvalidScenario } from '../scenarios/failure-invalid.scenario.js'
import { runRecoveryScenario } from '../scenarios/recovery.scenario.js'
import { runPolicyBlockScenario } from '../scenarios/policy-block.scenario.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'

const emptyFixture = { graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [], observations: [], memory: [], corpus: [], providers: [] }

const failureScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'failure-invalid-001',
  name: 'Null-output execution completes without crashing',
  tags: ['FAILURE'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
}

const recoveryScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'recovery-001',
  name: 'Resume execution from checkpoint',
  tags: ['RECOVERY'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
}

const policyBlockScenario: RuntimeScenario = {
  kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: 'policy-block-001',
  name: 'Network capability deferred by policy',
  tags: ['ACQUISITION', 'SECURITY'], scenarioType: 'STATIC', initialState: emptyFixture,
  expectedOutcome: {}, createdAt: new Date().toISOString(),
}

describe('Failure scenario', () => {
  it('null-output execution completes without crashing', async () => {
    const validator = new RuntimeValidator()
    validator.register('failure-invalid-001', runFailureInvalidScenario)
    const report = await validator.run(failureScenario)
    expect(report.status).toBe('PASSED')
  })
})

describe('Recovery scenario', () => {
  it('resume from checkpoint completes execution', async () => {
    const validator = new RuntimeValidator()
    validator.register('recovery-001', runRecoveryScenario)
    const report = await validator.run(recoveryScenario)
    expect(report.status).toBe('PASSED')
  })
})

describe('Policy-block scenario', () => {
  it('network capability deferred by human-approval policy', async () => {
    const validator = new RuntimeValidator()
    validator.register('policy-block-001', runPolicyBlockScenario)
    const report = await validator.run(policyBlockScenario)
    expect(report.status).toBe('PASSED')
  })
})
