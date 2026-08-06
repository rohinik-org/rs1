import type { PolicyPort, CapabilityPort, BudgetPort } from '@rohinik-org/agent-runtime'
import type { AgentInstanceId, AgentVersionId } from '@rohinik-org/agent-ir'

export class MockPolicyPort implements PolicyPort {
  private static readonly KNOWN = new Set(['inst-coordinator-1', 'inst-worker-1'])

  async evaluate(instanceId: AgentInstanceId, _versionId: AgentVersionId) {
    return MockPolicyPort.KNOWN.has(instanceId as string)
      ? { allowed: true as const }
      : { allowed: false as const, reason: 'policy-unknown-instance' }
  }
}

export class MockCapabilityPort implements CapabilityPort {
  private static readonly AVAILABLE = new Set(['text-generation', 'planning'])

  async checkAvailable(reqs: ReadonlyArray<{ capabilityId: string; required: boolean }>) {
    const missing = reqs
      .filter(r => r.required && !MockCapabilityPort.AVAILABLE.has(r.capabilityId))
      .map(r => r.capabilityId)
    return missing.length === 0
      ? { available: true as const }
      : { available: false as const, missing }
  }
}

export class MockBudgetPort implements BudgetPort {
  private static readonly CEILINGS: Record<string, number> = {
    'ver-coordinator-1.0.0': 100,
    'ver-worker-1.0.0': 10,
  }

  async checkBudget(versionId: AgentVersionId) {
    const ceiling = MockBudgetPort.CEILINGS[versionId as string]
    return ceiling !== undefined
      ? { sufficient: true as const }
      : { sufficient: false as const, reason: 'budget-unknown-version' }
  }
}
