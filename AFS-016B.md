# AFS-016B — Stage 16B Streaming Architecture Freeze

**Status:** FROZEN  
**Date:** 2026-08-07  
**RS1 HEAD:** `3f4f643552086e5aa32b0dd5a08c7773f37c6f46`  
**SDK HEAD:** `380e030cb0f0768015a8487d0e17b1c735cdfbac`  
**Tag (RS1):** `stage-16b-streaming-freeze`  
**Tag (SDK):** `stage-16b-client-streaming-freeze`  
**Coordinated tag:** `v0.16.1-stage16b`

---

## Six Constitutional Statements

These statements are immutable constraints on all future streaming work.
Removing or weakening any of them requires an AFS amendment and a new freeze.

1. **Observation is not execution.**  
   The event stream is a read-only view of execution state. Consuming events
   has no side effect on the execution itself.

2. **Disconnect is not cancellation.**  
   A client closing its SSE connection — or breaking out of an `events()`
   iterator — does not cancel the execution. The execution continues until
   its own terminal state is reached.

3. **Cancellation request is not cancellation completion.**  
   `CANCELLATION_REQUESTED` is a durable intent signal. `EXECUTION_CANCELLED`
   is the terminal fact. The stream must remain open between the two.
   Callers must not assume terminal state from the request event alone.

4. **Transport fallback is not execution fallback.**  
   When `streamMode:'auto'` degrades from SSE to poll, only the observation
   channel changes. The execution itself is unaffected. No events are
   fabricated or omitted due to transport switching.

5. **Partial output is not terminal output.**  
   `PARTIAL_OUTPUT` events carry streaming chunks from the provider.
   They do not indicate completion. Terminal output is accessible only after
   `EXECUTION_COMPLETED` via `GET /v1/executions/:id/result`.

6. **Public execution events are Rohinik-owned, not provider-owned.**  
   Providers may not emit `PublicEventKind` events directly. All public events
   are emitted by RS1 runtime infrastructure. Provider signals are translated
   at the supervisor boundary.

---

## Event Kind Inventory

Source: `core/protocol/execution-v1/src/events.ts`  
SHA-256: `455b6e6e93db87da38995fcabc62e1e14943730db3d66c9f7cfcb0de3338c133`

| Kind | Terminal | Payload required fields |
|------|----------|------------------------|
| `EXECUTION_ACCEPTED` | no | `submittedAt` |
| `EXECUTION_ADMITTED` | no | `admittedAt` |
| `EXECUTION_STARTED` | no | `startedAt` |
| `STATUS_CHANGED` | no | `previousState`, `newState` |
| `PROGRESS` | no | `message` |
| `PARTIAL_OUTPUT` | no | `chunk`, `chunkIndex` |
| `USAGE_OBSERVED` | no | _(none required)_ |
| `WAITING` | no | _(none required)_ |
| `CANCELLATION_REQUESTED` | no | `requestedAt` |
| `EXECUTION_COMPLETED` | **yes** | `completedAt`, `totalDurationMs` |
| `EXECUTION_FAILED` | **yes** | `errorCode`, `message`, `failedAt` |
| `EXECUTION_CANCELLED` | **yes** | `cancelledAt` |

Terminal set: `{ EXECUTION_COMPLETED, EXECUTION_FAILED, EXECUTION_CANCELLED }`

---

## Event Schema Hashes

All schemas defined in `ExecutionEventEnvelope` + per-kind payload schemas.  
Schema base URI: `https://rohinik.org/schemas/execution-protocol/v1/events`

| Schema | SHA-256 of source (events.ts lines 138–288) |
|--------|---------------------------------------------|
| `ExecutionEventEnvelope` | included in events.ts hash above |
| 12 payload schemas | included in events.ts hash above |

Source file SHA-256 covers all schema definitions:  
`455b6e6e93db87da38995fcabc62e1e14943730db3d66c9f7cfcb0de3338c133`

---

## Cursor Codec

Source: `core/protocol/execution-v1/src/events.ts` (lines 27–43)

- **Type:** branded string (`string & { readonly [_cursorBrand]: true }`)
- **Encoding:** `base64url(executionId + ":" + sequence)`
- **Decoding:** split on last `:`, parse sequence as integer
- **Ownership:** assigned by the event store; callers must not construct cursors
- **Cross-execution protection:** `listAfter()` rejects cursors from other executions with `CURSOR_EXECUTION_MISMATCH`

Codec source included in events.ts hash above.

---

## Event-Store Contract

