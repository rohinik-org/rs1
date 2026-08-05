# AFS-015D — Stage 15D Closure: Multi-Agent Coordination

## Status: FROZEN

Stage 15D is closed. `@rohinik-org/agent-coordination` is frozen at Tasks 9–11.
No changes to messaging contracts, team governance, conflict resolution,
deadlock detection, or placement binding without a new AFS superseding this
document.

---

## Scope

Stage 15D establishes multi-agent coordination: authenticated messaging with
deduplication and redaction, versioned team governance, shared-task planning
with barriers and deterministic conflict resolution, deadlock detection, and
placement binding with identity-preserving failover.

**Package:** `@rohinik-org/agent-coordination`
**Path:** `core/runtime/agent-coordination`
**Tasks covered:** Task 9, Task 10, Task 11
**Depends on:** AFS-015A, AFS-015B, AFS-015C

---

## Frozen Exports

### Task 9 — Messaging, Mailboxes, Correlation, Communication Integrity

| Export | Kind |
|---|---|
| `MailboxId` | branded ID |
| `CoordinationMessageId` | branded ID |
| `MessageHashParams` | interface |
| `buildMessageHash` | function |
| `CoordinationMessage` | interface |
| `CoordinationMailbox` | interface |
| `MailboxRepository` | interface |
| `InMemoryMailboxRepository` | class |
| `MessagingPolicyPort` | interface |
| `SendParams` | interface |
| `CoordinationMessagingService` | class |

**Messaging invariants:**
- Content hash: SHA-256 of `{fromRunId, toMailboxId, content}` — `sentAt` excluded so dedup is content-stable
- Deduplication: identical hash delivered once only
- Expiry: `readMessages()` filters out expired messages at read time
- Redaction: `content` set to `null`, `redacted: true`; `contentHash` preserved for audit trail
- Policy port: `MessagingPolicyPort.check()` — blocks send before delivery if denied

### Task 10 — Teams, Coordination Plans, Conflict Resolution, Deadlock Detection

| Export | Kind |
|---|---|
| `CoordinationTeamId` | branded ID |
| `CoordinationPlanId` | branded ID |
| `WorkClaimId` | branded ID |
| `TeamBarrier` | interface |
| `CoordinationTeam` | interface |
| `TeamChangeRecord` | interface |
| `CoordinationTeamRepository` | interface |
| `InMemoryCoordinationTeamRepository` | class |
| `CreateTeamParams` | interface |
| `CoordinationTeamService` | class |
| `CoordinationPlan` | interface |
| `WorkClaim` | interface |
| `CoordinationPlanRepository` | interface |
| `WorkClaimRepository` | interface |
| `InMemoryCoordinationPlanRepository` | class |
| `InMemoryWorkClaimRepository` | class |
| `CreatePlanParams` | interface |
| `CoordinationPlanService` | class |
| `resolveConflict` | function |
| `detectDeadlock` | function |

**Team invariants:**
- Leader cannot be removed (`cannot-remove-leader` thrown)
- Every membership change appended to `TeamChangeRecord` log with version numbers
- Team `version` incremented on every change

**Plan / work-claim invariants:**
- `claimWork` exclusive per task — second claimer throws `task-already-claimed`
- Barrier cleared only when all `requiredTaskIds` have claims
- `resolveConflict` deterministic: earliest `claimedAt`, ties broken by `claimedBy` lexical order
- `detectDeadlock` DFS cycle detection over wait-for graph; returns cycle nodes or `null`

### Task 11 — Distributed Agent Placement and Federation Integration

| Export | Kind |
|---|---|
| `PlacementBindingId` | branded ID |
| `AttemptId` | branded ID |
| `AgentPlacementBinding` | interface |
| `PlacementBindingRepository` | interface |
| `InMemoryPlacementBindingRepository` | class |
| `PlacementPort` | interface |
| `BindParams` | interface |
| `AgentPlacementService` | class |

**Placement invariants:**
- `bind()` creates a new `AttemptId` per placement
- `failover()` preserves: `runId`, `federationId`, `delegatedTaskId`, `checkpointPolicy`
- `failover()` creates: new `PlacementBindingId`, new `AttemptId`, records `previousAttemptId` + `failoverReason`
- `PlacementPort` uses plain `string` IDs compatible with Stage 14 `PlacementId`/`NodeId`/`FederationId` — no Stage 14 SDK import
- Evidence and cancellation identity preserved across failover via `runId` continuity

---

## Constitutional Laws Encoded

| Law | Encoding |
|---|---|
| LAW-148: coordination integrity | Work claims exclusive; `resolveConflict` deterministic; barriers enforce synchronisation |
| LAW-149: no hidden persistence | All state in explicit repositories; no side-channel stores |
| LAW-147: federation placement | `AgentPlacementBinding` links run to federation node; failover preserves run identity |
| LAW-140: evidence continuity | `runId` unchanged across failover — evidence trail remains intact |

---

## Test Evidence

33 tests pass across:

| Suite | Tests |
|---|---|
| `agent-coordination: CoordinationMessage structure` | 3 |
| `agent-coordination: CoordinationMessagingService` | 8 |
| `agent-coordination: CoordinationTeam` | 5 |
| `agent-coordination: CoordinationPlan and work claims` | 4 |
| `agent-coordination: conflict resolution and deadlock detection` | 4 |
| `agent-coordination: AgentPlacementBinding` | 7 |
| `agent-coordination: PlacementPort injectable` | 2 |

**Commit:** `2253635`

---

## Downstream Verification

Verified against AFS-015A, AFS-015B, AFS-015C:
- IR branded types from `@rohinik-org/agent-ir`
- `DelegatedTaskId` from `@rohinik-org/agent-delegation`
- No Stage 9/11/13/14 SDK imports
- `PlacementPort` interface compatible with Stage 14 types without importing them

---

## Frozen Constraints for Downstream Stages

1. Message dedup key is `{fromRunId, toMailboxId, content}` — time is not part of the key.
2. Conflict resolution is deterministic — no randomness, no external tiebreak.
3. Deadlock detection is cycle-detection only — resolution is a downstream policy concern.
4. Failover preserves run identity — a new `AttemptId` does not mean a new run.
5. `PlacementPort` is injectable — Stage 14 implementations wired by caller.
6. No agent framework SDK in core packages.

---

## Release Gate

- [x] All 33 tests pass
- [x] `typecheck` clean (zero errors)
- [x] ESM build clean (`dist/index.js` + `dist/index.d.ts`)
- [x] Dependencies: `@rohinik-org/agent-ir`, `@rohinik-org/agent-delegation`
- [x] Verified against AFS-015A, AFS-015B, AFS-015C
- [x] `stage-15d-evidence.json` produced
- [x] Freeze commit tagged `stage-15d-freeze`

---

## Roadmap

| Stage | Depends on |
|---|---|
| 15E Task 12–13 (oversight) | 15A + 15B — ready |
| 15F Task 14–15 (evaluation, closure) | All prior |
