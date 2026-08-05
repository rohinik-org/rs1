import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'
import {
  runDaemonLifecycleScenario,
  runIpcRoundtripScenario,
  runExecuteViaDaemonScenario,
  runReflectionViaDaemonScenario,
  runGracefulShutdownScenario,
  runRestartPreservesStateScenario,
} from '../scenarios/daemon.scenario.js'

const emptyFixture = {
  graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [],
  observations: [], memory: [], corpus: [], providers: [],
}

function makeScenario(id: string, name: string): RuntimeScenario {
  return {
    kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: id, name,
    tags: ['ORCHESTRATION'], scenarioType: 'STATIC', initialState: emptyFixture,
    expectedOutcome: {}, createdAt: new Date().toISOString(),
  }
}

describe('Daemon lifecycle scenario', () => {
  it('DaemonHost start → health → stop → STOPPED', async () => {
    const validator = new RuntimeValidator()
    validator.register('daemon-lifecycle', runDaemonLifecycleScenario)
    const report = await validator.run(makeScenario('daemon-lifecycle', 'Daemon lifecycle'))
    expect(report.status).toBe('PASSED')
  })

  it('journals RUNTIME_STARTED and RUNTIME_STOPPED', async () => {
    const result = await runDaemonLifecycleScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.journalStarted).toBe(true)
    expect(result.journalStopped).toBe(true)
  })
})

describe('IPC round-trip scenario', () => {
  it('SocketRuntimeTransport → DaemonHost STATUS round-trip', async () => {
    const validator = new RuntimeValidator()
    validator.register('ipc-roundtrip', runIpcRoundtripScenario)
    const report = await validator.run(makeScenario('ipc-roundtrip', 'IPC round-trip'))
    expect(report.status).toBe('PASSED')
  })

  it('IPC response success:true', async () => {
    const result = await runIpcRoundtripScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.ipcSuccess).toBe(true)
  })
})

describe('Execute via daemon scenario', () => {
  it('EXECUTE command dispatched successfully via IPC', async () => {
    const validator = new RuntimeValidator()
    validator.register('execute-via-daemon', runExecuteViaDaemonScenario)
    const report = await validator.run(makeScenario('execute-via-daemon', 'Execute via daemon'))
    expect(report.status).toBe('PASSED')
  })

  it('execute dispatch returns success:true', async () => {
    const result = await runExecuteViaDaemonScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.executeDispatched).toBe(true)
  })
})

describe('Reflection via daemon scenario', () => {
  it('REFLECT command dispatched successfully via IPC', async () => {
    const validator = new RuntimeValidator()
    validator.register('reflection-via-daemon', runReflectionViaDaemonScenario)
    const report = await validator.run(makeScenario('reflection-via-daemon', 'Reflection via daemon'))
    expect(report.status).toBe('PASSED')
  })

  it('reflect dispatch returns success:true', async () => {
    const result = await runReflectionViaDaemonScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.reflectDispatched).toBe(true)
  })
})

describe('Graceful shutdown scenario', () => {
  it('SHUTDOWN command acknowledged and daemon stops gracefully', async () => {
    const validator = new RuntimeValidator()
    validator.register('graceful-shutdown', runGracefulShutdownScenario)
    const report = await validator.run(makeScenario('graceful-shutdown', 'Graceful shutdown'))
    expect(report.status).toBe('PASSED')
  })

  it('SHUTDOWN response success:true', async () => {
    const result = await runGracefulShutdownScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.shutdownAcknowledged).toBe(true)
  })
})

describe('Restart preserves state scenario', () => {
  it('restart: second host STATUS returns success after first host stops', async () => {
    const validator = new RuntimeValidator()
    validator.register('restart-preserves-state', runRestartPreservesStateScenario)
    const report = await validator.run(makeScenario('restart-preserves-state', 'Restart preserves state'))
    expect(report.status).toBe('PASSED')
  })

  it('second session starts clean and responds to STATUS', async () => {
    const result = await runRestartPreservesStateScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.secondStartSuccess).toBe(true)
  })
})
