# Developer SDK Friction Log

Observations from real application development against Rohinik HTTP API.
Used to inform Stage 16 Developer SDK design.

**Rule:** Do not implement SDK fixes immediately. Record here. When 40–50 entries exist,
use as requirements input for SDK extraction.

---

## FRICTION-001

**Source:** app/repo-engineer  
**Phase:** A  
**Area:** HTTP client — ExecuteRequest construction  
**Frequency:** Every command that calls execute  
**Severity:** Medium

**Problem:**  
`content`, `contentType`, and `constraints` are assembled identically in `assess.ts`
and `plan.ts`. Any new command must repeat the same pattern.

**Current workaround:**  
Inline in each command file.

**Potential SDK direction:**  
Typed factory method: `ExecuteRequest.forText(content, { allowReasoning?: boolean })`.

**Do not implement yet:** Yes

---

## FRICTION-002

**Source:** app/repo-engineer  
**Phase:** A  
**Area:** HTTP client — health check boilerplate  
**Frequency:** Every command  
**Severity:** Medium

**Problem:**  
Health check + state validation + error formatting is copied verbatim into each command.
Any new command must repeat 10 lines of identical error handling.

**Current workaround:**  
Copy-paste in `assess.ts` and `plan.ts`.

**Potential SDK direction:**  
`client.assertReady()` that throws `RohinikError` if not READY/DEGRADED, or embed an
optional readiness check into `execute()` via config flag.

**Do not implement yet:** Yes

---

## FRICTION-003

**Source:** app/repo-engineer  
**Phase:** A  
**Area:** HTTP client — decision trace extraction  
**Frequency:** Every command that fetches decision trace  
**Severity:** Low–Medium

**Problem:**  
`getDecision()` returns `trace: unknown`. Event count extraction requires runtime type
narrowing with multiple branches. Trace shape is opaque and undocumented at the SDK level.

**Current workaround:**  
`assess.ts` has a 5-line type-narrowing block to extract event count.

**Potential SDK direction:**  
`client.getDecisionSummary(requestId)` returning `{ eventCount: number; tiers: string[]; latencyMs: number }`.

**Do not implement yet:** Yes

---

## FRICTION-004

**Source:** app/repo-engineer  
**Phase:** B  
**Area:** Structured output — plan content is raw string  
**Frequency:** Whenever Rohinik response is consumed as structured data  
**Severity:** High (future)

**Problem:**  
Rohinik returns `output: unknown`. Application must treat it as a raw string and parse
or display it opaquely. There is no schema, no validation, and no typing for structured
responses (e.g., a plan with steps, a list of files).

**Current workaround:**  
`String(result.output)` everywhere.

**Potential SDK direction:**  
Optional `responseSchema` field on `ExecuteRequest` (JSON Schema or Zod) that Rohinik
validates against, plus typed `execute<T>(req, schema)` on the client.

**Do not implement yet:** Yes

---

## FRICTION-005

**Source:** app/repo-engineer  
**Phase:** A–B  
**Area:** Context assembly — file-to-prompt pipeline  
**Frequency:** Every command (assess, plan)  
**Severity:** Medium

**Problem:**  
The pattern `collectFiles → buildPrompt → truncate → execute` is repeated in every
command. It's application-level glue with no SDK equivalent, forcing every consumer
to implement their own context assembly.

**Current workaround:**  
`file-collector.ts` + `assessment-builder.ts` + `plan-builder.ts` in app-local pipeline/.

**Potential SDK direction:**  
`ContextBuilder` helper: `new ContextBuilder().addFiles(paths).addText(str).build(maxChars)`.

**Do not implement yet:** Yes

---

## FRICTION-006

**Source:** app/repo-engineer  
**Phase:** C  
**Area:** Agent identity — hardcoded instance IDs  
**Frequency:** Every agent call  
**Severity:** High

**Problem:**  
`inst-coordinator-1` and `inst-worker-1` are hardcoded string constants in the
application because the server's `MockPolicyPort` only knows those two identities.
No mechanism to register new agent identities at runtime or discover which instances
are valid for a given deployment. Every new application must know the magic strings.

