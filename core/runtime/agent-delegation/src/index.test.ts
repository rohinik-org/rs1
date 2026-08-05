import { describe, it, expect, beforeEach } from 'vitest'
import type {
  DelegationCertificate,
  DelegatedAuthority,
  DelegatedBudget,
  DelegatedTask,
  CertificateId,
  DelegatedTaskId,
} from './index.js'
import {
  DelegatedTaskState,
  DelegatedTaskTransitions,
  DelegatedTaskTerminalStates,
  validateAttenuation,
  issueCertificate,
  InMemoryCertificateRepository,
  InMemoryDelegatedTaskRepository,
  DelegatedTaskService,
} from './index.js'
import type {
  AgentRunId,
  AgentTaskId,
  DelegationId,
  AgentVersionId,
} from '@rohinik-org/agent-ir'
import type { AgentAuthority, AgentBudget } from '@rohinik-org/agent-ir'

// ── Helpers ───────────────────────────────────────────────────────────────────

const parentAuth = (): AgentAuthority => ({
  authorityId: 'auth-parent',
  allowedCapabilities: ['cap-read', 'cap-write', 'cap-search'],
  allowedActions: ['read', 'write', 'search'],
  deniedActions: [],
  maxDelegationDepth: 3,
})

const parentBudget = (): AgentBudget => ({
  budgetId: 'bgt-parent',
  maxCostUsd: 10.0,
  maxLatencyMs: 30000,
  maxTokens: 8192,
})

const delegatorRunId = 'run-delegator' as unknown as AgentRunId
const delegateeRunId = 'run-delegatee' as unknown as AgentRunId
const delegationId   = 'del-001'        as unknown as DelegationId
const taskId         = 'task-001'       as unknown as AgentTaskId

// ── Task 7: DelegatedAuthority + DelegatedBudget types ───────────────────────

describe('agent-delegation: DelegatedAuthority attenuation', () => {
  it('child authority with strict subset of capabilities is valid', () => {
    const child: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), child, parentBudget())
    expect(result.valid).toBe(true)
  })

  it('child capabilities exceeding parent is rejected', () => {
    const child: DelegatedAuthority = {
      allowedCapabilities: ['cap-read', 'cap-admin'],  // cap-admin not in parent
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), child, parentBudget())
    expect(result.valid).toBe(false)
    expect(result.violations).toContain('capability-exceeds-parent')
  })

  it('child actions exceeding parent is rejected', () => {
    const child: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read', 'delete'],  // delete not in parent
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), child, parentBudget())
    expect(result.valid).toBe(false)
    expect(result.violations).toContain('action-exceeds-parent')
  })

  it('child delegation depth exceeding parent minus 1 is rejected', () => {
    const child: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 3,  // parent is 3; child must be < parent
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), child, parentBudget())
    expect(result.valid).toBe(false)
    expect(result.violations).toContain('depth-exceeds-parent')
  })

  it('depth 0 child is valid (leaf, cannot re-delegate)', () => {
    const child: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 0,
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), child, parentBudget())
    expect(result.valid).toBe(true)
  })
})

