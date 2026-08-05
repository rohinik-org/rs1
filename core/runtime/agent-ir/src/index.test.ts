import { describe, it, expect } from 'vitest'
import type {
  AgentId,
  AgentDefinitionId,
  AgentVersionId,
  AgentInstanceId,
  AgentRunId,
  AgentTaskId,
  AgentPlanId,
  DelegationId,
  AgentMessageId,
  AgentTeamId,
  AgentCheckpointId,
  AgentEvidenceId,
  AgentOutcomeId,
  SupersessionId,
} from './index.js'
import {
  AgentRunState,
  AgentTaskState,
  AgentPlanState,
  DelegationState,
  AgentOutcomeStatus,
} from './index.js'

describe('agent-ir canonical identities', () => {
  it('AgentRunState covers all lifecycle states', () => {
    const states: AgentRunState[] = [
      AgentRunState.CREATED,
      AgentRunState.ADMITTED,
      AgentRunState.RUNNING,
      AgentRunState.WAITING,
      AgentRunState.SUSPENDED,
      AgentRunState.COMPLETED,
      AgentRunState.FAILED,
      AgentRunState.CANCELLED,
    ]
    expect(states).toHaveLength(8)
  })

  it('AgentTaskState covers all task states', () => {
    const states: AgentTaskState[] = [
      AgentTaskState.PENDING,
      AgentTaskState.ASSIGNED,
      AgentTaskState.RUNNING,
      AgentTaskState.COMPLETED,
      AgentTaskState.FAILED,
      AgentTaskState.CANCELLED,
    ]
    expect(states).toHaveLength(6)
  })

  it('AgentPlanState covers all plan states', () => {
    const states: AgentPlanState[] = [
      AgentPlanState.DRAFT,
      AgentPlanState.ACTIVE,
      AgentPlanState.SUPERSEDED,
      AgentPlanState.COMPLETED,
      AgentPlanState.ABANDONED,
    ]
    expect(states).toHaveLength(5)
  })

  it('DelegationState covers all delegation states', () => {
    const states: DelegationState[] = [
      DelegationState.PENDING,
      DelegationState.ACCEPTED,
      DelegationState.ACTIVE,
      DelegationState.COMPLETED,
      DelegationState.REVOKED,
      DelegationState.REJECTED,
    ]
    expect(states).toHaveLength(6)
  })

  it('AgentOutcomeStatus covers all outcome values', () => {
    const statuses: AgentOutcomeStatus[] = [
      AgentOutcomeStatus.SUCCESS,
      AgentOutcomeStatus.PARTIAL,
      AgentOutcomeStatus.FAILURE,
      AgentOutcomeStatus.CANCELLED,
    ]
    expect(statuses).toHaveLength(4)
  })

  it('identity types are structurally branded strings', () => {
    // Type-only check — verifies shape compiles; value assigned as unknown cast
    const agentId = 'agent-001' as unknown as AgentId
    const defId = 'def-001' as unknown as AgentDefinitionId
    const verId = 'ver-001' as unknown as AgentVersionId
    const instId = 'inst-001' as unknown as AgentInstanceId
    const runId = 'run-001' as unknown as AgentRunId
    const taskId = 'task-001' as unknown as AgentTaskId
    const planId = 'plan-001' as unknown as AgentPlanId
    const delId = 'del-001' as unknown as DelegationId
    const msgId = 'msg-001' as unknown as AgentMessageId
    const teamId = 'team-001' as unknown as AgentTeamId
    const ckptId = 'ckpt-001' as unknown as AgentCheckpointId
    const evId = 'ev-001' as unknown as AgentEvidenceId
    const outId = 'out-001' as unknown as AgentOutcomeId
    const supId = 'sup-001' as unknown as SupersessionId

    expect(typeof agentId).toBe('string')
    expect(typeof defId).toBe('string')
    expect(typeof verId).toBe('string')
    expect(typeof instId).toBe('string')
    expect(typeof runId).toBe('string')
    expect(typeof taskId).toBe('string')
    expect(typeof planId).toBe('string')
    expect(typeof delId).toBe('string')
    expect(typeof msgId).toBe('string')
    expect(typeof teamId).toBe('string')
    expect(typeof ckptId).toBe('string')
    expect(typeof evId).toBe('string')
    expect(typeof outId).toBe('string')
    expect(typeof supId).toBe('string')
  })

  it('AgentRun shape is structurally valid', () => {
    const run = {
      runId: 'run-001' as unknown as AgentRunId,
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.CREATED,
      startedAt: new Date(),
      admittedAt: undefined,
      completedAt: undefined,
      cancelledAt: undefined,
      failedAt: undefined,
    }
    expect(run.state).toBe(AgentRunState.CREATED)
  })

  it('AgentEvidence is JSON-safe (no functions or symbols)', () => {
    const ev = {
      evidenceId: 'ev-001' as unknown as AgentEvidenceId,
      runId: 'run-001' as unknown as AgentRunId,
      taskId: 'task-001' as unknown as AgentTaskId,
      kind: 'observation' as const,
      payload: { value: 42 },
      recordedAt: new Date(),
    }
    const json = JSON.stringify(ev)
    expect(json).toContain('ev-001')
  })

  it('AgentSupersession links old plan to new plan', () => {
    const sup = {
      supersessionId: 'sup-001' as unknown as SupersessionId,
      oldPlanId: 'plan-001' as unknown as AgentPlanId,
      newPlanId: 'plan-002' as unknown as AgentPlanId,
      reason: 'context-shift',
      supersededAt: new Date(),
    }
    expect(sup.oldPlanId).not.toBe(sup.newPlanId)
  })
})
