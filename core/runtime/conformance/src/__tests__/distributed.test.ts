import { describe, it, expect } from 'vitest'
import { RuntimeValidator } from '../validator/runtime-validator.js'
import type { RuntimeScenario } from '@rohinik-org/compiler'
import {
  runSingleNodeClusterScenario,
  runNodeJoinScenario,
  runNodeLeaveScenario,
  runCapabilityDirectoryMatchScenario,
  runDistributedSchedulingLocalScenario,
  runDistributedSchedulingRemoteScenario,
  runRemoteExecutorLifecycleScenario,
  runReplicationRecordScenario,
  runClusterPolicyBlocksScenario,
  runRemoteMemoryBridgeScenario,
  runFailoverMarksDegradedScenario,
  runClusterJournalOrderingScenario,
} from '../scenarios/distributed.scenario.js'

const emptyFixture = {
  graphRevision: 1, workflowDescriptors: [], capabilityDescriptors: [],
  observations: [], memory: [], corpus: [], providers: [],
}

function makeScenario(id: string, name: string): RuntimeScenario {
  return {
    kind: 'RuntimeScenario', schemaVersion: '1.0', scenarioId: id, name,
    tags: ['DISTRIBUTED'], scenarioType: 'STATIC', initialState: emptyFixture,
    expectedOutcome: {}, createdAt: new Date().toISOString(),
  }
}

describe('Single-node cluster scenario', () => {
  it('node registers and is ONLINE', async () => {
    const validator = new RuntimeValidator()
    validator.register('single-node-cluster', runSingleNodeClusterScenario)
    const report = await validator.run(makeScenario('single-node-cluster', 'Single node cluster'))
    expect(report.status).toBe('PASSED')
  })
  it('nodeOnline is true', async () => {
    const result = await runSingleNodeClusterScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.nodeOnline).toBe(true)
  })
})

describe('Node join scenario', () => {
  it('NODE_JOINED journaled + member in cluster', async () => {
    const validator = new RuntimeValidator()
    validator.register('node-join', runNodeJoinScenario)
    const report = await validator.run(makeScenario('node-join', 'Node join'))
    expect(report.status).toBe('PASSED')
  })
  it('memberInCluster is true', async () => {
    const result = await runNodeJoinScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.memberInCluster).toBe(true)
  })
})

describe('Node leave scenario', () => {
  it('node marked OFFLINE + NODE_LEFT journaled', async () => {
    const validator = new RuntimeValidator()
    validator.register('node-leave', runNodeLeaveScenario)
    const report = await validator.run(makeScenario('node-leave', 'Node leave'))
    expect(report.status).toBe('PASSED')
  })
  it('memberRemovedFromCluster is true', async () => {
    const result = await runNodeLeaveScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.memberRemovedFromCluster).toBe(true)
  })
})

describe('Capability directory match scenario', () => {
  it('highest-scoring node selected', async () => {
    const validator = new RuntimeValidator()
    validator.register('capability-directory-match', runCapabilityDirectoryMatchScenario)
    const report = await validator.run(makeScenario('capability-directory-match', 'Capability directory match'))
    expect(report.status).toBe('PASSED')
  })
  it('strongSelected and weakRejected', async () => {
    const result = await runCapabilityDirectoryMatchScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.strongSelected).toBe(true)
    expect(result.weakRejected).toBe(true)
  })
})

describe('Distributed scheduling local scenario', () => {
  it('single-node cluster routes to local node', async () => {
    const validator = new RuntimeValidator()
    validator.register('distributed-scheduling-local', runDistributedSchedulingLocalScenario)
    const report = await validator.run(makeScenario('distributed-scheduling-local', 'Distributed scheduling local'))
    expect(report.status).toBe('PASSED')
  })
  it('routedToLocal is true', async () => {
    const result = await runDistributedSchedulingLocalScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.routedToLocal).toBe(true)
  })
})