Source: `core/runtime/async-execution-event-store/src/index.ts`  
SHA-256: `558c749c53ebc51aaf5808bb9c0adb10c1665a1ed0d603b0b653637ed0bb0826`

Interface: `IAsyncExecutionEventStore`

| Method | Behaviour |
|--------|-----------|
| `append(req)` | assigns sequence (1-based, monotonic), computes cursor + contentHash; rejects post-terminal appends |
| `list(id)` | returns all events ascending |
| `listAfter(id, cursor)` | returns events with sequence > cursor.sequence; validates cursor ownership |
| `subscribe(id)` | async iterable; replays history then delivers live events; closes after terminal |

Error codes: `IDEMPOTENCY_CONFLICT`, `CURSOR_EXECUTION_MISMATCH`, `CURSOR_INVALID`,  
`TERMINAL_EVENT_ALREADY_APPENDED`, `POST_TERMINAL_APPEND`

Content hash: `sha256(kind + executionId + sequence + JSON.stringify(payload))`

---

## SSE Route Inventory

### `GET /v1/executions/:executionId/events`

Source: `core/runtime/server/src/routes/execution-events.ts`  
SHA-256: `a3b42967c858467f02745430c558fafed307582f7e123a217cf21bffb458b04d`

| Property | Value |
|----------|-------|
| Method | GET |
| Auth | none (Stage 16B; 16C will add bearer) |
| Query params | `after` (optional, ExecutionCursor) |
| Response content-type | `text/event-stream` |
| Wire format | `data: <JSON>\n\n` per event |
| No cursor | replay all history then stream live |
| With `?after=cursor` | skip events ≤ cursor.sequence, then stream live |
| Terminal behaviour | server closes stream after delivering terminal event |
| Disconnect | client close sets `clientGone=true`; no execution cancellation |
| 404 | execution not found before stream opens |
| 400 | cursor malformed or belongs to different execution |

Headers emitted: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,  
`Connection: keep-alive`, `X-Accel-Buffering: no`

### Execution management routes

Source: `core/runtime/server/src/routes/async-executions.ts`  
SHA-256: `54bade7a83b838d2fa218f6b94feee3790b3ef529ab3427c26acc17b0e2b9a25`

| Route | Method | Status | Description |
|-------|--------|--------|-------------|
| `/v1/executions` | POST | 202 | Submit; idempotency key supported |
| `/v1/executions/:id` | GET | 200/404 | Status, state, terminal flag, protocolVersion |
| `/v1/executions/:id/result` | GET | 200/404/409 | Result; 409 if not terminal |
| `/v1/executions/:id/cancel` | POST | 200 | Accept cancel; `cancelAccepted` field |
| `/v1/executions/:id/evidence` | GET | 200/404 | Evidence entries array |

---

## Cancellation Precedence Policy

Source: `async-executions.ts` lines 226–360

**Race rule:** CANCELLING committed to `asyncRepo` before `execute()` returns → cancellation wins. Provider terminal returned first → completion wins.

**Durable commit sequence:**
1. Validate execution exists and is not already terminal.
2. Write `state=CANCELLING` to `asyncRepo` — durable before any response.
3. Emit `CANCELLATION_REQUESTED` event — signals intent, not terminal.
4. Return 200 with `cancelAccepted:true`.

**Background execution loop:**
- Pre-execution check: if `state===CANCELLING` when loop reads record → write `CANCELLED`, emit `EXECUTION_CANCELLED`, skip provider call.
- Post-completion check: if `state===CANCELLING` after provider returns → honour cancellation over completion result if not already `CANCELLED`.

**Post-terminal cancel:** returns `cancelAccepted:false`; state unchanged.

**CANCELLATION_REQUESTED ≠ EXECUTION_CANCELLED** — stream stays open between the two. Terminal is `EXECUTION_CANCELLED` only.

---

## SDK Streaming API Inventory

Source: `packages/client/src/execution-handle.ts`  
SHA-256: `35a87716eb051f701fa5c24226227ac261be5fc84ad07cd19ca672a908beceda`

### `ExecutionHandle` methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `status()` | `Promise<ExecutionStatusResponse>` | GET status |
| `result()` | `Promise<ExecutionResultResponse>` | GET result; 409 if not terminal |
| `evidence()` | `Promise<ExecutionEvidenceResponse>` | GET evidence entries |
| `cancel(body?)` | `Promise<CancelExecutionResponse>` | POST cancel |
| `waitUntilTerminal(opts?)` | `Promise<ExecutionStatusResponse>` | Poll until terminal |
| `waitForResult(opts?)` | `Promise<ExecutionResultResponse>` | Poll then result; throws on CANCELLED/FAILED |
| `events(opts?)` | `AsyncIterable<PublicExecutionEvent>` | Stream events |

