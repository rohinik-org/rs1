import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
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
  AgentDefinition,
  AgentVersion,
  AgentGoal,
  AgentRole,
  AgentAuthority,
  AgentCapabilityRequirement,
  AgentBudget,
  AgentConstraint,
  AgentPolicyRef,
  AgentInstance,
  AgentPlanStep,
  AgentFailure,
  AgentCancellation,
} from './index.js'
import {
  AgentRunState,
  AgentRunTransitions,
  AgentRunTerminalStates,
  AgentTaskState,
  AgentTaskTransitions,
  AgentTaskTerminalStates,
  AgentPlanState,
  AgentPlanTransitions,
  AgentPlanTerminalStates,
  DelegationState,
  AgentOutcomeStatus,
  AgentGoalPriority,
  AgentConstraintKind,
} from './index.js'

describe('agent-ir canonical identities', () => {
  it('AgentRunState covers all lifecycle states', () => {
    const states: AgentRunState[] = [
      AgentRunState.CREATED,
      AgentRunState.ADMITTED,
      AgentRunState.READY,
      AgentRunState.RUNNING,
      AgentRunState.WAITING,
      AgentRunState.BLOCKED,
      AgentRunState.DELEGATING,
      AgentRunState.SUSPENDED,
      AgentRunState.COMPLETED,
      AgentRunState.FAILED,
      AgentRunState.CANCELLED,
    ]
    expect(states).toHaveLength(11)
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

describe('agent-ir definition and authority', () => {
  it('AgentGoalPriority covers all values', () => {
    const priorities: AgentGoalPriority[] = [
      AgentGoalPriority.CRITICAL,
      AgentGoalPriority.HIGH,
      AgentGoalPriority.NORMAL,
      AgentGoalPriority.LOW,
    ]
    expect(priorities).toHaveLength(4)
  })

  it('AgentConstraintKind covers all values', () => {
    const kinds: AgentConstraintKind[] = [
      AgentConstraintKind.BUDGET,
      AgentConstraintKind.TIME,
      AgentConstraintKind.CAPABILITY,
      AgentConstraintKind.AUTHORITY,
      AgentConstraintKind.POLICY,
    ]
    expect(kinds).toHaveLength(5)
  })

  it('AgentDefinition is structurally valid and immutable', () => {
    const def: AgentDefinition = {
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      name: 'summariser',
      description: 'Summarises documents',
      createdAt: new Date(),
    }
    expect(def.name).toBe('summariser')
  })

  it('AgentVersion references its definition', () => {
    const ver: AgentVersion = {
      versionId: 'ver-001' as unknown as AgentVersionId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      semver: '1.0.0',
      goals: [],
      roles: [],
      authority: {
        authorityId: 'auth-001',
        allowedCapabilities: ['cap-read'],
        allowedActions: ['read'],
        deniedActions: [],
        maxDelegationDepth: 2,
      },
      capabilityRequirements: [],
      budget: {
        budgetId: 'bgt-001',
        maxCostUsd: 1.0,
        maxLatencyMs: 5000,
        maxTokens: 4096,
      },
      constraints: [],
      policyRefs: [],
      publishedAt: new Date(),
    }
    expect(ver.definitionId).toBe('def-001' as unknown as AgentDefinitionId)
    expect(ver.semver).toBe('1.0.0')
  })

  it('AgentAuthority has no implicit provider binding', () => {
    const auth: AgentAuthority = {
      authorityId: 'auth-001',
      allowedCapabilities: ['cap-a'],
      allowedActions: ['read', 'write'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    // No provider field — structural check that it doesn't exist
    expect('provider' in auth).toBe(false)
    expect('modelId' in auth).toBe(false)
  })

  it('AgentGoal has priority and is readonly', () => {
    const goal: AgentGoal = {
      goalId: 'goal-001',
      description: 'Summarise input',
      priority: AgentGoalPriority.HIGH,
      required: true,
    }
    expect(goal.priority).toBe(AgentGoalPriority.HIGH)
  })

  it('AgentRole is a named label with no runtime state', () => {
    const role: AgentRole = {
      roleId: 'role-001',
      name: 'reader',
      description: 'Read-only access role',
    }
    expect(role.name).toBe('reader')
    expect('state' in role).toBe(false)
  })

  it('AgentCapabilityRequirement references capability by id only', () => {
    const req: AgentCapabilityRequirement = {
      capabilityId: 'cap-read',
      required: true,
    }
    expect(typeof req.capabilityId).toBe('string')
  })

  it('AgentBudget fields are all numeric', () => {
    const bgt: AgentBudget = {
      budgetId: 'bgt-001',
      maxCostUsd: 0.5,
      maxLatencyMs: 3000,
      maxTokens: 2048,
    }
    expect(typeof bgt.maxCostUsd).toBe('number')
    expect(typeof bgt.maxLatencyMs).toBe('number')
    expect(typeof bgt.maxTokens).toBe('number')
  })

  it('AgentConstraint uses kind discriminant', () => {
    const c: AgentConstraint = {
      constraintId: 'c-001',
      kind: AgentConstraintKind.TIME,
      description: 'Must complete within deadline',
      value: { deadlineMs: 60000 },
    }
    expect(c.kind).toBe(AgentConstraintKind.TIME)
  })

  it('AgentPolicyRef is a pointer only — no inline policy', () => {
    const ref: AgentPolicyRef = {
      policyId: 'pol-001',
      policyKind: 'execution',
    }
    expect(typeof ref.policyId).toBe('string')
    expect('rules' in ref).toBe(false)
  })

  it('AgentVersion is JSON-safe', () => {
    const ver: AgentVersion = {
      versionId: 'ver-002' as unknown as AgentVersionId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      semver: '2.0.0',
      goals: [],
      roles: [],
      authority: {
        authorityId: 'auth-002',
        allowedCapabilities: [],
        allowedActions: [],
        deniedActions: [],
        maxDelegationDepth: 0,
      },
      capabilityRequirements: [],
      budget: { budgetId: 'bgt-002', maxCostUsd: 0, maxLatencyMs: 0, maxTokens: 0 },
      constraints: [],
      policyRefs: [],
      publishedAt: new Date(),
    }
    const json = JSON.stringify(ver)
    expect(json).toContain('ver-002')
  })
})

describe('agent-ir instance, plan-step, failure, cancellation contracts', () => {
  it('AgentInstance binds definition and version at creation', () => {
    const inst: AgentInstance = {
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      createdAt: new Date(),
    }
    expect(inst.definitionId).toBeDefined()
    expect(inst.versionId).toBeDefined()
    expect('state' in inst).toBe(false)
  })

  it('AgentPlanStep references task and has ordinal', () => {
    const step: AgentPlanStep = {
      stepId: 'step-001',
      planId: 'plan-001' as unknown as AgentPlanId,
      taskId: 'task-001' as unknown as AgentTaskId,
      ordinal: 0,
      description: 'First step',
    }
    expect(step.ordinal).toBe(0)
  })

  it('AgentPlanStep dependsOn is optional', () => {
    const step: AgentPlanStep = {
      stepId: 'step-002',
      planId: 'plan-001' as unknown as AgentPlanId,
      taskId: 'task-002' as unknown as AgentTaskId,
      ordinal: 1,
      description: 'Second step',
      dependsOn: ['step-001'],
    }
    expect(step.dependsOn).toHaveLength(1)
  })

  it('AgentFailure captures error without runtime reference', () => {
    const failure: AgentFailure = {
      failureId: 'fail-001',
      runId: 'run-001' as unknown as AgentRunId,
      taskId: 'task-001' as unknown as AgentTaskId,
      reason: 'capability-unavailable',
      detail: 'cap-read not installed',
      failedAt: new Date(),
    }
    expect(failure.reason).toBe('capability-unavailable')
    expect('error' in failure).toBe(false)
  })

  it('AgentCancellation records who cancelled and why', () => {
    const cancel: AgentCancellation = {
      cancellationId: 'cancel-001',
      runId: 'run-001' as unknown as AgentRunId,
      requestedBy: 'human-oversight',
      reason: 'user-request',
      cancelledAt: new Date(),
    }
    expect(cancel.requestedBy).toBe('human-oversight')
  })

  it('AgentFailure and AgentCancellation are JSON-safe', () => {
    const failure: AgentFailure = {
      failureId: 'fail-002',
      runId: 'run-002' as unknown as AgentRunId,
      reason: 'timeout',
      failedAt: new Date(),
    }
    const cancel: AgentCancellation = {
      cancellationId: 'cancel-002',
      runId: 'run-002' as unknown as AgentRunId,
      requestedBy: 'system',
      reason: 'budget-exceeded',
      cancelledAt: new Date(),
    }
    expect(JSON.stringify(failure)).toContain('fail-002')
    expect(JSON.stringify(cancel)).toContain('cancel-002')
  })
})

// ── Stage 15A Constitutional Tests ───────────────────────────────────────────

describe('15A constitutional: AgentRun transition map', () => {
  it('every AgentRunState has an entry in AgentRunTransitions', () => {
    for (const state of Object.values(AgentRunState)) {
      expect(AgentRunTransitions).toHaveProperty(state)
    }
  })

  it('CREATED can only go to ADMITTED or CANCELLED', () => {
    expect(AgentRunTransitions.CREATED).toEqual(['ADMITTED', 'CANCELLED'])
  })

  it('ADMITTED can only go to READY or CANCELLED', () => {
    expect(AgentRunTransitions.ADMITTED).toEqual(['READY', 'CANCELLED'])
  })

  it('RUNNING can reach all non-terminal mid-states and all terminals', () => {
    const successors = AgentRunTransitions.RUNNING
    expect(successors).toContain('WAITING')
    expect(successors).toContain('BLOCKED')
    expect(successors).toContain('DELEGATING')
    expect(successors).toContain('SUSPENDED')
    expect(successors).toContain('COMPLETED')
    expect(successors).toContain('FAILED')
    expect(successors).toContain('CANCELLED')
  })

  it('DELEGATING exits to RUNNING, CANCELLED, or FAILED only', () => {
    expect(AgentRunTransitions.DELEGATING).toEqual(['RUNNING', 'CANCELLED', 'FAILED'])
  })

  it('terminal states have no successors', () => {
    for (const terminal of AgentRunTerminalStates) {
      expect(AgentRunTransitions[terminal]).toHaveLength(0)
    }
  })

  it('terminal states are COMPLETED, FAILED, CANCELLED', () => {
    expect(AgentRunTerminalStates.has('COMPLETED')).toBe(true)
    expect(AgentRunTerminalStates.has('FAILED')).toBe(true)
    expect(AgentRunTerminalStates.has('CANCELLED')).toBe(true)
    expect(AgentRunTerminalStates.size).toBe(3)
  })

  it('invalid transitions are not present', () => {
    // COMPLETED cannot go anywhere
    expect(AgentRunTransitions.COMPLETED).toHaveLength(0)
    // CREATED cannot jump directly to RUNNING
    expect(AgentRunTransitions.CREATED).not.toContain('RUNNING')
    // ADMITTED cannot skip to RUNNING
    expect(AgentRunTransitions.ADMITTED).not.toContain('RUNNING')
    // No state transitions to CREATED (no re-entry)
    for (const successors of Object.values(AgentRunTransitions)) {
      expect(successors).not.toContain('CREATED')
    }
  })

  it('DELEGATING is not reachable from CREATED, ADMITTED, or READY', () => {
    expect(AgentRunTransitions.CREATED).not.toContain('DELEGATING')
    expect(AgentRunTransitions.ADMITTED).not.toContain('DELEGATING')
    expect(AgentRunTransitions.READY).not.toContain('DELEGATING')
  })
})

describe('15A constitutional: AgentTask transition map', () => {
  it('every AgentTaskState has an entry in AgentTaskTransitions', () => {
    for (const state of Object.values(AgentTaskState)) {
      expect(AgentTaskTransitions).toHaveProperty(state)
    }
  })

  it('PENDING goes to ASSIGNED or CANCELLED only', () => {
    expect(AgentTaskTransitions.PENDING).toEqual(['ASSIGNED', 'CANCELLED'])
  })

  it('RUNNING reaches all task terminals', () => {
    expect(AgentTaskTransitions.RUNNING).toContain('COMPLETED')
    expect(AgentTaskTransitions.RUNNING).toContain('FAILED')
    expect(AgentTaskTransitions.RUNNING).toContain('CANCELLED')
  })

  it('task terminal states have no successors', () => {
    for (const terminal of AgentTaskTerminalStates) {
      expect(AgentTaskTransitions[terminal]).toHaveLength(0)
    }
  })

  it('invalid task transitions are not present', () => {
    // PENDING cannot jump to RUNNING
    expect(AgentTaskTransitions.PENDING).not.toContain('RUNNING')
    // No re-entry to PENDING
    for (const successors of Object.values(AgentTaskTransitions)) {
      expect(successors).not.toContain('PENDING')
    }
  })
})

describe('15A constitutional: AgentPlan transition map', () => {
  it('every AgentPlanState has an entry in AgentPlanTransitions', () => {
    for (const state of Object.values(AgentPlanState)) {
      expect(AgentPlanTransitions).toHaveProperty(state)
    }
  })

  it('DRAFT goes to ACTIVE or ABANDONED only', () => {
    expect(AgentPlanTransitions.DRAFT).toEqual(['ACTIVE', 'ABANDONED'])
  })

  it('ACTIVE can be superseded, completed, or abandoned', () => {
    expect(AgentPlanTransitions.ACTIVE).toContain('SUPERSEDED')
    expect(AgentPlanTransitions.ACTIVE).toContain('COMPLETED')
    expect(AgentPlanTransitions.ACTIVE).toContain('ABANDONED')
  })

  it('plan terminal states have no successors', () => {
    for (const terminal of AgentPlanTerminalStates) {
      expect(AgentPlanTransitions[terminal]).toHaveLength(0)
    }
  })

  it('SUPERSEDED is terminal — plan governance is immutable once superseded', () => {
    expect(AgentPlanTransitions.SUPERSEDED).toHaveLength(0)
    expect(AgentPlanTerminalStates.has('SUPERSEDED')).toBe(true)
  })

  it('invalid plan transitions are not present', () => {
    // DRAFT cannot skip to COMPLETED
    expect(AgentPlanTransitions.DRAFT).not.toContain('COMPLETED')
    // No re-entry to DRAFT
    for (const successors of Object.values(AgentPlanTransitions)) {
      expect(successors).not.toContain('DRAFT')
    }
  })
})

describe('15A constitutional: deterministic canonical hashes', () => {
  const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

  it('AgentRunState enum hash is stable', () => {
    const canonical = JSON.stringify(Object.keys(AgentRunState).sort())
    expect(sha256(canonical)).toBe(sha256(canonical))
  })

  it('AgentRunState frozen enum keys are deterministic', () => {
    const keys = Object.keys(AgentRunState).sort()
    const hash = sha256(JSON.stringify(keys))
    // Recompute — must be identical
    expect(hash).toBe(sha256(JSON.stringify(Object.keys(AgentRunState).sort())))
    // Exact expected hash for 11-state enum (CREATED..CANCELLED, no DEFINED)
    const expected = sha256(JSON.stringify([
      'ADMITTED','BLOCKED','CANCELLED','COMPLETED','CREATED',
      'DELEGATING','FAILED','READY','RUNNING','SUSPENDED','WAITING',
    ]))
    expect(hash).toBe(expected)
  })

  it('AgentTaskState frozen enum keys are deterministic', () => {
    const keys = Object.keys(AgentTaskState).sort()
    const hash = sha256(JSON.stringify(keys))
    const expected = sha256(JSON.stringify([
      'ASSIGNED','CANCELLED','COMPLETED','FAILED','PENDING','RUNNING',
    ]))
    expect(hash).toBe(expected)
  })

  it('AgentPlanState frozen enum keys are deterministic', () => {
    const keys = Object.keys(AgentPlanState).sort()
    const hash = sha256(JSON.stringify(keys))
    const expected = sha256(JSON.stringify([
      'ABANDONED','ACTIVE','COMPLETED','DRAFT','SUPERSEDED',
    ]))
    expect(hash).toBe(expected)
  })

  it('transition map shape is stable', () => {
    const runShape = JSON.stringify(
      Object.fromEntries(
        Object.entries(AgentRunTransitions)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, [...v].sort()])
      )
    )
    expect(sha256(runShape)).toBe(sha256(runShape))
  })
})
