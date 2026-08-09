# AFS-016D — Agent and Delegation Developer SDK

**Stage:** 16D  
**Status:** FROZEN  
**Date:** 2026-08-10  
**Author:** sritamsarkar

---

## 1. Stage Objectives

Stage 16D delivered the public agent/delegation developer SDK, typed delegation, bounded fan-out, and dogfooding of those SDK handles across the entire repo-engineer choreography surface. The concrete objectives were:

1. Define public agent protocol contracts in `@rohinik-org/agent-protocol-v1`: agent instance/run/delegation DTOs, authority/budget attenuation types, delegation evidence types, cancellation types, and typed output correlation.
2. Add 14 agent/delegation server routes to `@rohinik-org/server` (`/v1/agent-instances/*`, `/v1/agent-runs/*`, `/v1/delegations/*`) plus Route 14 (`GET /v1/delegations/:id/evidence`).
3. Ship `@rohinik-org/agent` SDK package: `AgentHandle`, `AgentRunHandle`, `DelegationHandle`, `admit()` factory, `AgentSdkError`. No RS1 runtime internals imported.
4. Implement typed delegation: `DelegationHandle.runAndWaitTyped<T>()` — schema registration, output poll, hash verification, `TypedResult<T>` return.
5. Ship `delegateMany()` bounded fan-out helper in the external SDK (`@rohinik-org/sdk`): maxConcurrency window, aggregate budget pre-check, deadline propagation, deterministic result ordering, cancellation propagation.
6. Migrate 12 manual agent/delegation choreography call sites in `repo-engineer` (`plan.ts`, `execute.ts`, `RohinikClient`) to use `@rohinik-org/agent` SDK handles. Remove all agent methods from `RohinikClient`.
7. Validate cross-repo SDK conformance with a 24-test suite (13 pillars A–M, port 19_203) using `@rohinik-org/agent` against a live RS1 server.

All seven objectives are complete.

---

## 2. Constitutional Invariants

The following invariants are frozen as constitutional law for 16D and all subsequent stages. All prior boundaries (16A/16B/16C) remain in full effect.

| # | Invariant |
|---|---|
| 16 | **SDK convenience does not create runtime authority.** `admit()`, `start()`, `delegate()` are choreography helpers. Each call maps 1:1 to a server route. No implicit authority is granted by calling a helper. |
| 17 | **Identity ≠ admission ≠ execution.** Having an `instanceId` does not mean an agent is admitted. Being admitted does not mean a run has started. Being RUNNING does not mean execution has been submitted. These are distinct lifecycle transitions, each requiring an explicit call. |
| 18 | **Delegation cannot amplify authority or budget.** `grantedCapabilities`, `grantedActions`, `grantedDepth`, `maxCostUsd`, `maxLatencyMs`, `maxTokens` in a delegation request are capped at the delegator's current authority and budget. Excess values are rejected 400 at the server; the SDK surfaces this as `AgentSdkError`. |
| 19 | **Delegation contract is bound before execution.** Certificate is issued and the task transitions to OFFERED before `delegation.run()` is called. No execution is submitted without a valid, accepted delegation contract. |
| 20 | **Child execution completion ≠ delegated-result acceptance.** The execution reaching a terminal state does not constitute `acceptResult`. The delegator must explicitly call `delegation.acceptResult()`. Until then the parent run remains DELEGATING. |
| 21 | **Typed delegated results remain subject to Stage 16C validation.** `runAndWaitTyped<T>()` requires a matching schema bound at run time. The server is the authoritative validator. Client-side hash verification is advisory. `T` is a caller assertion, not a proof. |
| 22 | **Cancellation request ≠ terminal cancellation.** `delegation.cancel()` revokes the certificate and transitions the task; it does not guarantee the execution has halted. `run.cancel()` emits CANCELLATION_REQUESTED; terminal cancellation requires a CANCELLED state in the async execution pipeline. |
| 23 | **Observation/disconnection ≠ cancellation.** Closing an SSE stream or disconnecting from an execution does not cancel it (16B invariant extended to delegation context). |
| 24 | **Multi-agent fan-out remains bounded.** `delegateMany()` enforces `maxConcurrency`, performs aggregate budget pre-check before dispatching any child, caps per-child `maxLatencyMs` to the remaining deadline, and propagates cancellation to all in-flight children on any single child failure. No unbounded concurrent delegation is possible through this helper. |
| 25 | **Evidence preserves full correlation chain.** Agent event records include `runId`, `delegationId`, `delegatedTaskId`, `certificateId`, `executionId` as appropriate. Route 13 (`/v1/agent-runs/:runId/evidence`) indexes by `runId`. Route 14 (`/v1/delegations/:id/evidence`) indexes by `delegationId` (not `delegatedTaskId`). |
| 26 | **SDK packages do not import RS1 runtime internals.** `@rohinik-org/agent` may only import `@rohinik-org/agent-protocol-v1` and `@rohinik-org/schema`. The external `@rohinik-org/sdk` may additionally import `@rohinik-org/runtime-client` and `@rohinik-org/agent`. No import from `kernel`, `runtime`, `agent-runtime`, `agent-delegation`, `schema-registry`, or any other RS1 internal package is permitted. |

