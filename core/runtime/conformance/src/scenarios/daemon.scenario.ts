import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { DaemonHost } from '@rohinik-org/daemon'
import { SocketRuntimeTransport } from '@rohinik-org/daemon'

function tmpDir() { return join(tmpdir(), `rhkd-val-${randomUUID()}`) }

export async function runDaemonLifecycleScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const dir = tmpDir()
  try {
    const host = new DaemonHost({ runtimeDir: dir })
    await host.start()
    const health = await host.healthCheck()
    const sessionId = health.sessionId
    await host.stop()
    const journal = host.getJournal().all()
    return {
      sessionId,
      journalStarted: journal.some(e => e.eventType === 'RUNTIME_STARTED'),
      journalStopped: journal.some(e => e.eventType === 'RUNTIME_STOPPED'),
      daemonStopped: true,
    }
  } finally {
    try { rmSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
}

export async function runIpcRoundtripScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const dir = tmpDir()
  try {
    const host = new DaemonHost({ runtimeDir: dir })
    const { socketPath } = await host.start()
    const transport = new SocketRuntimeTransport(socketPath)
    await transport.connect()
    const resp = await transport.send({ requestId: randomUUID(), type: 'STATUS', payload: {} })
    await transport.disconnect()
    await host.stop()
    return {
      ipcSuccess: resp.success,
      hasSessionId: typeof (resp.payload as { sessionId?: string })?.sessionId === 'string',
    }
  } finally {
    try { rmSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
}

export async function runExecuteViaDaemonScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const dir = tmpDir()
  try {
    const host = new DaemonHost({ runtimeDir: dir })
    const { socketPath } = await host.start()
    const transport = new SocketRuntimeTransport(socketPath)
    await transport.connect()
    const resp = await transport.send({ requestId: randomUUID(), type: 'EXECUTE', payload: { planId: 'p1' } })
    await transport.disconnect()
    await host.stop()
    return { executeDispatched: resp.success }
  } finally {
    try { rmSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
}

export async function runReflectionViaDaemonScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const dir = tmpDir()
  try {
    const host = new DaemonHost({ runtimeDir: dir })
    const { socketPath } = await host.start()
    const transport = new SocketRuntimeTransport(socketPath)
    await transport.connect()
    const resp = await transport.send({ requestId: randomUUID(), type: 'REFLECT', payload: {} })
    await transport.disconnect()
    await host.stop()
    return { reflectDispatched: resp.success }
  } finally {
    try { rmSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
}

export async function runGracefulShutdownScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const dir = tmpDir()
  try {
    const host = new DaemonHost({ runtimeDir: dir })
    const { socketPath } = await host.start()
    const transport = new SocketRuntimeTransport(socketPath)
    await transport.connect()
    const resp = await transport.send({ requestId: randomUUID(), type: 'SHUTDOWN', payload: {} })
    await transport.disconnect()
    // give shutdown a moment to complete
    await new Promise(r => setTimeout(r, 50))
    const journal = host.getJournal().all()
    return {
      shutdownAcknowledged: resp.success,
      journalHasStop: journal.some(e => e.eventType === 'RUNTIME_STOPPED'),
    }
  } finally {
    try { rmSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
}

export async function runRestartPreservesStateScenario(
  _loaded: LoadedFixture,
  _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const dir = tmpDir()
  try {
    const host = new DaemonHost({ runtimeDir: dir })
    await host.start()
    await host.dispatch({ requestId: randomUUID(), type: 'STATUS', payload: {} })
    const journalBefore = host.getJournal().all().length
    await host.stop()

    const host2 = new DaemonHost({ runtimeDir: dir })
    const { socketPath } = await host2.start()
    const transport = new SocketRuntimeTransport(socketPath)
    await transport.connect()
    const resp = await transport.send({ requestId: randomUUID(), type: 'STATUS', payload: {} })
    await transport.disconnect()
    await host2.stop()

    return {
      firstSessionJournalEntries: journalBefore,
      secondStartSuccess: resp.success,
    }
  } finally {
    try { rmSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
}