**Current workaround:**  
`const COORD_INSTANCE = 'inst-coordinator-1'` hard-coded in plan.ts.

**Potential SDK direction:**  
`AgentRegistry` with `listInstances()` endpoint, or identity seeding via BootstrapPlan
config file rather than code-only MockPolicyPort.

**Do not implement yet:** Yes

---

## FRICTION-007

**Source:** app/repo-engineer  
**Phase:** C  
**Area:** Agent delegation — 6-step boilerplate for one reasoning call  
**Frequency:** Every agent-delegated reasoning task  
**Severity:** High

**Problem:**  
To invoke reasoning via the agent runtime, a caller must: admit×2 → start → delegate
→ accept → run → acceptResult. Six HTTP round-trips for what was previously one
`POST /v1/execute`. The extra steps enforce the attenuation/evidence contract, but the
application has no way to express "just delegate a reasoning task to a worker and get
the output" without implementing all 6 steps manually.

**Current workaround:**  
6 sequential `try/catch` blocks in plan.ts, each with manual error handling.

**Potential SDK direction:**  
`client.delegateTask({ instanceId, prompt, budget })` that encapsulates the full
admit→start→delegate→accept→run→acceptResult flow and returns `{ output, evidence }`.

**Do not implement yet:** Yes

---

## FRICTION-008

**Source:** app/repo-engineer  
**Phase:** C  
**Area:** Agent delegation — no structured output from /run  
**Frequency:** Every delegation run  
**Severity:** Medium

**Problem:**  
`POST /v1/delegations/:id/run` returns `{ ok, executionId, output, delegatedTaskState }`.
`output` is `unknown`. Application must `String(runResponse.output)` with no guarantee
that the output is well-formed text. Same issue as FRICTION-004 but worse: here the
output came through two indirections (delegation + execution) so schema drift is harder
to detect.

**Current workaround:**  
`String(runResponse.output)` in plan.ts.

**Potential SDK direction:**  
Schema validation at the delegation boundary — same `execute<T>(req, schema)` idea
from FRICTION-004 applied to delegationRun.

**Do not implement yet:** Yes

---

## FRICTION-009

**Source:** app/repo-engineer  
**Phase:** C  
**Area:** Agent delegation — executionTimeMs unavailable  
**Frequency:** Every delegated plan  
**Severity:** Low

**Problem:**  
`POST /v1/delegations/:id/run` returns `executionId` but not `executionTimeMs`.
The plan artifact records `executionTimeMs: 0` as a placeholder. The actual duration
is inside the evidence chain but requires a separate `GET /v1/agent-runs/:id/evidence`
fetch and event timestamp math to reconstruct.

**Current workaround:**  
`executionTimeMs: 0` in the saved plan artifact.

**Potential SDK direction:**  
Include `durationMs` in the delegation run response, computed from execution-started
to execution-completed event timestamps in AgentEventStore.

**Do not implement yet:** Yes

---

## FRICTION-010

**Source:** app/repo-engineer  
**Phase:** D  
**Area:** Execution — no streaming, blocking delegation run  
**Frequency:** Every patch generation (potentially 30–120 seconds)  
**Severity:** Critical

**Problem:**  
`POST /v1/delegations/:id/run` blocks until reasoning completes. No progress events,
no partial output, no heartbeat. For patch generation against a real codebase the
response may take 60–120 seconds. The caller has no way to know whether the server
is working or hung. UX is a blank terminal.

**Current workaround:**  
Silent blocking call in execute.ts. User must wait with no feedback.

**Potential SDK direction:**  
Server-sent events stream on `GET /v1/delegations/:id/stream`, or polling endpoint
`GET /v1/delegations/:id/status` returning `{ state, partialOutput?, elapsedMs }`.
SDK method `delegationRunStream(id, onChunk)`.

**Do not implement yet:** Yes

---

## FRICTION-011

**Source:** app/repo-engineer  
**Phase:** D  
**Area:** Execution — no polling model for long-running tasks  
**Frequency:** Every run exceeding client timeout  
**Severity:** High

**Problem:**  
`delegationRun()` is a single HTTP request. If the reasoning provider takes longer
than `timeoutMs` (default 30 s, currently 120 s in execute.ts), the request aborts.
There is no way to re-attach to an in-progress delegation run, no job ID, no async
fire-and-retrieve pattern. A network hiccup loses the result permanently.

