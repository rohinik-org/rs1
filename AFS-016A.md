# AFS-016A — Async Execution Protocol

**Stage:** 16A  
**Status:** FROZEN  
**Date:** 2026-08-06  
**Author:** sritamsarkar

---

## 1. Stage Objectives

Stage 16A delivered a durable async execution protocol connecting the RS1 agent runtime to external consumers via a typed, versioned HTTP contract. The concrete objectives were:

1. Define a public protocol contract (`@rohinik-org/execution-protocol-v1`) — types, schemas, OpenAPI, compatibility metadata — that RS1 implements and the SDK consumes.
2. Implement five protocol routes on RS1 server (`/v1/executions/*`) backed by an in-memory async execution repository.
3. Ship a zero-dependency SDK client (`@rohinik-org/client`) with typed handles, ergonomic polling, and error classification.
4. Wire the delegation bridge (`POST /v1/delegations/:id/run`) to the async execution protocol — 202 response, fire-and-forget background execution.
5. Dogfood the SDK in `repo-engineer` — replace manual HTTP polling with `execution.waitForResult()` — and document all friction encountered.
6. Validate cross-repository protocol conformance with a standalone mock-server test suite.

All six objectives are complete.

---

## 2. Frozen Boundaries

The following boundaries are locked for all future stages. Changing any of them requires a new AFS.

| Boundary | Rule |
|---|---|
| Protocol authority | RS1 is the authoritative protocol source. SDK must not import RS1 internals. |
| State mapping | Internal RS1 states map to public states via `execution-protocol-mapper`. The mapping is one-way (internal → public). |
| Terminal immutability | COMPLETED / FAILED / CANCELLED records cannot have their state or result overwritten after first write. |
| Atomicity | `state`, `completedAt`/`cancelledAt`, and `result` are written in a single `update()` call — no window where state=terminal and result=null. |
| Packaging | `@rohinik-org/client` ships as a single bundled file with zero runtime dependencies. No transitive deps via `file:` references in the tarball. |
| Existing `/v1/execute` route | Unchanged — still blocking, no protocol version header. Compatible. |
| Streaming | Belongs to Stage 16B. |
| Typed output schemas | Belong to Stage 16C. |
| High-level agent helpers | Belong to Stage 16D. |

---

## 3. Protocol Inventory

**Package:** `@rohinik-org/execution-protocol-v1` v1.0.0  
**Location:** `core/protocol/execution-v1/`  
**Protocol version:** `v1`

### Routes

| Method | Path | Description |
|---|---|---|
| POST | `/v1/executions` | Submit execution — 202 with `SubmitExecutionResponse` |
| GET  | `/v1/executions/:executionId` | Poll status — 200 with `ExecutionStatusResponse` |
| GET  | `/v1/executions/:executionId/result` | Retrieve result — 200 after terminal, 409 before |
| POST | `/v1/executions/:executionId/cancel` | Request cancellation — 200 with `CancelExecutionResponse` |
| GET  | `/v1/executions/:executionId/evidence` | Retrieve evidence log — 200 with `ExecutionEvidenceResponse` |

### Public States

`QUEUED` → `ADMITTED` → `RUNNING` → `WAITING` (optional) → `COMPLETED` | `FAILED` | `CANCELLED`  
`CANCELLING` is a transient public state during cancellation.

Terminal states: `COMPLETED`, `FAILED`, `CANCELLED`

### Internal → Public State Mapping

| Internal | Public |
|---|---|
| CREATED | QUEUED |
| READY | ADMITTED |
| RUNNING | RUNNING |
| WAITING | WAITING |
| RETRYING | RUNNING |
| COMPLETED | COMPLETED |
| FAILED | FAILED |
| CANCELLED | CANCELLED |
| TIMED_OUT | FAILED |
| ROLLING_BACK | CANCELLING |
| ROLLED_BACK | CANCELLED |

### Schemas (SHA-256)