### `events()` options (`EventsOptions`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `streamMode` | `'auto' \| 'sse' \| 'poll'` | `'auto'` | Transport strategy |
| `signal` | `AbortSignal` | — | External abort |
| `reconnect` | `boolean` | `true` | Reconnect on SSE drop (sse/auto) |
| `pollIntervalMs` | `number` | `500` | Poll interval (poll/auto fallback) |
| `timeoutMs` | `number` | `30000` | Total deadline |
| `onStreamModeChange` | `(mode) => void` | — | Called on SSE→poll transition |

### Error classes

| Class | Extends | Notes |
|-------|---------|-------|
| `RohinikClientError` | `Error` | Base; carries `.status?: number` |
| `ProtocolVersionError` | `RohinikClientError` | Wrong `protocolVersion` in response |
| `ExecutionFailedError` | `RohinikClientError` | `.executionId`, `.terminalState` |
| `ExecutionCancelledError` | `ExecutionFailedError` | `terminalState='CANCELLED'` |
| `ExecutionTimeoutError` | `RohinikClientError` | Poll/stream timeout |

---

## Transport Fallback Semantics

`streamMode:'auto'` behaviour:

1. Attempt SSE (`GET /v1/executions/:id/events`).
2. On network failure or non-2xx: mark `sseExhausted=true`.
3. On clean stream close without terminal event and `reconnect:true`: reconnect with `?after=lastCursor`.
4. When SSE budget exhausted: call `onStreamModeChange('poll')`, then yield from `_pollStream()`.

`poll` mode constraints:
- Synthesizes only terminal lifecycle events (`EXECUTION_COMPLETED`, `EXECUTION_CANCELLED`, `EXECUTION_FAILED`).
- Does NOT fabricate `PROGRESS`, `PARTIAL_OUTPUT`, `STATUS_CHANGED`, or any other non-terminal event.
- Cursor on synthesized events is `base64url(executionId:sequence)` — structurally valid but not backed by the event store.

Duplicate suppression: events with `sequence <= lastSequence` are silently dropped.  
Monotonic enforcement: `sequence !== lastSequence + 1 && lastSequence > 0` → throws `RohinikClientError`.

---

## repo-engineer Acceptance Evidence

Migration: Task 7 (`8869879ebb3a5a0561251d99f9d98454d00264f7`)

| File | Change |
|------|--------|
| `src/pipeline/stream-execution.ts` | New module: `streamExecution()` wraps `events({streamMode:'auto'})` |
| `src/commands/execute.ts` | Replaced `waitForResult()` with `streamExecution()` |
| `SDK-FRICTION.md` | FRICTION-022 resolved; FRICTION-024 documented |

`streamExecution()` contract:
- Returns `StreamOutcome`: `{status:'completed'|'cancelled'|'failed', executionId, error?}`
- AbortSignal wires to `execution.cancel()` once, then waits for terminal
- `exactOptionalPropertyTypes` compatibility: conditional spread for `onStreamModeChange`

FRICTION items resolved in 16B: **FRICTION-016**, **FRICTION-017**, **FRICTION-022**  
FRICTION items documented (unresolved): FRICTION-018, FRICTION-019, FRICTION-020, FRICTION-021, FRICTION-024

---

## Task 8 Conformance Results

Run individually (parallel run conflicts on Windows named pipe; pre-existing):

### Boundary 1 — SDK mock target (SDK repo)

| File | Tests | Result |
|------|-------|--------|
| `src/__tests__/events.test.ts` | 8 | PASS |
| `src/__tests__/stream-mode.test.ts` | 12 | PASS |

### Boundary 2 — Real RS1 + mock provider

| File | Tests | Result |
|------|-------|--------|
| `streaming-conformance.test.ts` (port 19600) | 11 | PASS |
| `compat-floor.test.ts` (port 19700) | 18 | PASS |

### Boundary 3 — Clean external packed consumer

| File | Tests | Result |
|------|-------|--------|
| `boundary3-external-consumer.test.ts` (port 19800) | 1 | PASS |

Total Task 8: **50 tests, all pass in isolation.**

Boundary 3 proof: tarball installed via `npm install file:<path>` in `os.tmpdir()` project with no monorepo context. `dependencies: {}` verified in packed `package.json`.

---

## Stage 16A Compatibility-Floor Results

Four-column matrix verified by `compat-floor.test.ts`:

| Column | Tests | Result |
|--------|-------|--------|
| Protocol compatibility | 6 | PASS |
| SDK API compatibility | 4 | PASS |
| Stage 16A conformance | 4 | PASS |
| Performance canary | 4 | PASS |

Performance bounds met: submit→terminal < 5 000 ms; p50 of 5 consecutive < 3 000 ms; SSE overhead < 2× poll latency.

---

## Total Test Counts

| Repository / Package | Files | Tests | Status |
|----------------------|-------|-------|--------|
| RS1 monorepo (all packages) | 613 pass, 1 fail* | 6 949 pass | * pre-existing parallel conflict |
| SDK `@rohinik-org/client` | 4 | 67 | PASS |
| repo-engineer | 9 | 52 | PASS |
| **Total** | — | **7 068** | — |

\* The failing file (`boundary3-external-consumer.test.ts` or `cancellation.test.ts`
when run in parallel) fails due to Windows named pipe `\\.\pipe\rohinik-runtime`
EADDRINUSE when multiple `createProductionHost()` instances start concurrently.
Each test file passes in isolation. This is a pre-existing infrastructure limit,
not a Stage 16B regression.

---

## Known Limitations and Unresolved Friction

### FRICTION-018 — Two incompatible error classes

`RohinikError` (repo-engineer internal) and `RohinikClientError` (SDK) are unrelated.
Callers must union-catch with separate property access.

### FRICTION-019 — `result.output` is `unknown`

No content-type-aware accessor. Callers must `String(result.output)`.
Ideal: `textResult()` / `jsonResult<T>()` typed accessors.

### FRICTION-020 — `DelegationRunResponse` type drift risk

Local mirror type in repo-engineer; must be manually updated when protocol evolves.

### FRICTION-021 — Two clients, duplicated config

`RohinikClient` (legacy) and `createRohinikClient` (SDK) require identical endpoint config passed twice.

### FRICTION-024 — `exactOptionalPropertyTypes` incompatibility

Passing `callback | undefined` to optional callback field fails with strict TS.
Workaround: conditional spread. SDK should use plain `?:` in `EventsOptions`.

### Infrastructure — Windows named pipe parallelism

`\\.\pipe\rohinik-runtime` allows only one holder. Test suite parallelism
causes EADDRINUSE. Affects CI on Windows when all server tests run concurrently.
Mitigation: run each test file with `--pool=forks` or sequential scheduling.

### Store implementation — InMemory only

`InMemoryAsyncExecutionEventStore` and `InMemoryAsyncExecutionRepository` used throughout.
Persistent store injection planned for Stage 16C.

---

## Roadmap to Stage 16C

Stage 16C scope (out of scope for this freeze):

1. **Typed event schemas** — JSON Schema validation at publish time; schema registry API.
2. **Persistent event store** — inject durable store; `IAsyncExecutionEventStore` already abstracted.
3. **Bearer auth on streaming routes** — `GET /v1/executions/:id/events` currently unauthenticated.
4. **Result content-type field** — `ExecutionResultResponse.contentType` to resolve FRICTION-019.
5. **Unified error class** — reconcile `RohinikError` and `RohinikClientError` shapes.
6. **Parallel test isolation** — replace named-pipe runtime identifier with port-scoped unique identifier to allow concurrent test files on Windows.
7. **SDK unified client** — single `createRohinikClient` covering all RS1 routes; retire legacy `RohinikClient`.

---

## Frozen Artefact Hashes

| Artefact | SHA-256 |
|----------|---------|
| `protocol/execution-v1/src/events.ts` | `455b6e6e93db87da38995fcabc62e1e14943730db3d66c9f7cfcb0de3338c133` |
| `async-execution-event-store/src/index.ts` | `558c749c53ebc51aaf5808bb9c0adb10c1665a1ed0d603b0b653637ed0bb0826` |
| `server/src/routes/execution-events.ts` | `a3b42967c858467f02745430c558fafed307582f7e123a217cf21bffb458b04d` |
| `server/src/routes/async-executions.ts` | `54bade7a83b838d2fa218f6b94feee3790b3ef529ab3427c26acc17b0e2b9a25` |
| `sdk/packages/client/src/execution-handle.ts` | `35a87716eb051f701fa5c24226227ac261be5fc84ad07cd19ca672a908beceda` |
| `sdk/packages/client/dist/index.js` | `5a60e2f948069aaa86a91c735fc482427fe9dbc81fc2d56aa634570a51181af7` |

---

*End of AFS-016B. Amendments require new AFS document with explicit delta and re-freeze.*
