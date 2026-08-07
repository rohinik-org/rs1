# SDK Friction Log — Stage 16A Task 6 Dogfooding

Recorded during first migration of `repo-engineer` from raw `RohinikClient` + manual REST calls
to `@rohinik-org/client` for async execution retrieval.

Each item names the friction, the workaround applied, and the ideal SDK surface.

---

## FRICTION-016: No `waitUntilTerminal` on `ExecutionHandle` ✅ RESOLVED

**Encountered:** Both `plan.ts` and `execute.ts` need to poll until the async execution is done
before calling `result()`. The SDK exposes no convenience for this.

**Workaround:** Hand-rolled `while (true)` loop calling `execution.status()` with
`setTimeout(500ms)` between polls and a caller-supplied deadline. 14 lines of boilerplate,
duplicated in both commands.

**Resolution (stabilization amendment):** Added `waitUntilTerminal(options?)` and
`waitForResult(options?)` to `ExecutionHandle`. `waitForResult` throws `ExecutionCancelledError`
or `ExecutionFailedError` on non-COMPLETED terminal states, `ExecutionTimeoutError` on timeout.
Supports `pollIntervalMs`, `timeoutMs`, `signal`, `onStatus`. Plan.ts and execute.ts now use
`execution.waitForResult(...)` — poll loops removed.

**Impact:** Resolved.

---

## FRICTION-017: `file:` dependency inside packed tarball breaks transitive install ✅ RESOLVED

**Encountered:** `@rohinik-org/client`'s `package.json` references the protocol package as
`"file:./vendor/rohinik-org-execution-protocol-v1-1.0.0.tgz"`. When `client` is itself packed
into a tarball and installed in repo-engineer, pnpm cannot resolve the nested `file:` path —
it points into the unpacked client directory which doesn't exist at install time.

**Workaround (Task 6):** Added `@rohinik-org/execution-protocol-v1` as a direct dependency of
repo-engineer, hoisting it into the workspace so pnpm satisfies the peer.

**Resolution (stabilization amendment):** Moved `@rohinik-org/execution-protocol-v1` to
`devDependencies` in the client package and configured tsup with `--no-splitting` to inline
all protocol code into `dist/index.js`. The packed tarball now has `"dependencies": {}` —
consumers install one artifact with no transitive deps. Repo-engineer's direct protocol dep
removed.

**Impact:** Resolved.

---

## FRICTION-018: Two separate error classes with incompatible shapes

**Encountered:** repo-engineer already catches `RohinikError` (from `../client/types.ts`) for
agent/health/execute routes. The SDK throws `RohinikClientError` (from `@rohinik-org/client`).
These are unrelated classes with different property names (`code` vs `status`).

**Workaround:** Union catch: `err instanceof RohinikError || err instanceof RohinikClientError`,
with separate property access via casts.

**Ideal:** Either unify under one error class, or have `RohinikClientError` carry both `.code`
and `.status`, matching the shape callers already handle for the legacy client.

**Impact:** Medium — catch blocks become conditionally branched; easy to miss one path.

---

## FRICTION-019: `result.output` is `unknown` — no content-type-aware coercion

**Encountered:** After polling and calling `execution.result()`, `result.output` is typed as
`unknown`. repo-engineer must `String(result.output)` to get text. No schema, no type guard,
no indication whether output is structured JSON, a plain string, or a blob reference.

**Workaround:** `String(result.output)` — same cast as before Task 6, just moved from
`runResponse.output` to `result.output`.

**Ideal:** Protocol-level content type awareness. Either the result carries a `contentType`
field matching the submission's `contentType`, or the SDK provides a typed accessor:
```ts
execution.textResult()   // asserts string
execution.jsonResult<T>() // parses + validates
```

**Impact:** Medium — repo-engineer can tolerate the cast. LLM-generated structured outputs
(JSON patches, schemas) will be silently coerced to strings, making downstream parsing
fragile.

---

