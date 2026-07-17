import type { ProviderInvocation } from '@rohinik-org/compiler'
import type { ExecutorCapabilityResolver } from '@rohinik-org/executor'
import type { RuntimeOrchestrator } from './runtime-orchestrator.js'

export class OrchestratorResolver implements ExecutorCapabilityResolver {
  constructor(private readonly orchestrator: RuntimeOrchestrator) {}

  resolve(skillId: string, input: unknown): ProviderInvocation {
    return this.orchestrator.createInvocation(skillId, input)
  }
}
