import type { RevocationEntry, RevocationSnapshot } from '@rohinik-org/package-trust-ir'
import type { RevocationSubject } from './types.js'

export interface ProviderCallRecord {
  resolveCalls: number
  requestedSubjects: RevocationSubject[]
}

export class RevocationSourceResolver {
  private readonly record: ProviderCallRecord = { resolveCalls: 0, requestedSubjects: [] }
  private readonly cache = new Map<string, readonly RevocationEntry[]>()

  constructor(private readonly snapshot: RevocationSnapshot | undefined) {}

  get callRecord(): Readonly<ProviderCallRecord> {
    return this.record
  }

  resolve(subject: RevocationSubject): { entries: readonly RevocationEntry[]; available: boolean } {
    const cacheKey = `${subject.targetKind}::${subject.targetId}`

    if (!this.cache.has(cacheKey)) {
      this.record.resolveCalls++
      this.record.requestedSubjects.push(subject)

      if (!this.snapshot) {
        this.cache.set(cacheKey, [])
        return { entries: [], available: false }
      }

      const entries = this.snapshot.entries.filter(
        e => e.targetKind === subject.targetKind && e.targetId === subject.targetId,
      )
      this.cache.set(cacheKey, entries)
    }
    // cached — don't count as new call

    const entries = this.cache.get(cacheKey)!
    return { entries, available: this.snapshot !== undefined }
  }
}