| Schema | Hash |
|---|---|
| `SubmitExecutionRequest.json` | `6e0bfcf5a16d04894ab250dc60cdfb85d099794a4830a6b3fd50f494d25544bb` |
| `SubmitExecutionResponse.json` | `34ff459451b8bdcb49833344048296b0be295f8ae10742e3e48102a92b411944` |
| `ExecutionStatusResponse.json` | `ff41f2cde29a0a45ad68820c3b5bdd430028db9801d9316de12904e57f2e0e14` |
| `ExecutionResultResponse.json` | `3bd3e82750b17bf4a3f7b24077686d65d6296af858af851a4ef7646c7689ec80` |
| `CancelExecutionRequest.json` | `06c97fbb2cc0fef1f78904fb65503594c91012904217bd17ba328c164f6ce882` |
| `CancelExecutionResponse.json` | `99b74c09b89774443cd98d456c8cdefcd1916b042b6be668f0cd8f0d35b7525d` |
| `ExecutionEvidenceResponse.json` | `91723551f3e56600acc02bde1d13a43f4625e1975f546a50f9fff0da67367486` |
| `PublicErrorEnvelope.json` | `ebc6e48987807aca3117f375b3eef555a43d18f0f2e6d3767e03fe3aad49dcd7` |

**OpenAPI spec:** `docs/protocol/v1/openapi.json` (SHA-256: `66eb2768436fcdaba0b02de21b16b3296f208ec20fa3ca86892e4b7a568fcd57`)

---

## 4. SDK Inventory

**Package:** `@rohinik-org/client` v1.0.0  
**Location (SDK repo):** `C:/Users/C5182688/Documents/Rohinik/sdk/packages/client/`  
**Vendor tarball (RS1):** `app/repo-engineer/vendor/rohinik-org-client-1.0.0.tgz`

### Public API

```typescript
// Factory
createRohinikClient(options: { baseUrl: string; timeoutMs?: number }): RohinikClient

// Client
client.executions.start(req: SubmitExecutionRequest): Promise<ExecutionHandle>
client.executions.attach(executionId: string): ExecutionHandle

// Handle
handle.executionId: string
handle.status():   Promise<ExecutionStatusResponse>
handle.result():   Promise<ExecutionResultResponse>
handle.cancel(req?: CancelExecutionRequest): Promise<CancelExecutionResponse>
handle.evidence(): Promise<ExecutionEvidenceResponse>
handle.waitUntilTerminal(options?: PollOptions): Promise<ExecutionStatusResponse>
handle.waitForResult(options?: PollOptions):    Promise<ExecutionResultResponse>

// PollOptions
{ pollIntervalMs?: number; timeoutMs?: number; signal?: AbortSignal; onStatus?: (s: ExecutionStatusResponse) => void }

// Error classes
RohinikClientError  — base: .status, .envelope
ProtocolVersionError — wrong protocolVersion in response
ExecutionFailedError
ExecutionCancelledError
ExecutionTimeoutError

// Constants / types
EXECUTION_PROTOCOL_VERSION: 'v1'
PublicErrorCode
```

### Packaging

- Single bundled ESM file: `dist/index.js` (tsup `--no-splitting`)
- Zero runtime dependencies: `"dependencies": {}`
- Protocol package bundled at build time via `devDependencies`
- Tarball SHA-256: `d0d3cedd2d4008051ae3aecf534f890bd19e1b567615372db4ab4f8f596008c6`

---

## 5. Route Inventory (RS1 Server)

### Async execution routes (Stage 16A)

