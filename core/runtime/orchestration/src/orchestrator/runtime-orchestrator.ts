import type { ProviderInvocation, ProviderResult, RoutingPolicy } from '@rohinik-org/compiler'
import { DEFAULT_ROUTING_POLICY } from '@rohinik-org/compiler'
import type { Provider } from '../provider/providers.js'
import { ProviderRegistry } from '../provider/provider-registry.js'
import { RoutingPolicyEngine } from '../policy/routing-policy-engine.js'
import { ProviderRanker } from '../router/provider-ranker.js'
import { PromptBuilder } from '../prompt/prompt-builder.js'
import { FallbackEngine } from '../fallback/fallback-engine.js'
import { ProviderMetrics } from '../metrics/provider-metrics.js'
import { ResponseValidator } from '../validation/response-validator.js'

export class RuntimeOrchestrator {
  private readonly registry = new ProviderRegistry()
  private readonly policyEngine = new RoutingPolicyEngine()
  private readonly ranker = new ProviderRanker()
  private readonly promptBuilder = new PromptBuilder()
  private readonly fallbackEngine = new FallbackEngine()
  readonly metrics = new ProviderMetrics()
  private readonly validator = new ResponseValidator()
  private readonly providerMap = new Map<string, Provider>()

  registerProvider(provider: Provider): void {
    this.providerMap.set(provider.providerId, provider)
    this.registry.register({
      providerId: provider.providerId,
      displayName: provider.providerId,
      supportedSkillTags: [],
      maxContextWindow: 131072,
      estimatedCostTier: 'free',
      estimatedLatencyTier: 'low',
      available: provider.available,
    })
  }

  createInvocation(skillId: string, input: unknown, policy: RoutingPolicy = DEFAULT_ROUTING_POLICY): ProviderInvocation {
    const orchestrator = this
    return {
      skillId,
      input,
      invoke: async (): Promise<ProviderResult> => {
        const allEntries = orchestrator.registry.list()
        const eligible = orchestrator.policyEngine.filter(allEntries, policy)
        const scored = orchestrator.ranker.rank(eligible, [], policy)
        const orderedProviders = scored
          .map(s => orchestrator.providerMap.get(s.providerId))
          .filter((p): p is Provider => p !== undefined)

        if (orderedProviders.length === 0) {
          return { output: `[no providers available for ${skillId}]`, providerUsed: 'none', latencyMs: 0 }
        }

        const start = Date.now()
        try {
          const fallbackResult = await orchestrator.fallbackEngine.invoke(orderedProviders, { skillId, input })
          const latencyMs = Date.now() - start
          orchestrator.metrics.record(fallbackResult.usedProviderId, true, latencyMs)
          return { ...fallbackResult.result, latencyMs }
        } catch (err) {
          const latencyMs = Date.now() - start
          if (orderedProviders[0]) orchestrator.metrics.record(orderedProviders[0].providerId, false, latencyMs)
          throw err
        }
      },
    }
  }
}
