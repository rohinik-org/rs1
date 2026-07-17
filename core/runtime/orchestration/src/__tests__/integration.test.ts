import { describe, it, expect } from 'vitest'
import { RuntimeOrchestrator } from '../orchestrator/runtime-orchestrator.js'
import { OrchestratorResolver } from '../orchestrator/orchestrator-resolver.js'
import { NullProvider } from '../provider/providers.js'

describe('RuntimeOrchestrator + OrchestratorResolver', () => {
  it('returns ProviderInvocation from createInvocation', () => {
    const orch = new RuntimeOrchestrator()
    orch.registerProvider(new NullProvider())
    const inv = orch.createInvocation('test-skill', 'input')
    expect(inv.skillId).toBe('test-skill')
    expect(typeof inv.invoke).toBe('function')
  })

  it('invoke() returns a valid ProviderResult', async () => {
    const orch = new RuntimeOrchestrator()
    orch.registerProvider(new NullProvider())
    const inv = orch.createInvocation('my-skill', 'data')
    const result = await inv.invoke()
    expect(result.output).toBeTruthy()
    expect(result.providerUsed).toBeTruthy()
    expect(typeof result.latencyMs).toBe('number')
  })

  it('NullProvider produces non-null output', async () => {
    const orch = new RuntimeOrchestrator()
    orch.registerProvider(new NullProvider())
    const result = await orch.createInvocation('skill-x', null).invoke()
    expect(result.output).toContain('skill-x')
  })

  it('metrics updated after invocation', async () => {
    const orch = new RuntimeOrchestrator()
    orch.registerProvider(new NullProvider())
    await orch.createInvocation('sk', 'x').invoke()
    const stats = orch.metrics.stats('null')
    expect(stats.callCount).toBe(1)
  })

  it('OrchestratorResolver.resolve() returns ProviderInvocation', () => {
    const orch = new RuntimeOrchestrator()
    orch.registerProvider(new NullProvider())
    const resolver = new OrchestratorResolver(orch)
    const inv = resolver.resolve('skill-y', { x: 1 })
    expect(inv.skillId).toBe('skill-y')
  })
})