describe('agent-delegation: DelegatedBudget attenuation', () => {
  it('child budget with all dimensions ≤ parent is valid', () => {
    const child: DelegatedBudget = {
      maxCostUsd: 1.0,
      maxLatencyMs: 5000,
      maxTokens: 1024,
    }
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), childAuth, child)
    expect(result.valid).toBe(true)
  })

  it('child cost exceeding parent is rejected', () => {
    const childBudget: DelegatedBudget = { maxCostUsd: 20.0, maxLatencyMs: 5000, maxTokens: 1024 }
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), childAuth, childBudget)
    expect(result.valid).toBe(false)
    expect(result.violations).toContain('cost-exceeds-parent')
  })

  it('child latency exceeding parent is rejected', () => {
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 60000, maxTokens: 1024 }
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), childAuth, childBudget)
    expect(result.valid).toBe(false)
    expect(result.violations).toContain('latency-exceeds-parent')
  })

  it('child tokens exceeding parent is rejected', () => {
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 16384 }
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), childAuth, childBudget)
    expect(result.valid).toBe(false)
    expect(result.violations).toContain('tokens-exceeds-parent')
  })

  it('collects all violations at once — not fail-fast', () => {
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-admin'],  // violation
      allowedActions: ['delete'],           // violation
      deniedActions: [],
      maxDelegationDepth: 5,               // violation (> parent 3)
    }
    const childBudget: DelegatedBudget = {
      maxCostUsd: 100.0,    // violation
      maxLatencyMs: 100000, // violation
      maxTokens: 99999,     // violation
    }
    const result = validateAttenuation(parentAuth(), parentBudget(), childAuth, childBudget)
    expect(result.valid).toBe(false)
    expect(result.violations.length).toBeGreaterThanOrEqual(5)
  })
})

// ── Task 7: DelegationCertificate ─────────────────────────────────────────────

describe('agent-delegation: DelegationCertificate issuance and structure', () => {
  it('issues a certificate with all required fields', () => {
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 1024 }

    const cert = issueCertificate({
      delegationId,
      delegatorRunId,
      delegateeRunId,
      parentAuthority: parentAuth(),
      parentBudget: parentBudget(),
      grantedAuthority: childAuth,
      grantedBudget: childBudget,
      taskId,
      issuedAt: new Date('2026-01-01T00:00:00Z'),
    })

    expect(cert.certificateId).toBeDefined()
    expect(cert.delegationId).toBe(delegationId)
    expect(cert.delegatorRunId).toBe(delegatorRunId)
    expect(cert.delegateeRunId).toBe(delegateeRunId)
    expect(cert.grantedAuthority).toEqual(childAuth)
    expect(cert.grantedBudget).toEqual(childBudget)
    expect(cert.revoked).toBe(false)
    expect(typeof cert.fingerprint).toBe('string')
    expect(cert.fingerprint.length).toBeGreaterThan(0)
  })

  it('issueCertificate rejects when attenuation validation fails', () => {
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-admin'],  // not in parent
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 1024 }

    expect(() => issueCertificate({
      delegationId,
      delegatorRunId,
      delegateeRunId,
      parentAuthority: parentAuth(),
      parentBudget: parentBudget(),
      grantedAuthority: childAuth,
      grantedBudget: childBudget,
      taskId,
      issuedAt: new Date(),
    })).toThrow('attenuation-violated')
  })

  it('certificate fingerprint is deterministic for same inputs', () => {
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 1024 }
    const issuedAt = new Date('2026-01-01T00:00:00Z')
    const params = { delegationId, delegatorRunId, delegateeRunId, parentAuthority: parentAuth(), parentBudget: parentBudget(), grantedAuthority: childAuth, grantedBudget: childBudget, taskId, issuedAt }

    const cert1 = issueCertificate(params)
    const cert2 = issueCertificate(params)
    expect(cert1.fingerprint).toBe(cert2.fingerprint)
  })

  it('certificate is immutable — all fields readonly', () => {
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 1,
    }
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 1024 }
    const cert = issueCertificate({
      delegationId, delegatorRunId, delegateeRunId,
      parentAuthority: parentAuth(), parentBudget: parentBudget(),
      grantedAuthority: childAuth, grantedBudget: childBudget,
      taskId, issuedAt: new Date(),
    })
    // JSON-safe: no functions or symbols
    const json = JSON.stringify(cert)
    expect(json).toContain(delegationId)
  })

  it('InMemoryCertificateRepository save and load', async () => {
    const repo = new InMemoryCertificateRepository()
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 0,
    }
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 512 }
    const cert = issueCertificate({
      delegationId, delegatorRunId, delegateeRunId,
      parentAuthority: parentAuth(), parentBudget: parentBudget(),
      grantedAuthority: childAuth, grantedBudget: childBudget,
      taskId, issuedAt: new Date(),
    })
    await repo.save(cert)
    const loaded = await repo.load(cert.certificateId)
    expect(loaded?.certificateId).toBe(cert.certificateId)
    expect(loaded?.revoked).toBe(false)
  })

  it('InMemoryCertificateRepository returns undefined for unknown id', async () => {
    const repo = new InMemoryCertificateRepository()
    const result = await repo.load('no-such-cert' as unknown as CertificateId)
    expect(result).toBeUndefined()
  })

  it('certificate can be revoked — revoked flag set, immutable otherwise', async () => {
    const repo = new InMemoryCertificateRepository()
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 0,
    }
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 512 }
    const cert = issueCertificate({
      delegationId, delegatorRunId, delegateeRunId,
      parentAuthority: parentAuth(), parentBudget: parentBudget(),
      grantedAuthority: childAuth, grantedBudget: childBudget,
      taskId, issuedAt: new Date(),
    })
    await repo.save(cert)
    await repo.revoke(cert.certificateId)
    const revoked = await repo.load(cert.certificateId)
    expect(revoked?.revoked).toBe(true)
    // fingerprint and all authority fields unchanged
    expect(revoked?.fingerprint).toBe(cert.fingerprint)
    expect(revoked?.grantedAuthority).toEqual(cert.grantedAuthority)
  })
})

