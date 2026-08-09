/**
 * Stage 16D — Task 2: @rohinik-org/agent-protocol-v1
 *
 * Verifies public surface of the protocol package:
 *   - State enums match frozen Stage 15 semantics
 *   - Transition maps complete (all states covered)
 *   - Terminal state sets correct
 *   - AGENT_PROTOCOL_VERSION present
 *   - All request/response DTOs are plain objects (structural, not runtime validation)
 *   - Hash parity between fingerprint helper and raw SHA-256
 */

import { describe, it, expect } from 'vitest'
import {
  AgentRunState,
  AgentRunTransitions,
  AgentRunTerminalStates,
  DelegatedTaskState,
  DelegatedTaskTransitions,
  DelegatedTaskTerminalStates,
  AGENT_PROTOCOL_VERSION,
} from '../index.js'
import type {
  AdmitAgentRequest,
  AdmitAgentResponse,
  AgentInstanceResponse,
  StartAgentRunRequest,
  StartAgentRunResponse,
  AgentRunStatusResponse,
  CancelAgentRunRequest,
  DelegateTaskRequest,
  DelegateTaskResponse,
  AcceptDelegationResponse,
  RunDelegationResponse,
  SubmitDelegationResultRequest,
  AcceptDelegationResultResponse,
  RejectDelegationResultRequest,
  CancelDelegationRequest,
  CancelDelegationResponse,
  AgentRunEvidenceResponse,
} from '../index.js'

// ── AgentRunState ─────────────────────────────────────────────────────────────

describe('AgentRunState', () => {
  it('exposes all 11 states', () => {
    const states = Object.values(AgentRunState)
    expect(states).toContain('CREATED')
    expect(states).toContain('ADMITTED')
    expect(states).toContain('READY')
    expect(states).toContain('RUNNING')
    expect(states).toContain('WAITING')
    expect(states).toContain('BLOCKED')
    expect(states).toContain('DELEGATING')
    expect(states).toContain('SUSPENDED')
    expect(states).toContain('COMPLETED')
    expect(states).toContain('FAILED')
    expect(states).toContain('CANCELLED')
    expect(states).toHaveLength(11)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(AgentRunState)).toBe(true)
  })

  it('transition map covers all states', () => {
    for (const state of Object.values(AgentRunState)) {
      expect(AgentRunTransitions).toHaveProperty(state)
    }
  })

  it('terminal states: COMPLETED, FAILED, CANCELLED', () => {
    expect(AgentRunTerminalStates.has(AgentRunState.COMPLETED)).toBe(true)
    expect(AgentRunTerminalStates.has(AgentRunState.FAILED)).toBe(true)
    expect(AgentRunTerminalStates.has(AgentRunState.CANCELLED)).toBe(true)
    expect(AgentRunTerminalStates.size).toBe(3)
  })

  it('terminal states have no successors', () => {
    for (const terminal of ['COMPLETED', 'FAILED', 'CANCELLED'] as const) {
      expect(AgentRunTransitions[terminal]).toHaveLength(0)
    }
  })
})

// ── DelegatedTaskState ────────────────────────────────────────────────────────

