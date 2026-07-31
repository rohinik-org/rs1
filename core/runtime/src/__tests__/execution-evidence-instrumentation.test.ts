import { describe, it, expect } from 'vitest'
import { CapabilityExecutor } from '../execution/capability-executor.js'
import { ExecutionDispatcher } from '../execution/execution-dispatcher.js'
import { DriverRegistry } from '../kernel/driver-registry.js'
import { CapabilityDriverRegistry } from '../kernel/capability-driver-registry.js'
import type {
  DriverBinding,
  ExecutionDriver,
  DriverDescriptor,
  ExecutionContext,
} from '@rohinik-org/capability-manifest'
import type { ExecutionEvidenceService } from '@rohinik-org/execution-evidence-ir'
import {
  intelligentExecutionId,
  executionSessionId,
  EvidenceOutcome,
} from '@rohinik-org/execution-evidence-ir'

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    requestId: 'req-1',
    executionId: 'exec-1',
    sessionId: 'sess-1',
    workspaceId: 'ws-1',
    permissions: [],
    ...overrides,
  }
}

function makeDescriptor(id: string): DriverDescriptor {
  return {
    id, version: '0.1.0', apiVersion: 1, priority: 10, tags: [],
    capabilities: { supportsStreaming: false, supportsCancellation: false, supportsProgress: false, supportsHealth: true, offline: true, sandboxed: false, trusted: true },
  }
}

function makeSuccessDriver(id: string, result: string): DriverBinding {
  const descriptor = makeDescriptor(id)
  const driver: ExecutionDriver = {
    descriptor,
    async *execute() {
      yield { type: 'RESULT' as const, payload: result }
    },
    async health() { return { status: 'healthy' as const, checkedAt: new Date() } },
    async shutdown() {},
  }
  return { driver, descriptor }
}

function makeFailDriver(id: string, msg: string): DriverBinding {
  const descriptor = makeDescriptor(id)
  const driver: ExecutionDriver = {
    descriptor,
    async *execute() {
      yield { type: 'ERROR' as const, payload: { code: 'EXECUTION_FAILED', message: msg, retryable: false } }
    },
    async health() { return { status: 'healthy' as const, checkedAt: new Date() } },
    async shutdown() {},
  }
  return { driver, descriptor }
}

function makeDispatcher(binding: DriverBinding, capabilityId: string): ExecutionDispatcher {
  const reg = new DriverRegistry()
  const cap = new CapabilityDriverRegistry()
  reg.register(binding)
  cap.registerDriverRef(capabilityId, binding.descriptor.id)
  return new ExecutionDispatcher(reg, cap)
}

function makeStubEvidence() {
  const calls: string[] = []
  let seq = 0
  const svc: ExecutionEvidenceService = {
    open: () => { calls.push('open'); return `ev-${++seq}` as any },
    recordContextAdmission: () => calls.push('recordContextAdmission'),
    recordCapabilityBinding: () => calls.push('recordCapabilityBinding'),
    recordRoutingDecision: () => calls.push('recordRoutingDecision'),
    recordPolicyDecision: () => calls.push('recordPolicyDecision'),
    recordTokenUsage: () => calls.push('recordTokenUsage'),
    recordCost: () => calls.push('recordCost'),
    recordInputHash: () => calls.push('recordInputHash'),
    recordOutputHash: () => calls.push('recordOutputHash'),
    recordRetry: () => calls.push('recordRetry'),
    recordFallback: () => calls.push('recordFallback'),
    recordPrivacyBoundary: () => calls.push('recordPrivacyBoundary'),
    sealAndStore: async (_id, outcome) => {
      calls.push(`seal:${outcome}`)
      return { evidenceId: 'ev-1' } as any
    },
  }
  return { svc, calls }
}

// ── uninstrumented baseline ───────────────────────────────────────────────────

