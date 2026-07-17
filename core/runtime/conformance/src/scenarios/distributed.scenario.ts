import type { LoadedFixture } from '../fixture/fixture-loader.js'
import type { ScenarioExpectation } from '@rohinik-org/compiler'
import { DEFAULT_CLUSTER_POLICY } from '@rohinik-org/compiler'
import type { NodeDescriptor, NodeCapabilityProfile } from '@rohinik-org/compiler'
import {
  NodeRegistry, NodeDiscovery, CapabilityDirectory,
  DistributedScheduler, RemoteExecutor, ReplicationManager,
  RemoteMemoryBridge, ClusterCoordinator, ClusterPolicyEngine,
  ClusterJournal, NullClusterStore,
} from '@rohinik-org/distributed'

function makeNode(id: string, status: NodeDescriptor['status'] = 'ONLINE', region = 'us-east'): NodeDescriptor {
  return { nodeId: id, version: '1.0', hostname: `${id}.local`, region, capabilityProfileId: `${id}-p`, status, joinedAt: new Date().toISOString() }
}
function makeProfile(id: string, caps: string[] = []): NodeCapabilityProfile {
  return { profileId: `${id}-p`, cpuCores: 4, memoryGb: 16, gpuAvailable: false, installedCapabilities: caps, installedProviders: [], networkBandwidthMbps: 1000, latencyProfileMs: 10, costWeight: 0.1 }
}

export async function runSingleNodeClusterScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const reg = new NodeRegistry()
  const node = makeNode('n1')
  reg.register(node, makeProfile('n1'))
  const disc = new NodeDiscovery(reg)
  disc.join(node, makeProfile('n1'))
  const online = disc.discover()
  return {
    nodeRegistered: reg.get('n1')?.nodeId === 'n1',
    nodeOnline: online.some(n => n.nodeId === 'n1'),
    statusOnline: reg.get('n1')?.status === 'ONLINE',
  }
}

export async function runNodeJoinScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const reg = new NodeRegistry()
  const journal = new ClusterJournal()
  const coord = new ClusterCoordinator(reg, journal)
  coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
  return {
    nodeRegistered: reg.get('n1') !== undefined,
    journalHasNodeJoined: journal.getByEventType('NODE_JOINED').length > 0,
    memberInCluster: coord.getCluster('c1').members.includes('n1'),
  }
}

export async function runNodeLeaveScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const reg = new NodeRegistry()
  const journal = new ClusterJournal()
  const coord = new ClusterCoordinator(reg, journal)
  coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
  coord.leave('n1', 'c1')
  return {
    nodeOffline: reg.get('n1')?.status === 'OFFLINE',
    journalHasNodeLeft: journal.getByEventType('NODE_LEFT').length > 0,
    memberRemovedFromCluster: !coord.getCluster('c1').members.includes('n1'),
  }
}

export async function runCapabilityDirectoryMatchScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const reg = new NodeRegistry()
  const strong = makeNode('strong'); const weak = makeNode('weak')
  reg.register(strong, makeProfile('strong', ['ts', 'test']))
  reg.register(weak, makeProfile('weak', ['ts']))
  const dir = new CapabilityDirectory(reg)
  const decision = dir.matchForTask(['ts', 'test'], [strong, weak])
  return {
    strongSelected: decision.selectedNodeId === 'strong',
    weakRejected: decision.rejectedNodeIds.includes('weak'),
    scoresPresent: Object.keys(decision.scores).length === 2,
  }
}

export async function runDistributedSchedulingLocalScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const reg = new NodeRegistry()
  const node = makeNode('local-node')
  reg.register(node, makeProfile('local-node', ['ts']))
  const sched = new DistributedScheduler('local-node', reg)
  const tasks = sched.schedule({ planId: 'p1', requiredCapabilities: ['ts'] }, [node], DEFAULT_CLUSTER_POLICY)
  return {
    taskProduced: tasks.length === 1,
    routedToLocal: tasks[0]?.targetNodeId === 'local-node',
    planIdPreserved: tasks[0]?.workflowPlanId === 'p1',
  }
}

export async function runDistributedSchedulingRemoteScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const reg = new NodeRegistry()
  const local = makeNode('local-node'); const remote = makeNode('remote-node')
  reg.register(local, makeProfile('local-node', []))
  reg.register(remote, makeProfile('remote-node', ['gpu']))
  const sched = new DistributedScheduler('local-node', reg)
  const tasks = sched.schedule({ planId: 'p2', requiredCapabilities: ['gpu'] }, [local, remote], DEFAULT_CLUSTER_POLICY)
  return {
    taskProduced: tasks.length === 1,
    routedToRemote: tasks[0]?.targetNodeId === 'remote-node',
    routingDecisionPresent: (tasks[0]?.routingDecision?.length ?? 0) > 0,
  }
}

export async function runRemoteExecutorLifecycleScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const journal = new ClusterJournal()
  const exec = new RemoteExecutor('source-1', 'c1', journal)
  const task = { taskId: 't1', workflowPlanId: 'wp-1', targetNodeId: 'target-1', workflowFragment: {}, routingDecision: 'test', scheduledAt: new Date().toISOString() }
  const successTransport = { send: async () => ({ requestId: 'r', success: true, payload: {} }) }
  const { invocation, result, record } = await exec.execute(task, successTransport)
  const eventTypes = journal.getAll().map(e => e.eventType)
  return {
    invocationProduced: invocation.invocationId.length > 0,
    resultProduced: result.outcome === 'SUCCESS',
    recordProduced: record.invocationId === invocation.invocationId,
    allThreeEventsJournaled: eventTypes.includes('REMOTE_INVOCATION_CREATED') && eventTypes.includes('REMOTE_DISPATCHED') && eventTypes.includes('REMOTE_COMPLETED'),
  }
}

export async function runReplicationRecordScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const journal = new ClusterJournal()
  const mgr = new ReplicationManager('source-1', journal)
  const record = mgr.replicate('MEMORY', 'mem-artifact-1', ['node-2', 'node-3'], DEFAULT_CLUSTER_POLICY)
  return {
    recordProduced: record !== null,
    artifactTypeCorrect: record?.artifactType === 'MEMORY',
    sourceCorrect: record?.sourceNodeId === 'source-1',
    replicationEventsJournaled: journal.getByEventType('REPLICATION_STARTED').length > 0 && journal.getByEventType('REPLICATION_COMPLETED').length > 0,
  }
}

export async function runClusterPolicyBlocksScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const journal = new ClusterJournal()
  const mgr = new ReplicationManager('source-1', journal)
  const record = mgr.replicate('MEMORY', 'mem-1', ['n2'], { ...DEFAULT_CLUSTER_POLICY, allowReplication: false })
  const policyEngine = new ClusterPolicyEngine()
  const decision = policyEngine.evaluate('REMOTE_EXECUTE', { ...DEFAULT_CLUSTER_POLICY, allowRemoteExecution: false })
  return {
    replicationBlocked: record === null,
    policyRejectedInJournal: journal.getByEventType('POLICY_REJECTED').length > 0,
    remoteExecuteRejected: decision === 'REJECTED',
  }
}

export async function runRemoteMemoryBridgeScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const bridge = new RemoteMemoryBridge()
  bridge.write({ entryId: 'e1', nodeId: 'n1', scope: 'CLUSTER_GLOBAL', key: 'shared', value: 'data' })
  const allowed = bridge.query('n1', 'CLUSTER_GLOBAL', DEFAULT_CLUSTER_POLICY)
  const blocked = bridge.query('n1', 'CLUSTER_GLOBAL', { ...DEFAULT_CLUSTER_POLICY, allowReplication: false })
  return {
    queryReturnsEntries: allowed.length === 1,
    blockedWhenPolicyFalse: blocked.length === 0,
  }
}

export async function runFailoverMarksDegradedScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const reg = new NodeRegistry()
  const journal = new ClusterJournal()
  const coord = new ClusterCoordinator(reg, journal)
  coord.join(makeNode('n1'), makeProfile('n1'), 'c1')
  coord.join(makeNode('n2'), makeProfile('n2'), 'c1')
  coord.failover('n1', 'c1')
  return {
    n1Degraded: reg.get('n1')?.status === 'DEGRADED',
    n2Unaffected: reg.get('n2')?.status === 'ONLINE',
    failoverJournaled: journal.getByEventType('FAILOVER').length === 1,
  }
}

export async function runClusterJournalOrderingScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const journal = new ClusterJournal()
  journal.append({ entryId: 'e1', clusterId: 'c1', eventType: 'NODE_JOINED', payload: {}, timestamp: '2026-01-01T00:00:01Z' })
  journal.append({ entryId: 'e2', clusterId: 'c1', eventType: 'REMOTE_DISPATCHED', payload: {}, timestamp: '2026-01-01T00:00:02Z' })
  journal.append({ entryId: 'e3', clusterId: 'c1', eventType: 'REMOTE_COMPLETED', payload: {}, timestamp: '2026-01-01T00:00:03Z' })
  const entries = journal.getAll()
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return {
    threeEntries: entries.length === 3,
    orderedCorrectly: JSON.stringify(entries.map(e => e.entryId)) === JSON.stringify(sorted.map(e => e.entryId)),
    getByClusterWorks: journal.getByCluster('c1').length === 3,
  }
}

export async function runNullClusterStoreScenario(
  _loaded: LoadedFixture, _expectation: ScenarioExpectation,
): Promise<Record<string, unknown>> {
  const store = new NullClusterStore()
  const cluster = { clusterId: 'c1', members: ['n1', 'n2'], leaderPolicy: 'NONE' as const, createdAt: new Date().toISOString() }
  await store.save(cluster)
  const found = await store.get('c1')
  const all = await store.list()
  const results = await store.search({ clusterId: 'c1' })
  return {
    saveAndGet: found?.clusterId === 'c1',
    listReturnsOne: all.length === 1,
    searchWorks: results.length === 1,
  }
}
