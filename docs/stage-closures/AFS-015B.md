# AFS-015B — Stage 15B Closure: Agent Runtime Foundation

## Status: FROZEN

Stage 15B is closed. `@rohinik-org/agent-runtime` is frozen at Tasks 4–6. No
changes to admission contracts, run lifecycle logic, port interfaces, or
in-memory repositories without a new AFS superseding this document.

---

## Scope

Stage 15B establishes the governed agent runtime execution layer. It
implements admission control, run lifecycle management, plan/checkpoint/history
repositories, and injectable integration port contracts. It does not implement
delegation contracts, task scheduling, coordination, or oversight — those
belong to 15C–15F.

**Package:** `@rohinik-org/agent-runtime`
**Path:** `core/runtime/agent-runtime`
**Tasks covered:** Task 4, Task 5, Task 6
**Depends on:** AFS-015A (frozen `@rohinik-org/agent-ir`)

---

## Frozen Exports

### Task 4 — Admission

| Export | Kind |
|---|---|
| `PolicyPort` | interface |
| `CapabilityPort` | interface |
| `BudgetPort` | interface |
| `AgentInstanceRepository` | interface |
| `AgentVersionRepository` | interface |
| `AgentRunRepository` | interface |
| `InMemoryAgentInstanceRepository` | class |
| `InMemoryAgentVersionRepository` | class |
| `InMemoryAgentRunRepository` | class |
| `AgentAdmissionRequest` | interface |
| `AgentAdmissionResult` | interface |
| `AgentAdmissionService` | class |

**Admission invariants:**
- Fail-closed: all 5 checks must pass (instance, version, policy, capability, budget)
- Admitted run state is `ADMITTED`, never `RUNNING`
- Version is bound exactly at admission time

### Task 5 — Run Lifecycle, Planning, Checkpointing

| Export | Kind |
|---|---|
| `AgentPlanRepository` | interface |
| `AgentCheckpointRepository` | interface |
| `AgentRunTransitionRecord` | interface |
| `AgentRunHistoryRepository` | interface |
| `InMemoryAgentPlanRepository` | class |
| `InMemoryAgentCheckpointRepository` | class |
| `InMemoryAgentRunHistoryRepository` | class |
| `TransitionEvidence` | interface |
| `TransitionResult` | interface |
| `AgentRunLifecycleService` | class |

**Lifecycle invariants:**
- Transitions validated against `AgentRunTransitions` from frozen IR
- Idempotent: transition to current state returns `{ ok: true }` without history entry
- Invalid transitions return `{ ok: false, reason: 'invalid-transition: ...' }` without mutation
- Every valid transition appended to immutable history (evidenceId + reason)
- Plan supersession: old plan marked `SUPERSEDED` (terminal); new plan created as `DRAFT`
- Plan activation rejected from any non-DRAFT state (throws)
- Checkpoint: latest-wins ordered list; `latestCheckpoint()` returns last saved

### Task 6 — Integration Ports

| Export | Kind |
|---|---|
| `ContextPort` | interface |
| `EvidencePort` | interface |
| `MemoryPort` | interface |
| `RoutingPort` | interface |
| `CapabilityInvocationPort` | interface |

**Port invariants:**
- All ports are single-method injectable interfaces
- No import from Stage 9/11/13/14 packages — caller wires implementations
- All inputs/outputs use primitive types or `@rohinik-org/agent-ir` branded IDs only

---

## Constitutional Laws Encoded

| Law | Encoding |
|---|---|
| LAW-131: no run without admission | `AgentAdmissionService` — fail-closed, 5 checks; admitted run is `ADMITTED` not `RUNNING` |
| LAW-135: delegation attenuates authority | Port interfaces carry no authority objects; authority flows from IR layer only |
| LAW-144: plan supersession traceability | `supersedePlan()` — old plan forced to `SUPERSEDED` terminal; `AgentSupersession` record links oldPlanId → newPlanId |
| LAW-146: plan governance | `activatePlan()` rejects non-DRAFT state; `AgentPlanTransitions` from frozen IR enforced |

---

## Test Evidence

32 tests pass across:

| Suite | Tests |
|---|---|
| `agent-runtime admission` | 6 |
| `agent-runtime repositories` | 4 |
| `agent-runtime run lifecycle transitions` | 8 |
| `agent-runtime plan management` | 3 |
| `agent-runtime checkpointing and recovery` | 5 |
| `agent-runtime integration ports contract` | 6 |

**Commits:**
| Task | Commit |
|---|---|
| Task 4 (admission) | `73c3a00` |
| Task 5 (lifecycle) | `fabb632` |
| Task 6 (integration ports) | `68bb942` |

---

## Downstream Verification

`@rohinik-org/agent-runtime` verified against frozen AFS-015A:
- All IR types consumed via `@rohinik-org/agent-ir` import only
- `AgentRunTransitions`, `AgentRunTerminalStates`, `AgentPlanTransitions` used at runtime
- No mutation of IR objects
- 32/32 tests pass at freeze commit `68bb942`

---

## Frozen Constraints for Downstream Stages

1. No run without admission — `AgentAdmissionService` is the only admission path.
2. Admitted run state is `ADMITTED`. Execution (READY → RUNNING) is a downstream concern.
3. All transition validation consults `AgentRunTransitions` from frozen AFS-015A IR.
4. Port interfaces (`ContextPort`, `EvidencePort`, `MemoryPort`, `RoutingPort`, `CapabilityInvocationPort`) are injectable — no concrete implementations in this package.
5. No agent framework SDK (LangChain, AutoGen, CrewAI, Semantic Kernel) in core.
6. InMemory repositories are for test/wire-up only — persistence adapters implemented in later stages.
7. Sequence counter (`_seq`) for in-memory ID uniqueness; replace with UUID generator when persistence requires it.

---

## Release Gate

- [x] All 32 tests pass
- [x] `typecheck` clean (zero errors)
- [x] ESM build clean (`dist/index.js` + `dist/index.d.ts`)
- [x] Single runtime dependency: `@rohinik-org/agent-ir` only
- [x] Verified against frozen AFS-015A
- [x] `stage-15b-evidence.json` produced
- [x] Freeze commit tagged `stage-15b-freeze`

---

## Roadmap

Stage 15B is a prerequisite for 15C–15F:

| Stage | Depends on |
|---|---|
| 15C Task 7 (delegation contracts) | 15A + 15B |
| 15C Task 8 (task contracts) | 15A + 15B |
| 15D Task 9–11 (coordination) | 15A + 15B + 15C |
| 15E Task 12–13 (oversight) | 15A + 15B |
| 15F Task 14–15 (evaluation, closure) | All prior |

No stage beyond 15B may modify `@rohinik-org/agent-runtime` (Tasks 4–6 scope)
without a new AFS.