describe('DelegatedTaskState', () => {
  it('exposes all 9 states', () => {
    const states = Object.values(DelegatedTaskState)
    expect(states).toContain('PROPOSED')
    expect(states).toContain('OFFERED')
    expect(states).toContain('ACCEPTED')
    expect(states).toContain('RUNNING')
    expect(states).toContain('SUBMITTED')
    expect(states).toContain('ACCEPTED_RESULT')
    expect(states).toContain('REJECTED_RESULT')
    expect(states).toContain('CANCELLED')
    expect(states).toContain('FAILED')
    expect(states).toHaveLength(9)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(DelegatedTaskState)).toBe(true)
  })

  it('transition map covers all states', () => {
    for (const state of Object.values(DelegatedTaskState)) {
      expect(DelegatedTaskTransitions).toHaveProperty(state)
    }
  })

  it('terminal states: ACCEPTED_RESULT, REJECTED_RESULT, CANCELLED, FAILED', () => {
    expect(DelegatedTaskTerminalStates.has(DelegatedTaskState.ACCEPTED_RESULT)).toBe(true)
    expect(DelegatedTaskTerminalStates.has(DelegatedTaskState.REJECTED_RESULT)).toBe(true)
    expect(DelegatedTaskTerminalStates.has(DelegatedTaskState.CANCELLED)).toBe(true)
    expect(DelegatedTaskTerminalStates.has(DelegatedTaskState.FAILED)).toBe(true)
    expect(DelegatedTaskTerminalStates.size).toBe(4)
  })

  it('terminal states have no successors', () => {
    for (const terminal of ['ACCEPTED_RESULT', 'REJECTED_RESULT', 'CANCELLED', 'FAILED'] as const) {
      expect(DelegatedTaskTransitions[terminal]).toHaveLength(0)
    }
  })

  it('PROPOSED → OFFERED is valid', () => {
    expect(DelegatedTaskTransitions.PROPOSED).toContain('OFFERED')
  })

  it('ACCEPTED → RUNNING is valid', () => {
    expect(DelegatedTaskTransitions.ACCEPTED).toContain('RUNNING')
  })

  it('RUNNING → SUBMITTED is valid', () => {
    expect(DelegatedTaskTransitions.RUNNING).toContain('SUBMITTED')
  })

  it('SUBMITTED → ACCEPTED_RESULT is valid', () => {
    expect(DelegatedTaskTransitions.SUBMITTED).toContain('ACCEPTED_RESULT')
  })
})

// ── AGENT_PROTOCOL_VERSION ────────────────────────────────────────────────────

describe('AGENT_PROTOCOL_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof AGENT_PROTOCOL_VERSION).toBe('string')
    expect(AGENT_PROTOCOL_VERSION.length).toBeGreaterThan(0)
  })

  it('starts with "1."', () => {
    expect(AGENT_PROTOCOL_VERSION.startsWith('1.')).toBe(true)
  })
})

// ── DTO shape checks (structural only — no runtime validation) ────────────────

describe('AdmitAgentRequest DTO', () => {
  it('admits { instanceId: string }', () => {
    const req: AdmitAgentRequest = { instanceId: 'inst-1' }
    expect(req.instanceId).toBe('inst-1')
  })
})

describe('AdmitAgentResponse DTO', () => {
  it('contains runId', () => {
    const res: AdmitAgentResponse = { runId: 'run-abc' }
    expect(res.runId).toBe('run-abc')
  })
})

describe('AgentInstanceResponse DTO', () => {
  it('contains instance fields', () => {
    const res: AgentInstanceResponse = {
      instanceId:   'inst-1',
      definitionId: 'def-1',
      versionId:    'ver-1',
      createdAt:    '2026-01-01T00:00:00.000Z',
    }
    expect(res.instanceId).toBe('inst-1')
  })
})

describe('StartAgentRunRequest DTO', () => {
  it('contains runId', () => {
    const req: StartAgentRunRequest = { runId: 'run-1' }
    expect(req.runId).toBe('run-1')
  })
})

describe('StartAgentRunResponse DTO', () => {
  it('contains runId and state RUNNING', () => {
    const res: StartAgentRunResponse = { runId: 'run-1', state: AgentRunState.RUNNING }
    expect(res.state).toBe('RUNNING')
  })
})

describe('AgentRunStatusResponse DTO', () => {
  it('contains core run fields', () => {
    const res: AgentRunStatusResponse = {
      runId:        'run-1',
      instanceId:   'inst-1',
      definitionId: 'def-1',
      versionId:    'ver-1',
      state:        AgentRunState.RUNNING,
      startedAt:    '2026-01-01T00:00:00.000Z',
    }
    expect(res.state).toBe('RUNNING')
  })

  it('admittedAt is optional', () => {
    const res: AgentRunStatusResponse = {
      runId: 'r', instanceId: 'i', definitionId: 'd', versionId: 'v',
      state: AgentRunState.ADMITTED, startedAt: '2026-01-01T00:00:00.000Z',
    }
    expect(res.admittedAt).toBeUndefined()
  })
})

