import type { ExecutionResult, ReflectionReport } from '@rohinik-org/compiler'
import type { ReflectionFacade } from './facade-types.js'
import type { ReflectionStore } from '@rohinik-org/reflection'
import { ReflectionEngine, NullReflectionStore } from '@rohinik-org/reflection'

export class DefaultReflectionFacade implements ReflectionFacade {
  private readonly engine: ReflectionEngine

  constructor(store: ReflectionStore = new NullReflectionStore()) {
    this.engine = new ReflectionEngine(store)
  }

  reflect(result: ExecutionResult): Promise<ReflectionReport> {
    return this.engine.reflect(result)
  }
}

export class NoopReflectionFacade implements ReflectionFacade {
  reflect(_result: ExecutionResult): Promise<ReflectionReport> {
    return Promise.resolve({
      kind: 'ReflectionReport', schemaVersion: '1.0',
      reportId: '', executionId: '',
      createdAt: new Date().toISOString(),
      rootCause: { causeId: '', category: 'UNKNOWN', confidence: 0, evidence: [] },
      findings: [], recommendations: [], status: 'REJECTED',
    })
  }
}
