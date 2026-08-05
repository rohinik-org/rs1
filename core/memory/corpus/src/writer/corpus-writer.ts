import { createHash } from 'node:crypto'
import type { ExecutionRecord, ExecutionCandidate, ProviderResolutionRecord } from '@rohinik-org/compiler'
import type { CorpusStorage } from '../storage/corpus-storage.js'
import type { CorpusMetadataEngine } from '../metadata/corpus-metadata-engine.js'

// ponytail: local structural aliases break the corpus→kernel→foundation→...→knowledge-graph→corpus cycle
type SkillScoredEvent = { type: 'SKILL_SCORED'; tierId: string; skillId: string; score: { finalScore: number } }
type ProviderResolvedEvent = { type: 'PROVIDER_RESOLVED'; skillId: string; requirementKey: string; resolution: { provider: { metadata: { providerId: string } }; policy: string } }
export type DecisionEvent = { type: string } & (SkillScoredEvent | ProviderResolvedEvent | Record<string, unknown>)
export type DecisionTrace = { readonly requestId: string; readonly events: readonly DecisionEvent[]; readonly reasoningInvoked: boolean; readonly winnerTierId?: string; readonly winnerSkillId?: string }
export type EventBus = { emit(event: string, data?: unknown): void; on(event: string, handler: (data: unknown) => void): void; off(event: string, handler: (data: unknown) => void): void }

type RecordBody = Omit<ExecutionRecord, 'recordId'>

export class CorpusWriter {
  constructor(
    private readonly storage: CorpusStorage,
    private readonly metadata: CorpusMetadataEngine,
    private readonly runtimeId: string,
    private readonly runtimeVersion: string,
  ) {}

  async onExecutionCompleted(
    trace: DecisionTrace,
    totalLatencyMs: number,
    opts: { estimatedCostUsd?: number; tokensUsed?: number } = {},
  ): Promise<void> {
    try {
      const body = this.buildBody(trace, totalLatencyMs, opts)
      const recordId = createHash('sha256').update(JSON.stringify(body)).digest('hex')
      const record: ExecutionRecord = { ...body, recordId }
      await this.storage.write(record)
      this.metadata.observe(record)
    } catch {
      // Corpus write failures are non-fatal — must never crash the kernel
    }
  }

  private buildBody(
    trace: DecisionTrace,
    totalLatencyMs: number,
    opts: { estimatedCostUsd?: number; tokensUsed?: number },
  ): RecordBody {
    const selectedSkillId = trace.winnerSkillId

    const allCandidates: ExecutionCandidate[] = trace.events
      .filter((e): e is SkillScoredEvent => e.type === 'SKILL_SCORED')
      .map((e: SkillScoredEvent) => ({
        skillId: e.skillId,
        tierId: e.tierId,
        score: e.score.finalScore,
        selected: e.skillId === selectedSkillId,
      }))

    const providerResolutions: ProviderResolutionRecord[] = trace.events
      .filter((e): e is ProviderResolvedEvent => e.type === 'PROVIDER_RESOLVED')
      .map((e: ProviderResolvedEvent) => ({
        requirementKey: e.requirementKey,
        providerId: e.resolution.provider.metadata.providerId,
        providerKind: e.resolution.policy,
        resolved: true,
      }))

    return {
      kind: 'ExecutionRecord',
      schemaVersion: '1.0',
      runtimeId: this.runtimeId,
      timestamp: new Date().toISOString(),
      requestId: trace.requestId,
      requestHash: createHash('sha256').update(trace.requestId).digest('hex'),
      contentType: 'TEXT',
      requestSizeBytes: 0,
      outcome: trace.winnerTierId ? 'SUCCESS' : 'NO_ROUTE',
      ...(trace.winnerTierId !== undefined ? { winnerTierId: trace.winnerTierId } : {}),
      ...(trace.winnerSkillId !== undefined ? { winnerSkillId: trace.winnerSkillId } : {}),
      allCandidates,
      reasoningInvoked: trace.reasoningInvoked,
      retried: false,
      retryCount: 0,
      totalLatencyMs,
      tierLatencies: [],
      providerResolutions,
      ...(opts.estimatedCostUsd !== undefined ? { estimatedCostUsd: opts.estimatedCostUsd } : {}),
      ...(opts.tokensUsed !== undefined ? { tokensUsed: opts.tokensUsed } : {}),
      sourceTraceId: trace.requestId,
      runtimeVersion: this.runtimeVersion,
    }
  }
}