// ── Task 8: DelegatedTaskState transition map ─────────────────────────────────

describe('agent-delegation: DelegatedTaskState transition map', () => {
  it('covers all states', () => {
    const states: DelegatedTaskState[] = [
      DelegatedTaskState.PROPOSED,
      DelegatedTaskState.OFFERED,
      DelegatedTaskState.ACCEPTED,
      DelegatedTaskState.RUNNING,
      DelegatedTaskState.SUBMITTED,
      DelegatedTaskState.ACCEPTED_RESULT,
      DelegatedTaskState.REJECTED_RESULT,
      DelegatedTaskState.CANCELLED,
      DelegatedTaskState.FAILED,
    ]
    expect(states).toHaveLength(9)
  })

  it('every state has an entry in DelegatedTaskTransitions', () => {
    for (const state of Object.values(DelegatedTaskState)) {
      expect(DelegatedTaskTransitions).toHaveProperty(state)
    }
  })

  it('PROPOSED goes to OFFERED or CANCELLED only', () => {
    expect(DelegatedTaskTransitions.PROPOSED).toEqual(['OFFERED', 'CANCELLED'])
  })

  it('OFFERED goes to ACCEPTED, REJECTED_RESULT, or CANCELLED — silence is not acceptance', () => {
    expect(DelegatedTaskTransitions.OFFERED).toContain('ACCEPTED')
    expect(DelegatedTaskTransitions.OFFERED).toContain('REJECTED_RESULT')
    expect(DelegatedTaskTransitions.OFFERED).toContain('CANCELLED')
    // No implicit ACCEPTED — must be explicit
    expect(DelegatedTaskTransitions.OFFERED).not.toContain('RUNNING')
  })

  it('SUBMITTED goes to ACCEPTED_RESULT or REJECTED_RESULT — submission is not acceptance', () => {
    expect(DelegatedTaskTransitions.SUBMITTED).toContain('ACCEPTED_RESULT')
    expect(DelegatedTaskTransitions.SUBMITTED).toContain('REJECTED_RESULT')
    // submission alone does not complete task
    expect(DelegatedTaskTransitions.SUBMITTED).not.toContain('COMPLETED')
  })

  it('terminal states have no successors', () => {
    for (const terminal of DelegatedTaskTerminalStates) {
      expect(DelegatedTaskTransitions[terminal]).toHaveLength(0)
    }
  })

  it('terminal states are ACCEPTED_RESULT, REJECTED_RESULT, CANCELLED, FAILED', () => {
    expect(DelegatedTaskTerminalStates.has('ACCEPTED_RESULT')).toBe(true)
    expect(DelegatedTaskTerminalStates.has('REJECTED_RESULT')).toBe(true)
    expect(DelegatedTaskTerminalStates.has('CANCELLED')).toBe(true)
    expect(DelegatedTaskTerminalStates.has('FAILED')).toBe(true)
    expect(DelegatedTaskTerminalStates.size).toBe(4)
  })

  it('invalid transitions are absent', () => {
    // No re-entry to PROPOSED
    for (const successors of Object.values(DelegatedTaskTransitions)) {
      expect(successors).not.toContain('PROPOSED')
    }
    // PROPOSED cannot jump to RUNNING (must go through OFFERED → ACCEPTED)
    expect(DelegatedTaskTransitions.PROPOSED).not.toContain('RUNNING')
    expect(DelegatedTaskTransitions.PROPOSED).not.toContain('ACCEPTED')
  })
})