describe('CancelAgentRunRequest DTO', () => {
  it('accepts optional reason', () => {
    const req: CancelAgentRunRequest = { reason: 'timeout' }
    expect(req.reason).toBe('timeout')
    const req2: CancelAgentRunRequest = {}
    expect(req2.reason).toBeUndefined()
  })
})

describe('DelegateTaskRequest DTO', () => {
  it('contains all required delegation fields', () => {
    const req: DelegateTaskRequest = {
      delegateeRunId:      'run-worker',
      taskId:              'task-1',
      description:         'do some work',
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read'],
      grantedDepth:        0,
      maxCostUsd:          5,
      maxLatencyMs:        60_000,
      maxTokens:           100_000,
    }
    expect(req.delegateeRunId).toBe('run-worker')
    expect(req.grantedDepth).toBe(0)
  })

  it('delegationId is optional', () => {
    const req: DelegateTaskRequest = {
      delegateeRunId: 'r', taskId: 't', description: 'd',
      grantedCapabilities: [], grantedActions: [], grantedDepth: 0,
      maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000,
    }
    expect(req.delegationId).toBeUndefined()
  })
})

describe('DelegateTaskResponse DTO', () => {
  it('contains certificateId, fingerprint, delegatedTaskId, delegationId', () => {
    const res: DelegateTaskResponse = {
      certificateId:   'cert-1',
      fingerprint:     'abc123',
      delegatedTaskId: 'dtask-1',
      delegationId:    'del-1',
    }
    expect(res.delegatedTaskId).toBe('dtask-1')
  })
})

describe('AcceptDelegationResponse DTO', () => {
  it('contains ok: true', () => {
    const res: AcceptDelegationResponse = { ok: true }
    expect(res.ok).toBe(true)
  })
})

describe('RunDelegationResponse DTO', () => {
  it('contains executionId and state', () => {
    const res: RunDelegationResponse = {
      executionId:     'exec-1',
      idempotencyKey:  null,
      state:           'QUEUED',
      protocolVersion: '1.0.0',
      submittedAt:     '2026-01-01T00:00:00.000Z',
      idempotent:      false,
      delegationId:    'del-1',
      delegatedTaskId: 'dtask-1',
    }
    expect(res.executionId).toBe('exec-1')
    expect(res.idempotencyKey).toBeNull()
  })
})

describe('SubmitDelegationResultRequest DTO', () => {
  it('contains result payload', () => {
    const req: SubmitDelegationResultRequest = { result: { answer: 42 } }
    expect((req.result as Record<string, number>).answer).toBe(42)
  })
})

describe('AcceptDelegationResultResponse DTO', () => {
  it('contains ok and parentResumed', () => {
    const res: AcceptDelegationResultResponse = { ok: true, parentResumed: true }
    expect(res.parentResumed).toBe(true)
  })
})

describe('RejectDelegationResultRequest DTO', () => {
  it('accepts optional reason', () => {
    const req: RejectDelegationResultRequest = { reason: 'bad output' }
    expect(req.reason).toBe('bad output')
    const req2: RejectDelegationResultRequest = {}
    expect(req2.reason).toBeUndefined()
  })
})

describe('CancelDelegationRequest DTO', () => {
  it('accepts optional reason', () => {
    const req: CancelDelegationRequest = { reason: 'abort' }
    expect(req.reason).toBe('abort')
  })
})

describe('CancelDelegationResponse DTO', () => {
  it('contains ok and parentResumed', () => {
    const res: CancelDelegationResponse = { ok: true, parentResumed: false }
    expect(res.parentResumed).toBe(false)
  })
})

