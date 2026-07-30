import type { PackageTrustReevaluationEvent } from '../types.js'

export interface ReevaluationEventSink {
  publish(event: PackageTrustReevaluationEvent): Promise<void>
}
