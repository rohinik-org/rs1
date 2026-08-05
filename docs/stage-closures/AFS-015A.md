# AFS-015A — Stage 15A Closure: Agent IR Foundation

## Status: FROZEN

Stage 15A is closed. `@rohinik-org/agent-ir` is frozen. No changes to
identity types, state enums, transition maps, or terminal sets without a
new AFS superseding this document.

---

## Scope

Stage 15A establishes the canonical intermediate representation for the
governed agent runtime. It defines identity, lifecycle state, transition
authority, and structural contracts. It does not implement execution,
admission, delegation logic, or coordination — those belong to 15B–15F.

**Package:** `@rohinik-org/agent-ir`
**Path:** `core/runtime/agent-ir`
**Tasks covered:** Task 1, Task 2, Task 3

---

## Frozen Identity Types (14)

| Type | Layer |
|---|---|
| `AgentId` | Agent entity |
| `AgentDefinitionId` | Definition |
| `AgentVersionId` | Versioned definition |
| `AgentInstanceId` | Bound instance |
| `AgentRunId` | Execution run |
| `AgentTaskId` | Task within run |
| `AgentPlanId` | Plan within run |
| `DelegationId` | Delegation contract |
| `AgentMessageId` | Inter-run message |
| `AgentTeamId` | Team grouping |
| `AgentCheckpointId` | Checkpoint snapshot |
| `AgentEvidenceId` | Evidence record |
| `AgentOutcomeId` | Run outcome |
| `SupersessionId` | Plan supersession |

All are branded strings — JSON-safe and structurally distinct.

---

## Frozen State Enums

### AgentRunState (11 states)

```
CREATED → ADMITTED → READY → RUNNING
RUNNING ↔ WAITING | BLOCKED | DELEGATING | SUSPENDED
RUNNING / WAITING / BLOCKED / DELEGATING / SUSPENDED → COMPLETED | FAILED | CANCELLED
```

`DEFINED` was present in a draft and removed: it belongs to the
`AgentDefinition`/`AgentVersion` identity layer, not the run lifecycle.

**DELEGATING** (narrow definition): a run is in `DELEGATING` state when its
forward progress is governed by an active delegated task. A run enters
`DELEGATING` only from `RUNNING`, and exits only when the delegated task
resolves (to `RUNNING`, `CANCELLED`, or `FAILED`). A run that has merely
issued a delegation request but retains local progress is not `DELEGATING`.

Terminal states: `COMPLETED`, `FAILED`, `CANCELLED`

### AgentTaskState (6 states)

`PENDING → ASSIGNED → RUNNING → COMPLETED | FAILED | CANCELLED`

Terminal states: `COMPLETED`, `FAILED`, `CANCELLED`

### AgentPlanState (5 states)

`DRAFT → ACTIVE → SUPERSEDED | COMPLETED | ABANDONED`

`SUPERSEDED` is terminal and immutable — plan governance traceability is
permanent once a plan is superseded.

Terminal states: `SUPERSEDED`, `COMPLETED`, `ABANDONED`

### DelegationState (6 states)

`PENDING → ACCEPTED → ACTIVE → COMPLETED | REVOKED | REJECTED`

### AgentOutcomeStatus: `SUCCESS | PARTIAL | FAILURE | CANCELLED`

### AgentGoalPriority: `CRITICAL | HIGH | NORMAL | LOW`

### AgentConstraintKind: `BUDGET | TIME | CAPABILITY | AUTHORITY | POLICY`

---

## Frozen Structural Contracts (23 interfaces)

`AgentRun`, `AgentTask`, `AgentPlan`, `AgentDelegation`, `AgentMessage`,
`AgentTeam`, `AgentCheckpoint`, `AgentEvidence`, `AgentOutcome`,
`AgentSupersession`, `AgentDefinition`, `AgentVersion`, `AgentGoal`,
`AgentRole`, `AgentAuthority`, `AgentCapabilityRequirement`, `AgentBudget`,
`AgentConstraint`, `AgentPolicyRef`, `AgentInstance`, `AgentPlanStep`,
`AgentFailure`, `AgentCancellation`

