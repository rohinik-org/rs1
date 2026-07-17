import type { EventBus, DecisionTrace } from '@rohinik-org/kernel'
import { CorpusWriter } from '../writer/corpus-writer.js'
import { CorpusMetadataEngine } from '../metadata/corpus-metadata-engine.js'
import { MonitorRegistry } from '../monitors/monitor-registry.js'
import type { CorpusStorage } from '../storage/corpus-storage.js'
import type { EvidenceMonitor } from '../monitors/evidence-monitor.js'

export class CorpusService {
  private readonly writer: CorpusWriter
  private readonly metadata: CorpusMetadataEngine
  private readonly monitors: MonitorRegistry

  constructor(
    private readonly bus: EventBus,
    storage: CorpusStorage,
    runtimeId: string,
    runtimeVersion: string,
  ) {
    this.metadata = new CorpusMetadataEngine()
    this.writer = new CorpusWriter(storage, this.metadata, runtimeId, runtimeVersion)
    this.monitors = new MonitorRegistry()
  }

  start(): void {
    this.bus.on('EXECUTION_RECORD_READY', (data) => this.handle(data))
  }

  private async handle(data: unknown): Promise<void> {
    try {
      if (!data || typeof data !== 'object') return
      const event = data as {
        type?: string
        trace?: unknown
        totalLatencyMs?: number
        estimatedCostUsd?: number
        tokensUsed?: number
      }
      if (event.type !== 'EXECUTION_RECORD_READY') return
      if (!event.trace || typeof event.trace !== 'object') return
      const trace = event.trace as DecisionTrace
      await this.writer.onExecutionCompleted(trace, event.totalLatencyMs ?? 0, {
        ...(event.estimatedCostUsd !== undefined ? { estimatedCostUsd: event.estimatedCostUsd } : {}),
        ...(event.tokensUsed !== undefined ? { tokensUsed: event.tokensUsed } : {}),
      })
    } catch {
      // Never propagate corpus errors to kernel
    }
  }

  getMetadata(): CorpusMetadataEngine {
    return this.metadata
  }

  registerMonitor(monitor: EvidenceMonitor): void {
    this.monitors.register(monitor)
  }
}