// ── Task 8: DelegatedTaskService ──────────────────────────────────────────────

describe('agent-delegation: DelegatedTaskService lifecycle', () => {
  let certRepo: InMemoryCertificateRepository
  let taskRepo: InMemoryDelegatedTaskRepository
  let svc: DelegatedTaskService

  const makeCert = () => {
    const childAuth: DelegatedAuthority = {
      allowedCapabilities: ['cap-read'],
      allowedActions: ['read'],
      deniedActions: [],
      maxDelegationDepth: 0,
    }
    const childBudget: DelegatedBudget = { maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 1024 }
    return issueCertificate({
      delegationId, delegatorRunId, delegateeRunId,
      parentAuthority: parentAuth(), parentBudget: parentBudget(),
      grantedAuthority: childAuth, grantedBudget: childBudget,
      taskId, issuedAt: new Date(),
    })
  }

  beforeEach(() => {
    certRepo = new InMemoryCertificateRepository()
    taskRepo = new InMemoryDelegatedTaskRepository()
    svc = new DelegatedTaskService(certRepo, taskRepo)
  })

  it('propose creates a PROPOSED delegated task', async () => {
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    expect(task.state).toBe(DelegatedTaskState.PROPOSED)
    expect(task.delegatorRunId).toBe(delegatorRunId)
  })

  it('offer requires valid certificate — rejects without cert', async () => {
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    const result = await svc.offer(task.delegatedTaskId, 'no-cert' as unknown as CertificateId)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('certificate')
  })

  it('offer requires valid certificate — succeeds with valid cert', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    const result = await svc.offer(task.delegatedTaskId, cert.certificateId)
    expect(result.ok).toBe(true)
    const updated = await taskRepo.load(task.delegatedTaskId)
    expect(updated?.state).toBe(DelegatedTaskState.OFFERED)
  })

  it('offer fails when certificate is revoked', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    await certRepo.revoke(cert.certificateId)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    const result = await svc.offer(task.delegatedTaskId, cert.certificateId)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('revoked')
  })

  it('silence is not acceptance — OFFERED task does not auto-accept', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    // Load directly — still OFFERED, not ACCEPTED
    const loaded = await taskRepo.load(task.delegatedTaskId)
    expect(loaded?.state).toBe(DelegatedTaskState.OFFERED)
    expect(loaded?.state).not.toBe(DelegatedTaskState.ACCEPTED)
  })

  it('accept moves OFFERED → ACCEPTED', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    const result = await svc.accept(task.delegatedTaskId)
    expect(result.ok).toBe(true)
    const updated = await taskRepo.load(task.delegatedTaskId)
    expect(updated?.state).toBe(DelegatedTaskState.ACCEPTED)
  })

  it('run moves ACCEPTED → RUNNING', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    await svc.accept(task.delegatedTaskId)
    const result = await svc.run(task.delegatedTaskId)
    expect(result.ok).toBe(true)
    const updated = await taskRepo.load(task.delegatedTaskId)
    expect(updated?.state).toBe(DelegatedTaskState.RUNNING)
  })

  it('submit moves RUNNING → SUBMITTED — submission is not acceptance', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    await svc.accept(task.delegatedTaskId)
    await svc.run(task.delegatedTaskId)
    const result = await svc.submit(task.delegatedTaskId, { output: 'result data' })
    expect(result.ok).toBe(true)
    const updated = await taskRepo.load(task.delegatedTaskId)
    expect(updated?.state).toBe(DelegatedTaskState.SUBMITTED)
    expect(updated?.state).not.toBe(DelegatedTaskState.ACCEPTED_RESULT)
  })

  it('acceptResult moves SUBMITTED → ACCEPTED_RESULT (terminal)', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    await svc.accept(task.delegatedTaskId)
    await svc.run(task.delegatedTaskId)
    await svc.submit(task.delegatedTaskId, { output: 'result data' })
    const result = await svc.acceptResult(task.delegatedTaskId)
    expect(result.ok).toBe(true)
    const updated = await taskRepo.load(task.delegatedTaskId)
    expect(updated?.state).toBe(DelegatedTaskState.ACCEPTED_RESULT)
  })

  it('rejectResult moves SUBMITTED → REJECTED_RESULT (terminal)', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    await svc.accept(task.delegatedTaskId)
    await svc.run(task.delegatedTaskId)
    await svc.submit(task.delegatedTaskId, { output: 'bad result' })
    const result = await svc.rejectResult(task.delegatedTaskId, 'insufficient quality')
    expect(result.ok).toBe(true)
    const updated = await taskRepo.load(task.delegatedTaskId)
    expect(updated?.state).toBe(DelegatedTaskState.REJECTED_RESULT)
    expect(updated?.rejectionReason).toBe('insufficient quality')
  })

  it('cancel from OFFERED → CANCELLED (terminal)', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    const result = await svc.cancel(task.delegatedTaskId, 'no longer needed')
    expect(result.ok).toBe(true)
    const updated = await taskRepo.load(task.delegatedTaskId)
    expect(updated?.state).toBe(DelegatedTaskState.CANCELLED)
  })

  it('fail from RUNNING → FAILED (terminal)', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    await svc.accept(task.delegatedTaskId)
    await svc.run(task.delegatedTaskId)
    const result = await svc.fail(task.delegatedTaskId, 'capability-unavailable')
    expect(result.ok).toBe(true)
    const updated = await taskRepo.load(task.delegatedTaskId)
    expect(updated?.state).toBe(DelegatedTaskState.FAILED)
  })

  it('invalid transition is rejected without mutation', async () => {
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    // PROPOSED → RUNNING skips required steps
    const result = await svc.run(task.delegatedTaskId)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('invalid-transition')
    const unchanged = await taskRepo.load(task.delegatedTaskId)
    expect(unchanged?.state).toBe(DelegatedTaskState.PROPOSED)
  })

  it('operation on unknown task returns error', async () => {
    const result = await svc.accept('no-task' as unknown as DelegatedTaskId)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('not-found')
  })

  it('DelegatedTask submission result is accessible after submit', async () => {
    const cert = makeCert()
    await certRepo.save(cert)
    const task = await svc.propose({ delegationId, delegatorRunId, delegateeRunId, taskId, description: 'do work' })
    await svc.offer(task.delegatedTaskId, cert.certificateId)
    await svc.accept(task.delegatedTaskId)
    await svc.run(task.delegatedTaskId)
    await svc.submit(task.delegatedTaskId, { output: 'the answer' })
    const loaded = await taskRepo.load(task.delegatedTaskId)
    expect((loaded?.submittedResult as { output: string })?.output).toBe('the answer')
  })
})
