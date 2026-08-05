# AFS-015E — Stage 15E Closure: Human Oversight and Intervention

## Status: FROZEN

Stage 15E is closed. `@rohinik-org/agent-oversight` is frozen at Tasks 12–13.
No changes to oversight decision kinds, request/decision records, safety-stop
severity semantics, or containment contracts without a new AFS superseding this
document.

---

## Scope

Stage 15E establishes human oversight as **active control**, not passive
observation. An agent system that only exposes read access to human operators
provides no oversight. Every human action is an explicit, durable, audited
decision from a named operator.

**Central rule: observation is not control.**

Human oversight must be able to: approve, deny, pause, constrain, resume,
cancel, and terminate. These are seven distinct, irreducible operations.
Silence is never approval.

**Package:** `@rohinik-org/agent-oversight`
**Path:** `core/runtime/agent-oversight`
**Tasks covered:** Task 12, Task 13
**Depends on:** AFS-015A (`@rohinik-org/agent-ir`)

---

## Frozen Exports

### Task 12 — Human Approval, Pause, Resume, Intervention

| Export | Kind |
|---|---|
| `OversightRequestId` | branded ID |
| `OversightDecisionId` | branded ID |
| `OversightOperator` | interface |
| `OversightDecisionKind` | frozen const enum (7 values) |
| `OversightRequestState` | frozen const enum (2 values) |
| `ConstraintDirective` | interface |
| `OversightRequest` | interface |
| `OversightDecision` | interface |
| `ReviewQueueItem` | interface |
| `ReviewQueue` | interface |
| `OversightRequestRepository` | interface |
| `OversightDecisionRepository` | interface |
| `InMemoryReviewQueue` | class |
| `InMemoryOversightRequestRepository` | class |
| `InMemoryOversightDecisionRepository` | class |
| `EnqueueParams` | interface |
| `OversightService` | class |

**Decision kind invariants:**

| Kind | Semantics |
|---|---|
| `APPROVE` | Explicitly permit the requested action |
| `DENY` | Explicitly forbid — request rejected |
| `PAUSE` | Suspend run pending further review |
| `CONSTRAIN` | Permit with reduced authority via `ConstraintDirective` |
| `RESUME` | Lift a prior pause — run may continue |
| `CANCEL` | Graceful cancellation of run |
| `TERMINATE` | Immediate forceful stop — strongest intervention |

No `READ`, `OBSERVE`, `MONITOR`, or `WATCH` kind exists or may be added.

**Oversight invariants:**
- Silence is never approval: `PENDING` state never auto-advances
- Every decision records: `operatorId`, `rationale`, `decidedAt` — JSON-safe, durable
- Duplicate decision on already-decided request throws `already-decided`
- `ConstraintDirective`: strips capabilities, adds denied actions, overrides budget ceiling
- ReviewQueue is FIFO; drained atomically on decision
- `loadByRunId` on decision repository returns full decision history

### Task 13 — Safety Stops, Cancellation Propagation, Containment, Incident Evidence

| Export | Kind |
|---|---|
| `SafetyStopId` | branded ID |
| `IncidentRecordId` | branded ID |
| `CancellationPropagationId` | branded ID |
| `CommunicationCutoffId` | branded ID |
| `SafetyStopSeverity` | frozen const enum (3 levels) |
| `SafetyStop` | interface |
| `CancellationPropagation` | interface |
| `CommunicationCutoff` | interface |
| `IncidentRecord` | interface |
| `SafetyStopRepository` | interface |
| `IncidentRepository` | interface |
| `CommunicationCutoffRepository` | interface |
| `CancellationPropagationRepository` | interface |
| `InMemorySafetyStopRepository` | class |
| `InMemoryIncidentRepository` | class |
| `InMemoryCommunicationCutoffRepository` | class |
| `InMemoryCancellationPropagationRepository` | class |
| `StopParams` | interface |
| `RecordIncidentParams` | interface |
| `ContainmentService` | class |

**Safety-stop severity semantics:**

| Severity | `requiresReAdmission` | Semantics |
|---|---|---|
| `WARNING` | `false` | Advisory — run may continue; no re-admission needed |
| `CRITICAL` | `true` | Halt — run cannot restart without new admission |
| `EMERGENCY` | `true` | Immediate halt — highest urgency; re-admission mandatory |

**Containment invariants:**
- `propagate()` records which child runs were cancelled across the delegation tree; `originStopId` links back
- `cutoff()` severs mailbox — `isCutOff()` gate enforced by messaging layer
- `recordIncident()` bundles `evidenceIds` with stop and run identity — audit trail preserved
- A stopped run with `requiresReAdmission: true` cannot restart; enforcement is caller's responsibility (15B `AgentAdmissionService`)

---

## Constitutional Laws Encoded

| Law | Encoding |
|---|---|
| LAW-141: human intervention | `OversightDecisionKind` — 7 active operations; no passive-only kinds permitted |
| LAW-138: silence ≠ approval | `OversightRequestState.PENDING` never auto-advances; no timer, no default |
| LAW-142: cancellation propagation | `CancellationPropagation` records full delegation-tree cancellation with `originStopId` |
| LAW-145: containment | `CommunicationCutoff` severs messaging; `SafetyStop` with `requiresReAdmission` blocks re-entry |
| LAW-139: evidence on intervention | `IncidentRecord` captures `evidenceIds` + operator identity at stop time |

---

## Test Evidence

30 tests pass across:

| Suite | Tests |
|---|---|
| `agent-oversight: OversightDecisionKind covers all 7 operations` | 2 |
| `agent-oversight: OversightRequest and ReviewQueue` | 4 |
| `agent-oversight: OversightService decisions` | 11 |
| `agent-oversight: ContainmentService — safety stops` | 13 |

**Commit:** `9188d72`

---

## Downstream Verification

Verified against AFS-015A:
- Only `AgentRunId` consumed from `@rohinik-org/agent-ir`
- No admission, lifecycle, delegation, or coordination logic imported
- Enforcement wired by caller (15B admission gate, 15D messaging cutoff)

---

## Frozen Constraints for Downstream Stages

1. `OversightDecisionKind` has exactly 7 values. No new kind without a new AFS.
2. Silence is never approval — no timer, background task, or default may auto-decide.
3. Every decision carries `operatorId` — anonymous oversight decisions are not valid.
4. `requiresReAdmission: true` on CRITICAL/EMERGENCY stops — enforcement via 15B `AgentAdmissionService`.
5. `isCutOff()` must be checked by the messaging layer before send/receive.
6. No agent framework SDK in core packages.

---

## Release Gate

- [x] All 30 tests pass
- [x] `typecheck` clean (zero errors)
- [x] ESM build clean (`dist/index.js` + `dist/index.d.ts`)
- [x] Single runtime dependency: `@rohinik-org/agent-ir` only
- [x] Verified against AFS-015A
- [x] `stage-15e-evidence.json` produced
- [x] Freeze commit tagged `stage-15e-freeze`

---

## Roadmap

| Stage | Depends on |
|---|---|
| 15F Task 14 (evaluation) | 15A + 15B + 15E |
| 15F Task 15 (closure) | All prior |

**Critical rule for 15F:**
- Agent execution success ≠ agent outcome quality ≠ agent reliability authority
- Reliability scores derive only from independent evaluation evidence
- Learned policy changes route through Stage 13 policy layer — never mutate `AgentDefinition` or `AgentVersion` directly