All interfaces are fully `readonly`. All fields are JSON-safe.
`AgentAuthority` carries no provider or model binding.
`AgentPolicyRef` is a pointer only — no inline rules.

---

## Constitutional Laws Encoded

| Law | Encoding |
|---|---|
| LAW-131: no run without admission | `ADMITTED` gate — run cannot reach `READY` or `RUNNING` without passing `ADMITTED` |
| LAW-135: delegation attenuates authority | `AgentAuthority.maxDelegationDepth` enforced by downstream; `DELEGATING` state is narrowly scoped |
| LAW-144: plan supersession traceability | `AgentSupersession` links `oldPlanId` → `newPlanId`; `SUPERSEDED` is terminal |
| LAW-146: plan governance | `AgentPlanTransitions` — `ACTIVE` can only progress forward, never regress to `DRAFT` |

Constitutional tests enforce all of the above. Laws are described, not
enforced, by this IR package — enforcement is in validators and services
(15B+).

---

## Test Evidence

52 tests pass across:
- Canonical identity brands
- State enum completeness
- Definition and authority contracts
- Instance and plan-step contracts
- Run transition map (valid and invalid)
- Task transition map (valid and invalid)
- Plan transition map (valid and invalid)
- Terminal state immutability
- Deterministic canonical hashes

**Enum hash evidence** (SHA-256 of sorted keys):

| Enum | Hash |
|---|---|
| `AgentRunState` | `fc7e54a8...` |
| `AgentTaskState` | `b8e9184f...` |
| `AgentPlanState` | `b55d2266...` |

Full hashes in `docs/stage-closures/stage-15a-evidence.json`.

---

## Downstream Verification

`@rohinik-org/agent-runtime` (commit `73c3a00`) verified against frozen IR:
11/11 tests pass. Records dependency on AFS-015A.

Stage 15B closed at commit `68bb942`: 32/32 tests pass. AFS-015B records
full dependency on AFS-015A.

---

## Frozen Constraints for Downstream Stages

1. Agent is not a model, capability, or workflow.
2. No run without admission — `ADMITTED` is the gate.
3. Delegated authority is a strict subset of delegator authority.
4. No implicit delegation.
5. `DELEGATING` = parent run governed by active delegated task, not merely issuer.
6. No agent framework SDK (LangChain, AutoGen, CrewAI, Semantic Kernel) in core.
7. Existing Stage 9/11/13/14 authorities (context, evidence, evaluation, reliability, routing, budgets, memory, policy, adaptation, federation) are unchanged.
8. No later-substage scaffolding added during 15A.

---

## Release Gate

- [x] All 52 constitutional tests pass
- [x] `typecheck` clean (zero errors)
- [x] ESM build clean (`dist/index.js` + `dist/index.d.ts`)
- [x] Zero runtime dependencies
- [x] `@rohinik-org/agent-runtime` verified against frozen IR
- [x] `stage-15a-evidence.json` produced with deterministic enum hashes
- [x] Freeze commit tagged `stage-15a-freeze`

---

## Roadmap

Stage 15A is a prerequisite for all subsequent 15x stages:

| Stage | Depends on |
|---|---|
| 15B Task 4 (`agent-runtime` admission) | 15A — DONE, frozen |
| 15B Task 5 (run lifecycle management) | 15A — DONE, frozen |
| 15B Task 6 (integration ports) | 15A — DONE, frozen |
| 15C Task 7 (delegation contracts) | 15A — DONE, frozen |
| 15C Task 8 (task contracts) | 15A — DONE, frozen |
| 15D Task 9–11 (coordination) | 15A + 15B + 15C — DONE, frozen |
| 15E Task 12–13 (oversight) | 15A + 15B — DONE, frozen |
| 15F Task 14–15 (evaluation, closure) | All prior — DONE, frozen |

No stage beyond 15A may modify `@rohinik-org/agent-ir` without a new AFS.
