import type { QuarantineEventSink } from '../../ports/quarantine-event-sink.js'
import type { PackageQuarantineEvent } from '../../types.js'

export class InMemoryQuarantineEventSink implements QuarantineEventSink {
  private readonly events: PackageQuarantineEvent[] = []

  async publish(event: PackageQuarantineEvent): Promise<void> {
    this.events.push(event)
  }

  get publishedEvents(): readonly PackageQuarantineEvent[] {
    return this.events
  }
}
