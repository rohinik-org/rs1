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