---

## 3. Protocol Inventory (delta from 16A/16B/16C)

**Package:** `@rohinik-org/agent-protocol-v1`  
**Source file SHA-256:** `aa26455fa1eb6b0c58d4775fd12d1151aff8f6117947a01184d031f92f431b2b`

### New types added in 16D

| Type | Description |
|---|---|
| `AgentInstanceId` | Branded string — identity of a registered agent definition instance |
| `AgentRunId` | Branded string — identity of a run (one lifecycle execution) |
| `DelegationId` | Branded string — identity of a delegation contract |
| `DelegatedTaskId` | Branded string — identity of a delegated task record |
| `AgentTaskId` | Branded string — identity of a task within a run |
| `AgentRunState` | `ADMITTED \| RUNNING \| DELEGATING \| CANCELLED \| COMPLETED \| FAILED` |
| `AgentAuthority` | `{ allowedCapabilities, allowedActions, deniedActions, maxDelegationDepth }` |
| `AgentBudget` | `{ maxCostUsd, maxLatencyMs, maxTokens }` |
| `AdmitAgentRunRequest` | `{ instanceId }` |
| `AdmitAgentRunResponse` | `{ runId, state: 'ADMITTED' }` |
| `StartAgentRunResponse` | `{ runId, state: 'RUNNING' }` |
| `AgentRunStatusResponse` | `{ instanceId, definitionId, versionId, createdAt }` |
| `CancelAgentRunResponse` | `{ ok, state }` |
| `DelegateTaskRequest` | Full delegation spec including `delegateeRunId`, `taskId`, `grantedCapabilities`, `grantedActions`, `grantedDepth`, `maxCostUsd`, `maxLatencyMs`, `maxTokens` |
| `DelegateTaskResponse` | `{ certificateId, fingerprint, delegatedTaskId, delegationId }` |
| `AcceptDelegationResponse` | `{ ok, state }` |
| `RunDelegationResponse` | `{ executionId, delegationId, delegatedTaskId, state, ... }` |
| `AcceptDelegationResultResponse` | `{ ok, parentResumed }` |
| `RejectDelegationResultResponse` | `{ ok, parentResumed }` |
| `CancelDelegationResponse` | `{ ok, certificateRevoked, parentResumed }` |
| `AgentRunEvidenceResponse` | `{ runId, state, events: AgentEvent[] }` |
| `DelegationEvidenceResponse` | `{ delegationId, events: AgentEvent[] }` |
| `AgentEvent` | Full event record with `eventId`, `kind`, `runId`, `delegationId?`, `delegatedTaskId?`, `certificateId?`, `fingerprint?`, `fromState?`, `toState?`, `reason?`, `evidenceId?`, `payload?`, `occurredAt` |
| `OutputSchemaRef` | Reused from 16C; bound to delegation run in typed path |

---

## 4. Route Inventory (full 16D surface — routes.agents.ts)