describe('Distributed scheduling remote scenario', () => {
  it('two-node cluster routes to capable remote node', async () => {
    const validator = new RuntimeValidator()
    validator.register('distributed-scheduling-remote', runDistributedSchedulingRemoteScenario)
    const report = await validator.run(makeScenario('distributed-scheduling-remote', 'Distributed scheduling remote'))
    expect(report.status).toBe('PASSED')
  })
  it('routedToRemote is true', async () => {
    const result = await runDistributedSchedulingRemoteScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.routedToRemote).toBe(true)
  })
})

describe('Remote executor lifecycle scenario', () => {
  it('produces invocation + result + 3 journal events', async () => {
    const validator = new RuntimeValidator()
    validator.register('remote-executor-lifecycle', runRemoteExecutorLifecycleScenario)
    const report = await validator.run(makeScenario('remote-executor-lifecycle', 'Remote executor lifecycle'))
    expect(report.status).toBe('PASSED')
  })
  it('allThreeEventsJournaled is true', async () => {
    const result = await runRemoteExecutorLifecycleScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.allThreeEventsJournaled).toBe(true)
  })
})

describe('Replication record scenario', () => {
  it('MEMORY artifact produces ReplicationRecord', async () => {
    const validator = new RuntimeValidator()
    validator.register('replication-record', runReplicationRecordScenario)
    const report = await validator.run(makeScenario('replication-record', 'Replication record'))
    expect(report.status).toBe('PASSED')
  })
  it('replicationEventsJournaled is true', async () => {
    const result = await runReplicationRecordScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.replicationEventsJournaled).toBe(true)
  })
})

describe('Cluster policy blocks scenario', () => {
  it('allowReplication=false → POLICY_REJECTED in journal', async () => {
    const validator = new RuntimeValidator()
    validator.register('cluster-policy-blocks', runClusterPolicyBlocksScenario)
    const report = await validator.run(makeScenario('cluster-policy-blocks', 'Cluster policy blocks'))
    expect(report.status).toBe('PASSED')
  })
  it('replicationBlocked and remoteExecuteRejected', async () => {
    const result = await runClusterPolicyBlocksScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.replicationBlocked).toBe(true)
    expect(result.remoteExecuteRejected).toBe(true)
  })
})

describe('Remote memory bridge scenario', () => {
  it('query returns empty when replication not allowed', async () => {
    const validator = new RuntimeValidator()
    validator.register('remote-memory-bridge', runRemoteMemoryBridgeScenario)
    const report = await validator.run(makeScenario('remote-memory-bridge', 'Remote memory bridge'))
    expect(report.status).toBe('PASSED')
  })
  it('blockedWhenPolicyFalse is true', async () => {
    const result = await runRemoteMemoryBridgeScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.blockedWhenPolicyFalse).toBe(true)
  })
})

describe('Failover marks degraded scenario', () => {
  it('failed node → DEGRADED, other node unaffected', async () => {
    const validator = new RuntimeValidator()
    validator.register('failover-marks-degraded', runFailoverMarksDegradedScenario)
    const report = await validator.run(makeScenario('failover-marks-degraded', 'Failover marks degraded'))
    expect(report.status).toBe('PASSED')
  })
  it('n1Degraded and n2Unaffected', async () => {
    const result = await runFailoverMarksDegradedScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.n1Degraded).toBe(true)
    expect(result.n2Unaffected).toBe(true)
  })
})

describe('Cluster journal ordering scenario', () => {
  it('events appended in timestamp order', async () => {
    const validator = new RuntimeValidator()
    validator.register('cluster-journal-ordering', runClusterJournalOrderingScenario)
    const report = await validator.run(makeScenario('cluster-journal-ordering', 'Cluster journal ordering'))
    expect(report.status).toBe('PASSED')
  })
  it('orderedCorrectly is true', async () => {
    const result = await runClusterJournalOrderingScenario({ fixture: emptyFixture, loadedAt: new Date().toISOString() } as any, {} as any)
    expect(result.orderedCorrectly).toBe(true)
  })
})
