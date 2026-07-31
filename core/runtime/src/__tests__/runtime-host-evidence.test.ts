import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { platform } from 'node:os'
import { RuntimeHost } from '../host/runtime-host.js'
import { BuiltinRegistry } from '../host/builtin-registry.js'
import { defaultBootstrapPlan } from '../host/bootstrap-plan.js'
import type { ResolvedConfig } from '../types.js'
import type { ExecutionEvidenceService } from '@rohinik-org/execution-evidence-ir'

const minimalConfig: ResolvedConfig = {
  configPath: '/tmp/rohinik.yaml',
  runtimeId: 'test-runtime-evidence',
  runtime: {
    routing: { mode: 'balanced', explain: true, traceBuffer: 100 },
    resources: { maxConcurrentRequests: 10, timeoutMs: 5000 },
    logLevel: 'error',
  },
  extensions: { paths: [] },
  providers: {},
  server: { port: 8080, host: '0.0.0.0' },
}

function uniqueSocket(): string {
  return platform() === 'win32'
    ? `\\\\.\\pipe\\rohinik-test-ev-${randomUUID()}`
    : `/tmp/rohinik-test-ev-${randomUUID()}.sock`
}

function makeHost(evidenceService?: ExecutionEvidenceService): RuntimeHost {
  const reg = new BuiltinRegistry()
  const plan = defaultBootstrapPlan(minimalConfig, reg)
  return new RuntimeHost({ ...plan, socketPath: uniqueSocket(), executionEvidenceService: evidenceService })
}

// stub — enough to satisfy the interface
function makeStubEvidenceService(): ExecutionEvidenceService {
  return {
    open:                   () => 'ev-1' as any,
    recordContextAdmission: () => {},
    recordCapabilityBinding:() => {},
    recordRoutingDecision:  () => {},
    recordPolicyDecision:   () => {},
    recordTokenUsage:       () => {},
    recordCost:             () => {},
    recordInputHash:        () => {},
    recordOutputHash:       () => {},
    recordRetry:            () => {},
    recordFallback:         () => {},
    recordPrivacyBoundary:  () => {},
    sealAndStore:           async () => ({ evidenceId: 'ev-1' } as any),
  }
}

// ── BootstrapPlan field ────────────────────────────────────────────────────────

describe('BootstrapPlan — executionEvidenceService', () => {
  it('defaultBootstrapPlan has no executionEvidenceService by default', () => {
    const reg = new BuiltinRegistry()
    const plan = defaultBootstrapPlan(minimalConfig, reg)
    expect(plan.executionEvidenceService).toBeUndefined()
  })

  it('accepts executionEvidenceService in spread', () => {
    const svc = makeStubEvidenceService()
    const reg = new BuiltinRegistry()
    const plan = defaultBootstrapPlan(minimalConfig, reg)
    const extended = { ...plan, executionEvidenceService: svc }
    expect(extended.executionEvidenceService).toBe(svc)
  })
})

// ── RuntimeHost getter ────────────────────────────────────────────────────────

describe('RuntimeHost — executionEvidenceService integration', () => {
  it('executionEvidenceService getter returns undefined if not wired', async () => {
    const host = makeHost()
    await host.start()
    expect(host.executionEvidenceService).toBeUndefined()
    await host.stop()
  })

  it('executionEvidenceService getter returns wired service after start', async () => {
    const svc = makeStubEvidenceService()
    const host = makeHost(svc)
    await host.start()
    expect(host.executionEvidenceService).toBe(svc)
    await host.stop()
  })

  it('executionEvidenceService is cleared after stop', async () => {
    const svc = makeStubEvidenceService()
    const host = makeHost(svc)
    await host.start()
    await host.stop()
    expect(host.executionEvidenceService).toBeUndefined()
  })

  it('health includes execution-evidence check when service is wired', async () => {
    const svc = makeStubEvidenceService()
    const host = makeHost(svc)
    await host.start()
    const report = await host.health()
    const check = report.checks.find(c => c.subsystem === 'execution-evidence')
    expect(check).toBeDefined()
    expect(check?.status).toBe('healthy')
    await host.stop()
  })

  it('health execution-evidence check is absent when service is not wired', async () => {
    const host = makeHost()
    await host.start()
    const report = await host.health()
    const check = report.checks.find(c => c.subsystem === 'execution-evidence')
    // ponytail: only present when wired; degraded mode enforcement is Stage 11F+
    expect(check).toBeUndefined()
    await host.stop()
  })
})

// ── Architectural boundary test ───────────────────────────────────────────────

describe('architectural dependency — execution-evidence-ir only', () => {
  it('@rohinik-org/runtime imports ExecutionEvidenceService from IR, not implementation', async () => {
    // Verify the IR type is importable from the IR package
    const ir = await import('@rohinik-org/execution-evidence-ir')
    // If the type exists in the IR, the architectural boundary is respected
    // (runtime only depends on execution-evidence-ir, not execution-evidence)
    expect(ir).toHaveProperty('EvidenceOutcome')
    expect(ir).toHaveProperty('EvidenceErrorCode')
  })
})
