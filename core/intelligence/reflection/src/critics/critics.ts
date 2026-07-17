import { randomUUID } from 'node:crypto'
import type { ExecutionResult, ReflectionFinding } from '@rohinik-org/compiler'
import type { ReflectionCritic } from './reflection-critic.js'

export class PlanCritic implements ReflectionCritic {
  analyze(result: ExecutionResult): readonly ReflectionFinding[] {
    const findings: ReflectionFinding[] = []
    const evidence = [result.executionId]

    if (result.stepRecords.length === 0) {
      findings.push({ findingId: randomUUID(), category: 'PLANNING', confidence: 1.0, evidence, summary: 'Empty plan: no steps were defined' })
    }

    const retryRatio = result.metrics.retryCount / Math.max(1, result.stepRecords.length)
    if (retryRatio > 1.0) {
      findings.push({ findingId: randomUUID(), category: 'PLANNING', confidence: 0.8, evidence, summary: 'Excessive retries relative to plan size' })
    }

    return findings
  }
}

export class ExecutionCritic implements ReflectionCritic {
  analyze(result: ExecutionResult): readonly ReflectionFinding[] {
    const findings: ReflectionFinding[] = []
    const evidence = [result.executionId]

    if (result.metrics.totalDurationMs > 30_000) {
      findings.push({ findingId: randomUUID(), category: 'PERFORMANCE', confidence: 0.9, evidence, summary: 'Execution exceeded 30s duration threshold' })
    }

    if (result.stepRecords.some(s => s.state === 'FAILED')) {
      findings.push({ findingId: randomUUID(), category: 'RELIABILITY', confidence: 1.0, evidence, summary: 'One or more steps failed during execution' })
    }

    return findings
  }
}

export class ProviderCritic implements ReflectionCritic {
  analyze(result: ExecutionResult): readonly ReflectionFinding[] {
    const findings: ReflectionFinding[] = []
    const evidence = [result.executionId]

    if (Object.values(result.metrics.providerLatencyMs).some(l => l > 5_000)) {
      findings.push({ findingId: randomUUID(), category: 'PROVIDER', confidence: 0.8, evidence, summary: 'Provider latency exceeded 5s threshold' })
    }

    return findings
  }
}