**Current workaround:**  
`maxLatencyMs: 120_000` in the delegation body + manually extended `timeoutMs`.
Not resilient.

**Potential SDK direction:**  
Async delegation model: `POST /v1/delegations/:id/run` returns `{ jobId }` immediately.
`GET /v1/delegations/:id/run/:jobId` polls for completion. SDK `delegationRunAsync(id)`
returns a `Job` with `.poll()` / `.await()` methods.

**Do not implement yet:** Yes

---

## FRICTION-012

**Source:** app/repo-engineer  
**Phase:** D  
**Area:** Output schema — patch diff has no validation  
**Frequency:** Every patch generation  
**Severity:** High

**Problem:**  
`delegationRun()` returns `output: unknown`. The execute command expects a unified
diff string. When a real LLM wraps output in markdown fences, produces prose, or
generates a malformed diff, `git apply` fails with a cryptic error. The application
has no way to detect the failure at the delegation boundary — only at apply time.

**Current workaround:**  
`String(runResp.output)` then `git apply`. Error surfaces only at apply step.

**Potential SDK direction:**  
`delegationRunWithSchema<T>(id, schema)` that validates output against a Zod schema
before returning. For diffs: `DiffSchema = z.string().regex(/^diff --git/)`.
Rejection should trigger an automatic retry with the validation error embedded.

**Do not implement yet:** Yes

---

## FRICTION-013

**Source:** app/repo-engineer  
**Phase:** D  
**Area:** Cancellation — no way to cancel in-flight delegation  
**Frequency:** Whenever user wants to abort a running task  
**Severity:** High

**Problem:**  
Once `POST /v1/delegations/:id/run` is called, there is no way to cancel it.
`POST /v1/delegations/:id/cancel` transitions the task state but does NOT abort
the in-progress HTTP request or stop the reasoning provider. The client's AbortSignal
times out the HTTP connection client-side, but the server-side reasoning continues
running (wasting budget).

**Current workaround:**  
`maxLatencyMs: 120_000` as a hard server-side ceiling. No client-side cancel.

**Potential SDK direction:**  
`POST /v1/delegations/:id/cancel` should abort the in-flight reasoning call on the
server. Requires reasoning provider to support cancellation tokens. SDK should expose
`job.cancel()` that fires the HTTP cancel and awaits acknowledgement.

**Do not implement yet:** Yes

---

## FRICTION-014

**Source:** app/repo-engineer  
**Phase:** D  
**Area:** Evidence retrieval — verification failure detail is truncated  
**Frequency:** Every failed verification  
**Severity:** Medium

**Problem:**  
When `pnpm test` fails, execute.ts truncates stdout+stderr to the last 30 lines.
The full verification output is in the patch verification record on disk but not
surfaced to the terminal. There is no endpoint to retrieve structured test results
— the application must parse raw test runner output itself.

**Current workaround:**  
`lines.slice(-30)` in execute.ts. Full output in `<patchId>.verified.json`.

**Potential SDK direction:**  
`POST /v1/agent-runs/:id/verify` that runs a verification command server-side,
captures structured output (exit code, test counts, failure details), and returns
a `VerificationResult` with parsed fields. Client-side parsing eliminated.

**Do not implement yet:** Yes

---

## FRICTION-015

**Source:** app/repo-engineer  
**Phase:** D  
**Area:** Rollback — no undo after failed apply  
**Frequency:** Every failed patch application  
**Severity:** Medium

**Problem:**  
`git apply` may partially apply a patch before failing. When it does, the working
tree is left in a dirty state. The execute command cannot roll back automatically
— it would need to run `git apply --reverse` or `git checkout .`, which are
potentially destructive. Nothing in Rohinik's evidence model tracks pre-apply
working tree state.

**Current workaround:**  
execute.ts exits with code 1 and prints the error. User must manually clean up.

**Potential SDK direction:**  
Pre-apply snapshot: stash or branch creation before apply. Or `git apply --check`
dry-run before actual apply, so partial-apply failures are impossible.

**Do not implement yet:** Yes
