import { randomUUID } from 'node:crypto'

export type AgentEventKind =
  | 'agent-admitted'
  | 'run-transition'
  | 'certificate-issued'
  | 'certificate-revoked'
  | 'delegation-proposed'
  | 'delegation-offered'
  | 'delegation-accepted'
  | 'delegation-run'
  | 'result-submitted'
  | 'result-accepted'
  | 'result-rejected'
  | 'delegation-cancelled'
  | 'delegation-failed'
  | 'run-cancelled'
  | 'execution-started'
  | 'execution-completed'
  | 'synthesis-evidence'

// Delegation event kinds that indicate a terminal outcome (sibling is resolved)
const DELEGATION_TERMINAL_KINDS = new Set<AgentEventKind>([
  'result-accepted',
  'result-rejected',
  'delegation-cancelled',
  'delegation-failed',
])

// Delegation event kinds that indicate an active (blocking) state
const DELEGATION_ACTIVE_KINDS = new Set<AgentEventKind>([
  'delegation-offered',
  'delegation-accepted',
  'delegation-run',
  'result-submitted',
])

export interface AgentEvent {
  readonly eventId:          string
  readonly kind:             AgentEventKind
  readonly runId:            string
  readonly delegationId?:    string
  readonly delegatedTaskId?: string
  readonly certificateId?:   string
  readonly fingerprint?:     string
  readonly fromState?:       string
  readonly toState?:         string
  readonly reason?:          string
  readonly evidenceId?:      string
  readonly payload?:         unknown
  readonly occurredAt:       Date
}

export class AgentEventStore {
  private readonly byRun        = new Map<string, AgentEvent[]>()
  private readonly byDelegation = new Map<string, AgentEvent[]>()

  append(event: AgentEvent): void {
    const runList = this.byRun.get(event.runId) ?? []
    this.byRun.set(event.runId, [...runList, event])
    if (event.delegationId !== undefined) {
      const delList = this.byDelegation.get(event.delegationId) ?? []
      this.byDelegation.set(event.delegationId, [...delList, event])
    }
  }

  listByRun(runId: string): readonly AgentEvent[] {
    return this.byRun.get(runId) ?? []
  }

  listByDelegation(delegationId: string): readonly AgentEvent[] {
    return this.byDelegation.get(delegationId) ?? []
  }

  /**
   * Returns true when the parent run can safely transition from DELEGATING → RUNNING.
   * Conditions:
   *   - No sibling delegations for the same run are in an active (blocking) state.
   *   - A sibling is blocking when its event log contains an active-kind event but
   *     no subsequent terminal-kind event.
   * The resolvedDelegationId is excluded from the sibling check (already resolved).
   */
  canResumeFromDelegating(runId: string, resolvedDelegationId: string): boolean {
    const allEvents = this.byRun.get(runId) ?? []

    // Collect all unique delegationIds for this run except the resolved one
    const siblings = new Set<string>()
    for (const ev of allEvents) {
      if (ev.kind === 'delegation-proposed' && ev.delegationId !== undefined && ev.delegationId !== resolvedDelegationId) {
        siblings.add(ev.delegationId)
      }
    }

    if (siblings.size === 0) return true

    for (const sibId of siblings) {
      const sibEvents = this.byDelegation.get(sibId) ?? []
      const isTerminal = sibEvents.some(e => DELEGATION_TERMINAL_KINDS.has(e.kind))
      if (!isTerminal) {
        // Check whether sibling ever became active
        const becameActive = sibEvents.some(e => DELEGATION_ACTIVE_KINDS.has(e.kind))
        if (becameActive) return false
        // A sibling that was proposed but never offered is not yet blocking
      }
    }
    return true
  }
}

export function makeAgentEvent(
  kind: AgentEventKind,
  runId: string,
  fields?: Partial<Omit<AgentEvent, 'eventId' | 'kind' | 'runId' | 'occurredAt'>>,
): AgentEvent {
  return {
    eventId: randomUUID(),
    kind,
    runId,
    occurredAt: new Date(),
    ...fields,
  }
}
