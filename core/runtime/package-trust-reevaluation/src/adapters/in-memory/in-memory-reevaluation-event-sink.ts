import type { ReevaluationEventSink } from '../../ports/reevaluation-event-sink.js'
import type { PackageTrustReevaluationEvent } from '../../types.js'

export class InMemoryReevaluationEventSink implements ReevaluationEventSink {
  readonly events: PackageTrustReevaluationEvent[] = []

  async publish(event: PackageTrustReevaluationEvent): Promise<void> {
    this.events.push(event)
  }
}
