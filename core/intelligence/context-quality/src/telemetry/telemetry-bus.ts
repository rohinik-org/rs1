import {
  ContextQualityEvent,
  ContextAdmissionDecision,
} from '@rohinik-org/context-quality-ir'
import type {
  ContextQualityTelemetry,
  ContextQualityTelemetryEvent,
  ContextPackageId,
  ContextAdmissionResult,
  Clock,
} from '@rohinik-org/context-quality-ir'

export class TelemetryBus implements ContextQualityTelemetry {
  private readonly listeners: Array<(e: ContextQualityTelemetryEvent) => void> = []

  subscribe(fn: (e: ContextQualityTelemetryEvent) => void): () => void {
    this.listeners.push(fn)
    return () => {
      const idx = this.listeners.indexOf(fn)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  emit(event: ContextQualityTelemetryEvent): void {
    for (const fn of this.listeners) {
      try { fn(event) } catch { /* telemetry must never affect decisions */ }
    }
  }
}

export function emitAdmissionTelemetry(
  bus:       ContextQualityTelemetry,
  packageId: ContextPackageId,
  result:    ContextAdmissionResult,
  clock:     Clock,
): void {
  const eventType = (() => {
    switch (result.decision) {
      case ContextAdmissionDecision.ADMITTED:          return ContextQualityEvent.ADMISSION_GRANTED
      case ContextAdmissionDecision.ADMITTED_DEGRADED: return ContextQualityEvent.ADMISSION_DEGRADED
      case ContextAdmissionDecision.RETRY_REQUIRED:    return ContextQualityEvent.ADMISSION_RETRY_REQUESTED
      case ContextAdmissionDecision.REJECTED:          return ContextQualityEvent.ADMISSION_REJECTED
    }
  })()
  bus.emit({ eventType, packageId, timestamp: clock.now(), payload: { decision: result.decision, reasonCodes: result.reasons.map(r => r.code) } })
}

export function emitEvaluationStarted(bus: ContextQualityTelemetry, packageId: ContextPackageId, clock: Clock): void {
  bus.emit({ eventType: ContextQualityEvent.EVALUATION_STARTED, packageId, timestamp: clock.now() })
}

export function emitEvaluationCompleted(bus: ContextQualityTelemetry, packageId: ContextPackageId, clock: Clock, compositeScore: number): void {
  bus.emit({ eventType: ContextQualityEvent.EVALUATION_COMPLETED, packageId, timestamp: clock.now(), payload: { compositeScore } })
}
