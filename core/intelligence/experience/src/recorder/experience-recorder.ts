import { randomUUID } from 'node:crypto'
import type { EventBus } from '@rohinik-org/kernel'
import type { ExperienceRequest, ExperienceRecord, ExperienceRecordReadyPayload } from '@rohinik-org/experience-ir'
import { ExperienceEvent } from '@rohinik-org/experience-ir'
import type { ExperienceCollector } from '../collector/experience-collector.js'
import type { ExperienceFingerprintBuilder } from '../fingerprint/experience-fingerprint-builder.js'
import type { ExperienceAssembler } from '../assembler/experience-assembler.js'

export class DuplicateExperienceError extends Error {
  constructor(evaluationRecordId: string) {
    super(`EvaluationRecord already captured: ${evaluationRecordId} (Law 52 — one evaluation → one experience)`)
    this.name = 'DuplicateExperienceError'
  }
}

export class ExperienceRecorder {
  static readonly VERSION = '1.0.0'
  private readonly captured = new Set<string>()
  private readonly replayMode: boolean

  constructor(
    private readonly collector: ExperienceCollector,
    private readonly fingerprintBuilder: ExperienceFingerprintBuilder,
    private readonly assembler: ExperienceAssembler,
    private readonly events: EventBus,
    options?: { replayMode?: boolean },
  ) {
    this.replayMode = options?.replayMode ?? false
  }

  record(request: ExperienceRequest): ExperienceRecord {
    const evaluationRecordId = request.evaluation.recordId

    if (!this.replayMode && this.captured.has(evaluationRecordId)) {
      throw new DuplicateExperienceError(evaluationRecordId)
    }

    const t0 = Date.now()

    const source = this.collector.collect(request, request.evaluation)
    const fingerprint = this.fingerprintBuilder.build(source, request.evaluation)
    const record = this.assembler.assemble(
      request,
      source,
      fingerprint,
      ExperienceRecorder.VERSION,
      Date.now() - t0,
    )

    this.captured.add(evaluationRecordId)

    const payload: ExperienceRecordReadyPayload = Object.freeze({
      record,
      metadata: Object.freeze({
        runtimeVersion: '0.1.0',
        hostId: randomUUID(),
        timestamp: new Date(),
      }),
    })
    this.events.emit(ExperienceEvent.EXPERIENCE_RECORD_READY, payload)

    return record
  }
}