describe('CapabilityExecutor — uninstrumented (no evidence service)', () => {
  it('execute returns result without evidence service', async () => {
    const binding = makeSuccessDriver('d1', 'hello')
    const dispatcher = makeDispatcher(binding, 'cap:test')
    const executor = new CapabilityExecutor(dispatcher)
    const result = await executor.execute('cap:test', {}, makeContext())
    expect(result.value).toBe('hello')
  })

  it('execute throws on driver error without evidence service', async () => {
    const binding = makeFailDriver('d1', 'driver failed')
    const dispatcher = makeDispatcher(binding, 'cap:fail')
    const executor = new CapabilityExecutor(dispatcher)
    await expect(executor.execute('cap:fail', {}, makeContext())).rejects.toMatchObject({ code: 'EXECUTION_FAILED' })
  })
})

// ── instrumented execution ────────────────────────────────────────────────────

describe('CapabilityExecutor — instrumented with ExecutionEvidenceService', () => {
  it('opens evidence before dispatch', async () => {
    const binding = makeSuccessDriver('d1', 'hello')
    const dispatcher = makeDispatcher(binding, 'cap:test')
    const { svc, calls } = makeStubEvidence()
    const executor = new CapabilityExecutor(dispatcher, svc)
    await executor.execute(
      'cap:test', {},
      makeContext({ executionId: intelligentExecutionId('exec-1'), sessionId: executionSessionId('sess-1') } as any),
    )
    expect(calls[0]).toBe('open')
  })

  it('seals with SUCCESS on normal completion', async () => {
    const binding = makeSuccessDriver('d1', 'hello')
    const dispatcher = makeDispatcher(binding, 'cap:test')
    const { svc, calls } = makeStubEvidence()
    const executor = new CapabilityExecutor(dispatcher, svc)
    await executor.execute('cap:test', {}, makeContext())
    expect(calls).toContain(`seal:${EvidenceOutcome.SUCCESS}`)
  })

  it('seals with FAILURE on driver error and re-throws', async () => {
    const binding = makeFailDriver('d1', 'oops')
    const dispatcher = makeDispatcher(binding, 'cap:fail')
    const { svc, calls } = makeStubEvidence()
    const executor = new CapabilityExecutor(dispatcher, svc)
    await expect(executor.execute('cap:fail', {}, makeContext())).rejects.toMatchObject({ code: 'EXECUTION_FAILED' })
    expect(calls).toContain(`seal:${EvidenceOutcome.FAILURE}`)
  })

  it('result is not returned until evidence is sealed (fail-closed)', async () => {
    const binding = makeSuccessDriver('d1', 'hello')
    const dispatcher = makeDispatcher(binding, 'cap:test')
    const sealOrder: string[] = []
    const svc: ExecutionEvidenceService = {
      open: () => 'ev-1' as any,
      recordContextAdmission: () => {},
      recordCapabilityBinding: () => {},
      recordRoutingDecision: () => {},
      recordPolicyDecision: () => {},
      recordTokenUsage: () => {},
      recordCost: () => {},
      recordInputHash: () => {},
      recordOutputHash: () => {},
      recordRetry: () => {},
      recordFallback: () => {},
      recordPrivacyBoundary: () => {},
      sealAndStore: async (_id, _outcome) => {
        sealOrder.push('sealed')
        return { evidenceId: 'ev-1' } as any
      },
    }
    const executor = new CapabilityExecutor(dispatcher, svc)
    const result = await executor.execute('cap:test', {}, makeContext())
    // seal happens before value is returned
    expect(sealOrder).toContain('sealed')
    expect(result.value).toBe('hello')
  })

  it('dispatcher rejection still produces FAILURE evidence', async () => {
    const dispatcher = {
      async *dispatch() {
        throw new Error('dispatch failed')
      },
    } as unknown as ExecutionDispatcher
    const { svc, calls } = makeStubEvidence()
    const executor = new CapabilityExecutor(dispatcher, svc)
    await expect(executor.execute('cap:test', {}, makeContext())).rejects.toThrow('dispatch failed')
    expect(calls).toContain(`seal:${EvidenceOutcome.FAILURE}`)
  })
})