## FRICTION-020: `delegationRun` response shape changed; `DelegationRunResponse` type stale

**Encountered:** The local `types.ts` had `DelegationRunResponse.output` and
`.delegatedTaskState`. Task 5 changed the route to 202 — these fields are gone, replaced by
protocol fields (`state`, `protocolVersion`, `submittedAt`). Had to update the type manually.

**Workaround:** Updated `DelegationRunResponse` in `types.ts` to match the new 202 shape.
Removed `output` and `delegatedTaskState`. Callers updated.

**Ideal:** The agent delegation layer should natively speak `SubmitExecutionResponse` from
`@rohinik-org/execution-protocol-v1` — no need for a separate local mirror type.

**Impact:** Low as a one-time migration cost; medium as an ongoing schema-drift risk if the
protocol evolves and the local mirror isn't updated.

---

## FRICTION-021: SDK client construction requires duplication of endpoint config

**Encountered:** repo-engineer constructs two clients pointing at the same endpoint:
1. `new RohinikClient({ endpoint })` — for agent/health/execute/delegation routes
2. `createRohinikClient({ baseUrl: endpoint })` — for async execution polling

Both need identical `timeoutMs`. No shared config object exists.

**Workaround:** Pass `resolveTimeoutMs()` twice, once to each constructor.

**Ideal:** Either unify into one client that covers all RS1 routes (the eventual goal), or
provide a factory that accepts a base config and returns both sub-clients from a shared
transport.

**Impact:** Low for two clients; grows as more SDK sub-resources are added.

---

## FRICTION-022: No progress indication during poll — UX dead zone ✅ RESOLVED

**Encountered:** `plan.ts` and `execute.ts` poll silently. A 30-second LLM generation looks
identical to a hung process from the terminal. No spinner, no `state` update, no elapsed-time
logging built into the SDK.

**Resolution (Task 7):** `events({ streamMode: 'auto' })` delivers a `PublicExecutionEvent`
async iterable. execute.ts now logs each event kind to stderr via `onEvent`. The dead zone
is gone — every state transition (ACCEPTED, ADMITTED, STARTED, terminal) is visible.
`onStreamModeChange` also notifies when the transport falls back from SSE to poll.

**Impact:** Resolved.

---

## FRICTION-024: `exactOptionalPropertyTypes` incompatibility in `EventsOptions`

**Encountered (Task 7):** Passing `onStreamModeChange: callbacks?.onStreamModeChange` to
`events()` fails to type-check when `exactOptionalPropertyTypes: true` is set in the consumer's
`tsconfig.json`. The SDK types `onStreamModeChange` as `((mode) => void) | undefined` but
`exactOptionalPropertyTypes` treats an explicitly `undefined`-assigned optional property
differently from an absent property.

**Workaround:** Spread conditionally:
```ts
...(callbacks?.onStreamModeChange ? { onStreamModeChange: callbacks.onStreamModeChange } : {})
```

**Ideal:** SDK should not require callers to jump through spread gymnastics for optional callbacks.
Either remove `undefined` from the union in the type (use plain `?:` syntax), or annotate the
SDK's own tsconfig to avoid `exactOptionalPropertyTypes` and document the consumer contract.

**Impact:** Low but noisy — affects any consumer with strict tsconfig settings.

---


**Encountered:** The poll loop calls `status()` to check terminal, then calls `result()`.
If the status check races (unlikely in current single-threaded flow, but possible under
load), `result()` throws `RohinikClientError` with a 409. Callers must handle this error
separately from genuine failures.

**Workaround:** Poll loop correctly gates `result()` behind a terminal check. Error handling
in the `catch` block wraps both 409 and other errors.

**Ideal:** `result()` should accept a `{ wait: true }` option that internally retries on 409,
or `waitUntilTerminal` + `result()` should be one atomic operation that the SDK guarantees
won't 409.

**Impact:** Low in practice; design smell — the caller must know about protocol-internal retry
semantics.