| # | Method | Path | Description |
|---|---|---|---|
| 1 | POST | `/v1/agent-instances/admit` | Admit agent instance → `AdmitAgentRunResponse` |
| 2 | GET  | `/v1/agent-instances/:instanceId` | Get instance record |
| 3 | POST | `/v1/agent-runs` | Start run (ADMITTED → RUNNING) → `StartAgentRunResponse` |
| 4 | GET  | `/v1/agent-runs/:runId` | Get run status |
| 5 | POST | `/v1/agent-runs/:runId/cancel` | Cancel run |
| 6 | POST | `/v1/agent-runs/:runId/delegations` | Issue certificate + propose task → `DelegateTaskResponse` |
| 7 | POST | `/v1/delegations/:id/accept` | Accept task (OFFERED → ACCEPTED) |
| 8 | POST | `/v1/delegations/:id/run` | Submit execution (ACCEPTED → QUEUED) → `RunDelegationResponse` |
| 9 | POST | `/v1/delegations/:id/results` | Submit result (workerside) |
| 10 | POST | `/v1/delegations/:id/results/accept` | Accept result (delegatorside) → `AcceptDelegationResultResponse` |
| 11 | POST | `/v1/delegations/:id/results/reject` | Reject result |
| 12 | POST | `/v1/delegations/:id/cancel` | Cancel delegation + revoke cert |
| 13 | GET  | `/v1/agent-runs/:runId/evidence` | Run-scoped event log |
| 14 | GET  | `/v1/delegations/:id/evidence` | Delegation-scoped event log |

**Route 14 defect and fix (T9):** The handler called `agentEvents.listByDelegation(req.params.id)` where `id` is the `delegatedTaskId` URL segment. The event store indexes by `delegationId`, not `delegatedTaskId`. This caused the delegation evidence endpoint to always return an empty event array. Fix: changed to `agentEvents.listByDelegation(task.delegationId as string)` after loading the task record. Validated by Pillar J of the conformance suite.

---

## 5. Package Inventory (new in 16D)

### RS1 workspace

| Package | Version | Location | Runtime Deps |
|---|---|---|---|
| `@rohinik-org/agent-protocol-v1` | 0.1.0 | `core/protocol/agent-v1/` | `@rohinik-org/execution-protocol-v1` |
| `@rohinik-org/agent` | 0.1.0 | `core/runtime/agent/` | `@rohinik-org/agent-protocol-v1`, `@rohinik-org/schema` |

### External SDK (Rohinik/sdk)

| Package | Version | Location | Runtime Deps |
|---|---|---|---|
| `@rohinik-org/sdk` | (workspace) | `packages/sdk/` | `@rohinik-org/runtime-client`, `@rohinik-org/agent`, `@rohinik-org/agent-protocol-v1` |

### Source file hashes

| File | SHA-256 |
|---|---|
| `core/protocol/agent-v1/src/index.ts` | `aa26455fa1eb6b0c58d4775fd12d1151aff8f6117947a01184d031f92f431b2b` |
| `core/runtime/agent/src/index.ts` | `bd2db341597c6cf392ca06ded5ee1c8cfde9768dfaceb6eb3b2c43a615f50c4d` |
| `core/runtime/server/src/routes/agents.ts` | `0a8ce4daa36d59a0fe39b794b73e6a18d5a4b955c3c9f6282d76536782d2e336` |
| `core/runtime/server/src/__tests__/agent-sdk-conformance.test.ts` | `51ddbf8727a03b5bb358d6968684d4af542a115cdb745c16300331846d3a149b` |
| `app/repo-engineer/src/client/rohinik-client.ts` | `bc1467e7b1c47fd69d27c503550aa145fce03a6726ebad94dc83b843927c33fe` |
| `app/repo-engineer/src/commands/plan.ts` | `4d3fa6b1f352d236cbb7924a4a0b8220fc47075ba73f7df2d6bbda9e276865a4` |
| `app/repo-engineer/src/commands/execute.ts` | `d1cbdd0d0974b98e476a12c757959e7034f003059448920b5daa65777e68c2a1` |
| `sdk/packages/sdk/src/index.ts` | `ea2425b6e62e09f95511ec810e89abb282b0c80e26de599a25ec81181beca4df` |
| `sdk/packages/sdk/src/delegate-many.ts` | `b2c669c54bc2f3b641319f8af164f61382b7e9f7727266dea8a49aacaa2433a4` |

---

## 6. Public API Inventory (new in 16D)

