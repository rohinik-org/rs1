import type { ExecutionResult, ReflectionFinding } from '@rohinik-org/compiler'

export interface ReflectionCritic {
  analyze(result: ExecutionResult): readonly ReflectionFinding[]
}
