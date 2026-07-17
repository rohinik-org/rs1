import type { ExecutionTermination } from './execution-termination.js'
import type { ExecutionMetadata } from './execution-metadata.js'
import type { StepExecutionRecord } from './step-execution-record.js'
import type { ExecutionJournalEntry } from './execution-journal-entry.js'
import type { ExecutionMetrics } from './execution-metrics-6a.js'

export interface ExecutionResult {
  readonly kind: 'ExecutionResult'
  readonly schemaVersion: '1.0'
  readonly executionId: string
  readonly executionRevision: number
  readonly planId: string
  readonly metadata: ExecutionMetadata
  readonly termination: ExecutionTermination
  readonly stepRecords: readonly StepExecutionRecord[]
  readonly journal: readonly ExecutionJournalEntry[]
  readonly metrics: ExecutionMetrics
  readonly outputs: Readonly<Record<number, unknown>>
  readonly producedAt: string  // ISO-8601
}
