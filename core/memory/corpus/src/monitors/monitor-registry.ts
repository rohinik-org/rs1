import type { ExecutionRecord, LearningTrigger } from '@rohinik-org/compiler'
import type { EvidenceMonitor } from './evidence-monitor.js'

export class MonitorRegistry {
  private readonly monitors: EvidenceMonitor[] = []

  register(monitor: EvidenceMonitor): void {
    this.monitors.push(monitor)
  }

  observe(record: ExecutionRecord): readonly LearningTrigger[] {
    const triggers: LearningTrigger[] = []
    for (const monitor of this.monitors) {
      try {
        const trigger = monitor.observe(record)
        if (trigger !== null) triggers.push(trigger)
      } catch {
        // Monitor errors must not propagate
      }
    }
    return triggers
  }
}