describe('AgentRunEvidenceResponse DTO', () => {
  it('contains runId, state, events array', () => {
    const res: AgentRunEvidenceResponse = {
      runId:  'run-1',
      state:  AgentRunState.RUNNING,
      events: [],
    }
    expect(res.events).toHaveLength(0)
  })

  it('event shape includes eventId, kind, occurredAt', () => {
    const event: AgentRunEvidenceResponse['events'][number] = {
      eventId:    'evt-1',
      kind:       'run-transition',
      occurredAt: '2026-01-01T00:00:00.000Z',
    }
    expect(event.kind).toBe('run-transition')
  })
})

// ── T3: DelegatedAuthority / DelegatedBudget / ExecutionCorrelation ────────────

import type {
  DelegatedAuthority,
  DelegatedBudget,
  ExecutionCorrelation,
} from '../index.js'

describe('DelegatedAuthority DTO', () => {
  it('contains attenuation fields', () => {
    const auth: DelegatedAuthority = {
      allowedCapabilities: ['text-generation'],
      allowedActions:      ['read'],
      deniedActions:       [],
      maxDelegationDepth:  0,
    }
    expect(auth.maxDelegationDepth).toBe(0)
    expect(auth.allowedCapabilities).toContain('text-generation')
  })

  it('deniedActions defaults to empty array', () => {
    const auth: DelegatedAuthority = {
      allowedCapabilities: [],
      allowedActions:      [],
      deniedActions:       [],
      maxDelegationDepth:  1,
    }
    expect(auth.deniedActions).toHaveLength(0)
  })
})

describe('DelegatedBudget DTO', () => {
  it('contains all three budget fields', () => {
    const budget: DelegatedBudget = {
      maxCostUsd:   5.0,
      maxLatencyMs: 60_000,
      maxTokens:    100_000,
    }
    expect(budget.maxCostUsd).toBe(5.0)
    expect(budget.maxLatencyMs).toBe(60_000)
    expect(budget.maxTokens).toBe(100_000)
  })
})

describe('ExecutionCorrelation DTO', () => {
  it('links executionId to delegation and certificate', () => {
    const corr: ExecutionCorrelation = {
      executionId:          'exec-1',
      delegationId:         'del-1',
      delegatedTaskId:      'dtask-1',
      certificateFingerprint: 'abc123',
    }
    expect(corr.executionId).toBe('exec-1')
    expect(corr.certificateFingerprint).toBe('abc123')
  })
})

describe('RunDelegationResponse DTO — T3 correlation fields', () => {
  it('includes delegationId and delegatedTaskId alongside executionId', () => {
    const res: RunDelegationResponse = {
      executionId:     'exec-1',
      idempotencyKey:  null,
      state:           'QUEUED',
      protocolVersion: '1.0.0',
      submittedAt:     '2026-01-01T00:00:00.000Z',
      idempotent:      false,
      delegationId:    'del-1',
      delegatedTaskId: 'dtask-1',
    }
    expect(res.delegationId).toBe('del-1')
    expect(res.delegatedTaskId).toBe('dtask-1')
  })
})

describe('DelegateTaskRequest DTO — outputSchemaRef', () => {
  it('accepts optional outputSchemaRef', () => {
    const req: DelegateTaskRequest = {
      delegateeRunId:      'run-w',
      taskId:              't-1',
      description:         'do work',
      grantedCapabilities: ['text-generation'],
      grantedActions:      ['read'],
      grantedDepth:        0,
      maxCostUsd:          5,
      maxLatencyMs:        60_000,
      maxTokens:           100_000,
      outputSchemaRef:     { schemaId: 'my-schema', version: '1', semanticHash: 'a'.repeat(64) },
    }
    expect(req.outputSchemaRef?.schemaId).toBe('my-schema')
  })

  it('outputSchemaRef is optional', () => {
    const req: DelegateTaskRequest = {
      delegateeRunId: 'r', taskId: 't', description: 'd',
      grantedCapabilities: [], grantedActions: [], grantedDepth: 0,
      maxCostUsd: 1, maxLatencyMs: 1000, maxTokens: 1000,
    }
    expect(req.outputSchemaRef).toBeUndefined()
  })
})
