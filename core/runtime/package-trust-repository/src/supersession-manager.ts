import { RepositoryWriteConflict } from './types.js'
import type {
  RecordSupersessionCommand,
  SupersessionLink,
  RepositoryRecordId,
} from './types.js'

export function createSupersessionManager() {
  // priorId → successorId (only one active successor allowed by default)
  const successors = new Map<string, string>()
  // All recorded links
  const links: SupersessionLink[] = []

  function buildReachable(from: string): Set<string> {
    const visited = new Set<string>()
    const queue = [from]
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (visited.has(cur)) continue
      visited.add(cur)
      const next = successors.get(cur)
      if (next) queue.push(next)
    }
    return visited
  }

  function recordSupersession(
    cmd: RecordSupersessionCommand,
    lookupSubject: (id: RepositoryRecordId) => { packageId: string; version: string } | undefined,
  ): SupersessionLink {
    const priorId = cmd.priorRecordId as RepositoryRecordId
    const successorId = cmd.successorRecordId as RepositoryRecordId

    if (priorId === successorId) {
      throw new RepositoryWriteConflict('self-supersession', 'A record cannot supersede itself')
    }

    const prior = lookupSubject(priorId)
    const successor = lookupSubject(successorId)

    if (!prior) throw new RepositoryWriteConflict('referential-integrity-failure', `Prior record not found: ${priorId}`)
    if (!successor) throw new RepositoryWriteConflict('referential-integrity-failure', `Successor record not found: ${successorId}`)

    if (prior.packageId !== successor.packageId || prior.version !== successor.version) {
      throw new RepositoryWriteConflict('cross-subject-supersession',
        `Cross-subject supersession rejected: ${prior.packageId}@${prior.version} → ${successor.packageId}@${successor.version}`)
    }

    // Cycle detection: successor must not eventually reach priorId
    const reachableFromSuccessor = buildReachable(successorId)
    if (reachableFromSuccessor.has(priorId)) {
      throw new RepositoryWriteConflict('supersession-cycle', `Supersession cycle detected: ${priorId} → ${successorId}`)
    }

    // Enforce single successor
    if (successors.has(priorId)) {
      throw new RepositoryWriteConflict('revision-conflict',
        `Record ${priorId} already has a successor. Multiple successors are not allowed.`)
    }

    const link: SupersessionLink = {
      priorRecordId:     priorId,
      successorRecordId: successorId,
      reason:            cmd.reason,
      recordedAt:        cmd.recordedAt,
    }
    successors.set(priorId, successorId)
    links.push(link)
    return link
  }

  function isSuperseded(recordId: string): boolean {
    return successors.has(recordId)
  }

  function getSuccessor(recordId: string): string | undefined {
    return successors.get(recordId)
  }

  function getAllLinks(): readonly SupersessionLink[] {
    return links
  }

  return { recordSupersession, isSuperseded, getSuccessor, getAllLinks }
}
