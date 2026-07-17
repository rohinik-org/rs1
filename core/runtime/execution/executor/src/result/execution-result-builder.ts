import type { ExecutionResult, ExecutionTermination, StepExecutionRecord } from '@rohinik-org/compiler'
import type { ExecutionContext } from '../state/execution-context.js'
import type { ExecutionJournal } from '../journal/execution-journal.js'
import type { ExecutionMetricsCollector } from '../metrics/execution-metrics-collector.js'

interface BuildParams {
  executionId: string
  executionRevision: number
  planId: string
  context: ExecutionContext
  journal: ExecutionJournal
  metrics: ExecutionMetricsCollector
  stepRecords: readonly StepExecutionRecord[]
  termination: ExecutionTermination
}

export class ExecutionResultBuilder {
  build(params: BuildParams): ExecutionResult {
    return {
      kind: 'ExecutionResult',
      schemaVersion: '1.0',
      executionId: params.executionId,
      executionRevision: params.executionRevision,
      planId: params.planId,
      metadata: { planId: params.planId },
      termination: params.termination,
      stepRecords: params.stepRecords,
      journal: params.journal.entries(),
      metrics: params.metrics.build(),
      outputs: params.context.allOutputs(),
      producedAt: new Date().toISOString(),
    }
  }
}