### `@rohinik-org/agent`

```typescript
// Factory
async function admit(baseUrl: string, instanceId: string): Promise<AdmitResult>

interface AdmitResult {
  handle: AgentHandle
  run:    AgentRunHandle
}

// Error
class AgentSdkError extends Error {
  readonly status?: number
}

// Handles
class AgentHandle {
  readonly instanceId: string
  getInstance(): Promise<AgentRunStatusResponse>
}

class AgentRunHandle {
  readonly runId: string
  start():    Promise<StartAgentRunResponse>
  status():   Promise<AgentRunStatusResponse>
  cancel(reason?: string): Promise<CancelAgentRunResponse>
  delegate(params: DelegateTaskRequest): Promise<DelegationHandle>
  evidence(): Promise<AgentRunEvidenceResponse>
}

class DelegationHandle {
  readonly delegatedTaskId: string
  readonly delegationId:    string
  accept():       Promise<AcceptDelegationResponse>
  run(outputSchemaRef?: OutputSchemaRef): Promise<RunDelegationResponse & { delegationId: string; delegatedTaskId: string }>
  submitResult(result: unknown): Promise<{ ok: boolean; state: string }>
  acceptResult(): Promise<AcceptDelegationResultResponse>
  rejectResult(reason?: string): Promise<RejectDelegationResultResponse>
  cancel(reason?: string): Promise<CancelDelegationResponse>
  evidence(): Promise<DelegationEvidenceResponse>
  runAndWaitTyped<T>(schema: BoundSchema<T>, options?: { pollIntervalMs?: number; timeoutMs?: number }): Promise<TypedResult<T>>
}
```

### `@rohinik-org/sdk` additions (external SDK)

```typescript
async function delegateMany(
  run: AgentRunHandle,
  specs: DelegateManySpec[],
  options: DelegateManyOptions,
): Promise<DelegateManyResult[]>

interface DelegateManySpec {
  delegateeRunId:      string
  taskId:              string
  description:         string
  grantedCapabilities: string[]
  grantedActions:      string[]
  grantedDepth:        number
  maxCostUsd:          number
  maxLatencyMs:        number
  maxTokens:           number
}

interface DelegateManyOptions {
  maxConcurrency:  number
  aggregateBudget: AggregateBudget
  deadlineMs?:     number  // caps per-child maxLatencyMs
}

interface AggregateBudget {
  maxTotalCostUsd?:  number
  maxTotalTokens?:   number
}

interface DelegateManyResult {
  index:     number
  handle:    DelegationHandle
  execution: RunDelegationResponse
}
```

---

## 7. Conformance Summary

Cross-repository agent SDK conformance validated by `agent-sdk-conformance.test.ts` (port 19_203) — a real RS1 server with mock agent ports exercising all 13 16D pillars via `@rohinik-org/agent` SDK handles.

| Pillar | Description | Tests | Result |
|---|---|---|---|
| A — Admission | `admit()` factory, `AgentRunHandle` identity, parallel admit | 3 | PASS |
| B — Lifecycle | `start()` transitions to RUNNING, `status()` reflects state, double-start closes | 3 | PASS |
| C — Delegation | `delegate()` returns `DelegationHandle`, coordinator enters DELEGATING | 2 | PASS |
| D — Accept + Run | `accept()` + `run()` pipeline, 202 execution queued | 1 | PASS |
| E — Result decision | `acceptResult()` explicit; parent resumes; parent stays DELEGATING while sibling active | 2 | PASS |
| F — Authority attenuation | Excess `grantedDepth` rejected 400; excess `maxCostUsd` rejected 400 | 2 | PASS |
| G — Invalid transitions | `acceptResult` on OFFERED task → 409; state machine fail-closed | 1 | PASS |
| H — Cancellation | `delegation.cancel()` revokes cert; `run.cancel()` returns CANCELLED | 2 | PASS |
| I — Run evidence | `run.evidence()` returns ordered delegation event kinds | 1 | PASS |
| J — Delegation evidence (route 14) | `delegation.evidence()` returns delegation-scoped events; Route 14 fix validated | 1 | PASS |
| K — Typed delegation | `runAndWaitTyped<T>()` returns `TypedResult<T>` with valid output | 1 | PASS |
| L — No auto-accept | `runAndWaitTyped` does NOT call `acceptResult` implicitly | 1 | PASS |
| M — Floor compliance | 16A/16B/16C floor routes intact; Stage 15 execute route intact | 4 | PASS |
| **Total** | | **24** | **ALL PASS** |

