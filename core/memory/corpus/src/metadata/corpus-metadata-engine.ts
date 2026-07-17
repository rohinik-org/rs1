import type { ExecutionRecord } from '@rohinik-org/compiler'

export interface CorpusInfo {
  readonly totalRecords: number
  readonly firstRecordAt: string | null
  readonly lastRecordAt: string | null
  readonly successRate: number
  readonly avgLatencyMs: number
  readonly isIndexed: boolean
  readonly schemaVersion: string
  readonly storageKind: string
}

export interface DailyIndex {
  readonly date: string
  readonly recordCount: number
  readonly skillCounts: Readonly<Record<string, number>>
  readonly tierCounts: Readonly<Record<string, number>>
  readonly outcomeCounts: Readonly<Record<string, number>>
}

export class CorpusMetadataEngine {
  private totalRecords = 0
  private successCount = 0
  private latencySum = 0
  private firstRecordAt: string | null = null
  private lastRecordAt: string | null = null
  private readonly dailyIndexes = new Map<string, {
    recordCount: number
    skillCounts: Record<string, number>
    tierCounts: Record<string, number>
    outcomeCounts: Record<string, number>
  }>()

  observe(record: ExecutionRecord): void {
    this.totalRecords++

    if (record.outcome === 'SUCCESS') this.successCount++

    this.latencySum += record.totalLatencyMs

    if (this.firstRecordAt === null || record.timestamp < this.firstRecordAt) {
      this.firstRecordAt = record.timestamp
    }
    if (this.lastRecordAt === null || record.timestamp > this.lastRecordAt) {
      this.lastRecordAt = record.timestamp
    }

    const day = record.timestamp.slice(0, 10)
    if (!this.dailyIndexes.has(day)) {
      this.dailyIndexes.set(day, { recordCount: 0, skillCounts: {}, tierCounts: {}, outcomeCounts: {} })
    }
    const idx = this.dailyIndexes.get(day)!
    idx.recordCount++
    if (record.winnerSkillId) {
      idx.skillCounts[record.winnerSkillId] = (idx.skillCounts[record.winnerSkillId] ?? 0) + 1
    }
    if (record.winnerTierId) {
      idx.tierCounts[record.winnerTierId] = (idx.tierCounts[record.winnerTierId] ?? 0) + 1
    }
    idx.outcomeCounts[record.outcome] = (idx.outcomeCounts[record.outcome] ?? 0) + 1
  }

  getInfo(): CorpusInfo & { avgLatencyMs: number; successRate: number } {
    return {
      totalRecords: this.totalRecords,
      firstRecordAt: this.firstRecordAt,
      lastRecordAt: this.lastRecordAt,
      successRate: this.totalRecords > 0 ? this.successCount / this.totalRecords : 0,
      avgLatencyMs: this.totalRecords > 0 ? this.latencySum / this.totalRecords : 0,
      isIndexed: true,
      schemaVersion: '1.0',
      storageKind: 'json',
    }
  }

  getDailyIndex(date: string): DailyIndex {
    const idx = this.dailyIndexes.get(date)
    if (!idx) return { date, recordCount: 0, skillCounts: {}, tierCounts: {}, outcomeCounts: {} }
    return { date, ...idx }
  }
}