| Route | File | Description |
|---|---|---|
| POST `/v1/executions` | `core/runtime/server/src/routes/async-executions.ts` | Submit, fire-and-forget background |
| GET  `/v1/executions/:id` | `core/runtime/server/src/routes/async-executions.ts` | Status poll |
| GET  `/v1/executions/:id/result` | `core/runtime/server/src/routes/async-executions.ts` | Result retrieval (409 if pre-terminal) |
| POST `/v1/executions/:id/cancel` | `core/runtime/server/src/routes/async-executions.ts` | Cancel request |
| GET  `/v1/executions/:id/evidence` | `core/runtime/server/src/routes/async-executions.ts` | Evidence log |
| POST `/v1/delegations/:id/run` | `core/runtime/server/src/routes/agents.ts` | Delegation bridge — 202 + executionId |

### Pre-existing routes (unchanged, Stage 15)

13 agent runtime routes (`/v1/agents/*`, `/v1/delegations/*`, `/v1/health`, `/v1/execute`) — see Stage 15 commit `709555e`.

---

## 6. Package Inventory

| Package | Version | Location | Runtime Deps |
|---|---|---|---|
| `@rohinik-org/execution-protocol-v1` | 1.0.0 | `core/protocol/execution-v1/` | none |
| `@rohinik-org/async-execution-repository` | 1.0.0 | `core/runtime/async-execution-repository/` | none |
| `@rohinik-org/client` | 1.0.0 | SDK `packages/client/` | none (bundled) |

---

## 7. Dependency Graph

```
repo-engineer
  └── @rohinik-org/client (vendored tarball, zero deps)
        └── [bundled] @rohinik-org/execution-protocol-v1

RS1 server
  ├── @rohinik-org/execution-protocol-v1 (workspace)
  └── @rohinik-org/async-execution-repository (workspace)

@rohinik-org/execution-protocol-v1
  └── (none)

@rohinik-org/async-execution-repository
  └── (none)
```

The SDK has no runtime dependency on RS1 internals. The protocol package is the only shared contract; it flows one-way: RS1 implements it, SDK consumes it.

---

## 8. Conformance Summary

Cross-repository conformance validated by `packages/client/src/__tests__/conformance.test.ts` — a standalone mock HTTP server (port 19202) exercising all five protocol routes with a fresh `createRohinikClient` instance.

| Area | Tests | Result |
|---|---|---|
| POST `/v1/executions` shape | 1 | PASS |
| GET `/v1/executions/:id` shape | 1 | PASS |
| GET `/v1/executions/:id/result` shape | 2 | PASS |
| POST `/v1/executions/:id/cancel` shape | 2 | PASS |
| GET `/v1/executions/:id/evidence` shape | 1 | PASS |
| Additive fields tolerated (forward-compat) | 4 | PASS |
| `ProtocolVersionError` on wrong version | 1 | PASS |
| All `PublicErrorCode` values parse correctly | 2 | PASS |
| Zero runtime deps in tarball | 1 | PASS |
| `EXECUTION_PROTOCOL_VERSION` export | 1 | PASS |
| SDK required exports present | 1 | PASS |
| `waitForResult` full lifecycle | 1 | PASS |
| `waitForResult` cancel path | 1 | PASS |
| **Total** | **19** | **ALL PASS** |

---

## 9. Evidence

### Test counts

| Suite | Tests | Location |
|---|---|---|
| RS1 async-executions | 21 | `core/runtime/server/src/__tests__/async-executions.test.ts` |
| RS1 agents e2e | 27 | `core/runtime/server/src/__tests__/agents.e2e.test.ts` |
| RS1 server integration | 14 | `core/runtime/server/src/__tests__/server-integration.test.ts` |
| SDK client | 28 | `packages/client/src/__tests__/client.test.ts` |
| SDK conformance | 19 | `packages/client/src/__tests__/conformance.test.ts` |
| repo-engineer (7 files) | 42 | `app/repo-engineer/src/__tests__/` |
| **Total** | **151** | |

### Dogfooding

`app/repo-engineer` migrated to SDK in Task 6. Two commands (`plan.ts`, `execute.ts`) removed 14+ lines of hand-rolled poll loops and replaced with `execution.waitForResult(...)`. All friction documented in `app/repo-engineer/SDK-FRICTION.md`.

