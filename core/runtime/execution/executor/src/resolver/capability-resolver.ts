import type { ProviderInvocation } from '@rohinik-org/compiler'

export interface ExecutorCapabilityResolver {
  resolve(skillId: string, input: unknown): ProviderInvocation
}
