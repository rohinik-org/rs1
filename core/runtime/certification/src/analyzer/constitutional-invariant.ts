export interface InvariantVerificationResult {
  readonly invariantId: string
  readonly passed: boolean
  readonly message?: string
}

export interface ConstitutionalInvariant {
  readonly invariantId: string
  readonly title: string
  readonly description: string
  verify(result: Record<string, unknown>): InvariantVerificationResult
}

function inv(
  invariantId: string,
  title: string,
  description: string,
  check: (r: Record<string, unknown>) => boolean,
  failMsg: string,
): ConstitutionalInvariant {
  return {
    invariantId, title, description,
    verify(result) {
      const passed = check(result)
      return passed
        ? { invariantId, passed: true as const }
        : { invariantId, passed: false as const, message: failMsg }
    },
  }
}

const BUILT_INS: readonly ConstitutionalInvariant[] = [
  inv('PLAN-001', 'Planning Separation',
    'WorkflowPlan produced; never contains raw execution results',
    r => r['workflowPlanProduced'] === true,
    'workflowPlanProduced is not true'),
  inv('PLAN-002', 'WorkflowPlan Immutability',
    'Plan steps are readonly; no mutation after creation',
    r => r['planImmutable'] === true,
    'planImmutable is not true'),
  inv('EXEC-001', 'Executor Never Replans',
    'ExecutionResult present; executor does not produce a WorkflowPlan',
    r => r['executionResultProduced'] === true && r['executorReplanned'] !== true,
    'executionResultProduced is false or executorReplanned is true'),
  inv('EXEC-002', 'Execution Journal Append-Only',
    'Journal length never decreases during execution',
    r => r['journalAppendOnly'] === true,
    'journalAppendOnly is not true'),
  inv('MEM-001', 'Memory Artifact Immutability',
    'MemoryArtifact fields are readonly after write',
    r => r['memoryArtifactImmutable'] === true,
    'memoryArtifactImmutable is not true'),
  inv('MEM-002', 'EPHEMERAL Memory Isolation',
    'EPHEMERAL entries not visible across agents/tasks',
    r => r['ephemeralIsolated'] === true,
    'ephemeralIsolated is not true'),
  inv('OBS-001', 'Observation TTL',
    'Expired observations are rejected, not processed',
    r => r['expiredObservationRejected'] === true,
    'expiredObservationRejected is not true'),
  inv('OBS-002', 'Observation Immutability',
    'Observation is not mutated after creation',
    r => r['observationImmutable'] === true,
    'observationImmutable is not true'),
  inv('DIST-001', 'Local-First Scheduling',
    'Single-node cluster routes task to local node',
    r => r['localNodeSelected'] === true,
    'localNodeSelected is not true'),
  inv('DIST-002', 'Remote Invocation Pairing',
    'Every RemoteInvocation has a matching RemoteInvocationResult',
    r => r['invocationResultPaired'] === true,
    'invocationResultPaired is not true'),
  inv('AGENT-001', 'EPHEMERAL Memory Lifetime',
    'EPHEMERAL memory destroyed after task end; does not survive',
    r => r['ephemeralDestroyedAfterTask'] === true,
    'ephemeralDestroyedAfterTask is not true'),
  inv('AGENT-002', 'Consensus Determinism',
    'Same inputs produce same ConsensusDecision',
    r => r['consensusDeterministic'] === true,
    'consensusDeterministic is not true'),
]

export class ConstitutionalInvariantRegistry {
  private readonly invariants = new Map<string, ConstitutionalInvariant>()

  constructor(loadBuiltIns = true) {
    if (loadBuiltIns) {
      for (const inv of BUILT_INS) this.invariants.set(inv.invariantId, inv)
    }
  }

  register(invariant: ConstitutionalInvariant): void {
    this.invariants.set(invariant.invariantId, invariant)
  }

  get(invariantId: string): ConstitutionalInvariant | undefined {
    return this.invariants.get(invariantId)
  }

  list(): readonly ConstitutionalInvariant[] {
    return Array.from(this.invariants.values())
  }
}
