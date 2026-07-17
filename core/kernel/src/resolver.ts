import type { ExecutionResolver, MutableExecutionResolver, ResolvedProviders, ProviderResolution, ProviderSelectionPolicy } from './interfaces/resolver.js'
import type { ExecutionRequirements } from './interfaces/skill.js'
import type { Provider, ProviderCapabilityType } from './interfaces/provider.js'
import type { ExecutionContext } from './domain/context.js'
import type { SystemConfig } from './domain/config.js'

export class DefaultExecutionResolver implements MutableExecutionResolver {
  private providers: Provider[] = []

  constructor(private readonly config: SystemConfig) {}

  registerProvider(provider: Provider): void {
    this.providers.push(provider)
  }

  isResolvable(requirements: ExecutionRequirements, _ctx: ExecutionContext): boolean {
    if (!requirements.providerCapabilities) return true
    const caps = requirements.providerCapabilities
    if (caps.reasoningEngine) {
      const found = this.providers.find(p => p.metadata.capabilities.includes('REASONING_ENGINE'))
      if (!found) return false
    }
    if (caps.pythonRuntime) {
      const found = this.providers.find(p => p.metadata.capabilities.includes('PYTHON_RUNTIME'))
      if (!found) return false
    }
    return true
  }

  async resolve(
    requirements: ExecutionRequirements,
    policy: ProviderSelectionPolicy,
    _ctx: ExecutionContext,
  ): Promise<ResolvedProviders> {
    if (!requirements.providerCapabilities) return {}

    const result: Record<string, ProviderResolution> = {}
    const caps = requirements.providerCapabilities

    if (caps.reasoningEngine) {
      const resolution = this.resolveByCapabilityType('REASONING_ENGINE', policy)
      if (!resolution) throw new Error('No REASONING_ENGINE provider available')
      result['reasoningEngine'] = resolution
    }

    if (caps.pythonRuntime) {
      const resolution = this.resolveByCapabilityType('PYTHON_RUNTIME', policy)
      if (!resolution) throw new Error('No PYTHON_RUNTIME provider available')
      result['pythonRuntime'] = resolution
    }

    if (caps.browserEngine) {
      const resolution = this.resolveByCapabilityType('BROWSER_ENGINE', policy)
      if (!resolution) throw new Error('No BROWSER_ENGINE provider available')
      result['browserEngine'] = resolution
    }

    return result
  }

  private resolveByCapabilityType(
    capType: ProviderCapabilityType,
    policy: ProviderSelectionPolicy,
  ): ProviderResolution | undefined {
    const candidates = this.providers.filter(p => p.metadata.capabilities.includes(capType))
    if (candidates.length === 0) return undefined

    const candidateIds = candidates.map(p => p.metadata.providerId)
    const selected = this.applyPolicy(candidates, policy)

    return {
      provider: selected,
      policy,
      score: 1.0,
      candidates: candidateIds,
    }
  }

  private applyPolicy(candidates: Provider[], policy: ProviderSelectionPolicy): Provider {
    if (policy === 'FIRST_AVAILABLE' || policy === 'USER_PREFERENCE') {
      return candidates[0]!
    }
    // Phase 1: all non-FIRST_AVAILABLE policies fall back to first available
    // Phase 2+: implement cost/latency/reliability sorting from provider metrics
    return candidates[0]!
  }
}