### Stabilization amendment (2026-08-06)

- RS1: terminal atomicity hardened; 3 regression tests added (COMPLETED/FAILED/CANCELLED atomicity)
- SDK: `waitUntilTerminal` + `waitForResult` + 3 typed error classes added
- Packaging: protocol dep moved to `devDependencies`; bundled via `--no-splitting`; zero runtime deps confirmed
- repo-engineer: hand-rolled loops replaced; direct protocol dep removed; vendor tarball updated

---

## 10. Regression Summary

### FRICTION-016 (resolved): No `waitUntilTerminal` on `ExecutionHandle`
Workaround: hand-rolled poll loops in both plan.ts and execute.ts (14 lines each). Resolution: added `waitUntilTerminal` and `waitForResult` to SDK.

### FRICTION-017 (resolved): `file:` dep in tarball breaks transitive install
Workaround: added protocol as direct dep in repo-engineer. Resolution: moved to devDependencies, bundled via tsup, zero runtime deps.

### Open friction items (roadmap input for 16B–16F)

| Item | Summary | Proposed stage |
|---|---|---|
| FRICTION-018 | Two unrelated error classes (`RohinikError` vs `RohinikClientError`) | 16E |
| FRICTION-019 | `result.output` is `unknown` — no content-type-aware coercion | 16C |
| FRICTION-020 | `DelegationRunResponse` local mirror type drifts from protocol | 16E |
| FRICTION-021 | Two separate client constructors for same endpoint | 16E |
| FRICTION-022 | No progress indication during polling — terminal UX dead zone | 16D |
| FRICTION-023 | `result()` throws 409 before terminal — caller must manage retry | 16B |

---

## 11. Known Limitations

1. **In-memory repository only.** `AsyncExecutionRepository` uses a `Map<string, AsyncExecutionRecord>`. All records are lost on process restart. Persistence belongs to a future stage.

2. **No idempotency enforcement.** `idempotencyKey` is accepted and stored but not enforced — submitting the same key twice creates two independent records. Full idempotency enforcement is a future stage.

3. **No streaming.** Execution progress is only observable via polling. Server-sent events or WebSocket streaming belongs to Stage 16B.

4. **`result.output` is untyped.** Output is `unknown` — consumers must cast. Content-type-aware typed accessors belong to Stage 16C.

5. **Two client surfaces.** `repo-engineer` constructs both a `RohinikClient` (pre-SDK, covers agent/health routes) and a `createRohinikClient` (SDK, covers execution routes). A unified client belongs to Stage 16E.

6. **No cancellation propagation.** Cancelling an async execution cancels the protocol record but does not interrupt the in-flight background computation.

---

## 12. Roadmap to 16B

The following stage boundaries are proposed based on SDK-FRICTION.md evidence. They are not frozen — the Stage 16B AFS will set its own boundaries after planning.

| Stage | Theme | Primary driver |
|---|---|---|
| 16B | Streaming execution | FRICTION-023 (result() 409 design), add SSE/poll-stream surface |
| 16C | Typed output | FRICTION-019 (output: unknown), add content-type-aware result accessors |
| 16D | Progress UX | FRICTION-022 (no progress), add `onStatus` async iterator, SDK progress helpers |
| 16E | Client unification | FRICTION-018/020/021 (two clients, two error classes, mirror type drift) |
| 16F | Persistence + idempotency | Limitation 1 + 2 above |

Priority for 16B: address the protocol design smell (FRICTION-023) so the `waitForResult` abstraction becomes unnecessary for callers that want fine-grained control, while keeping it as the high-level default.

---

## Release Gate

This stage is **RELEASED** as `v0.16.0-stage16a`.

Git tag: `stage-16a-freeze`  
Release: `v0.16.0-stage16a`

All tests pass. Protocol, SDK, and routes are frozen at the hashes recorded in section 3 and 4. No changes to protocol schemas, route signatures, or SDK public API are permitted under this version.
