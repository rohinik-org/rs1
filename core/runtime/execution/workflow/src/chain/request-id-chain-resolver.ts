import type { ExecutionRecord, ExecutionChain } from '@rohinik-org/compiler'
import type { ExecutionChainResolver } from './execution-chain-resolver.js'

const STEP_PATTERN = /^(.+)-step(\d+)$/

export class RequestIdChainResolver implements ExecutionChainResolver {
  resolve(records: readonly ExecutionRecord[]): readonly ExecutionChain[] {
    const groups = new Map<string, Array<{ record: ExecutionRecord; step: number }>>()

    for (const r of records) {
      if (!r.winnerSkillId) continue
      const m = r.requestId.match(STEP_PATTERN)
      if (!m) continue
      const prefix = m[1]!
      const step = parseInt(m[2]!, 10)
      if (!groups.has(prefix)) groups.set(prefix, [])
      groups.get(prefix)!.push({ record: r, step })
    }

    const chains: ExecutionChain[] = []
    for (const [prefix, items] of groups) {
      const sorted = items.sort((a, b) => a.step - b.step).map(i => i.record)
      chains.push({
        chainId: prefix,
        records: sorted,
        corpusRevision: 0,
        startedAt: sorted[0]!.timestamp,
        completedAt: sorted[sorted.length - 1]!.timestamp,
      })
    }
    return chains
  }
}