---

## 8. Evidence

### Test counts

| Suite | Tests | Location |
|---|---|---|
| `agent-sdk-conformance.test.ts` | 24 | `core/runtime/server/src/__tests__/` |
| `agents.e2e.test.ts` | 27 | `core/runtime/server/src/__tests__/` |
| `agent.test.ts` | 21 | `core/runtime/agent/src/__tests__/` |
| `agent-protocol.test.ts` | 49 | `core/protocol/agent-v1/src/__tests__/` |
| `agent-delegation.test.ts` (repo-engineer) | 5 | `app/repo-engineer/src/__tests__/` |
| `delegate-many.test.ts` (SDK) | 9 | `sdk/packages/sdk/src/__tests__/` |
| RS1 16A/16B/16C floors (per-run) | 145+ | server suite, running in isolation |
| **New 16D tests** | **135** | tasks 2–9 |

### Dogfooding

FRICTION-013 and FRICTION-014 (`RohinikClient` agent methods) removed from `app/repo-engineer`. All 12 choreography call sites now route through `@rohinik-org/agent` SDK handles. `RohinikClient` retains only: `health`, `execute`, `simulate`, `getDecision`, `getExperience`.

### Friction resolved

| Item | Summary | Resolution |
|---|---|---|
| FRICTION-020 | `DelegationRunResponse` local mirror type drifts from protocol | Resolved: type comes from `@rohinik-org/agent-protocol-v1` |
| FRICTION-021 | Two clients require duplicated endpoint config | Partially resolved: `RohinikClient` agent surface removed; one client per domain |

### Route 14 defect

Route 14 (`GET /v1/delegations/:id/evidence`) always returned empty events because `listByDelegation(req.params.id)` was called with the URL's `delegatedTaskId` segment while the event store indexes by `delegationId`. The fix (`listByDelegation(task.delegationId as string)`) was applied in commit `5aad874` alongside the T9 conformance suite that caught and validated it.

---

## 9. Known Limitations

1. **Agent event store is in-memory.** All agent events are lost on server restart. Persistence belongs to 16E/16F.
2. **No agent identity resolution.** `MockPolicyPort`, `MockCapabilityPort`, `MockBudgetPort` used in tests; production identity + authority resolution is not implemented.
3. **`delegateMany()` is SDK-only.** No server-side fan-out primitive. Concurrent delegation is client-orchestrated.
4. **Certificate revocation is not replayed.** There is no mechanism to query revoked certificates after the fact. Evidence records the revocation event.
5. **`runAndWaitTyped` polls, not streams.** It polls `GET /v1/executions/:id` until terminal. A future stage may use SSE for lower latency.
6. **No multi-run concurrency safety.** Multiple processes may admit the same `instanceId` independently. The server does not enforce exclusive run ownership.
7. **Pre-existing INFRA-001.** Windows named pipe EADDRINUSE in parallel test runs. Not a 16D regression.

---

## 10. Roadmap to 16E

| Stage | Theme | Primary driver |
|---|---|---|
| 16E | Approval, verification, recovery, rollback | repo-engineer Phase D gates as design evidence |
| 16F | Persistence + idempotency | Agent event store persistence; execution record persistence |
| 16G | Client unification | FRICTION-018 — two error classes; single unified client surface |

---

## Release Gate

This stage is **FROZEN** as `v0.16.1-stage16d`.

RS1 tag: `stage-16d-agent-sdk-freeze`  
SDK tag: `stage-16d-agent-client-freeze`  
Coordinated release: `v0.16.1-stage16d`

All 16D tests pass. Protocol, SDK handles, typed delegation, bounded fan-out, agent routes (1–14), and conformance suite are frozen at the hashes recorded in sections 5–6. No changes to the admission/delegation lifecycle contract, authority attenuation rules, evidence indexing semantics, or SDK package boundaries are permitted under this version.
