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
