# AFS-015F — Stage 15F Closure: Agent Evaluation and Reliability Authority

## Status: FROZEN

Stage 15F is closed. `@rohinik-org/agent-evaluation` is frozen at Tasks 14–15.
No changes to evaluation verdicts, reliability score derivation, or policy
change routing without a new AFS superseding this document.

---

## Scope

Stage 15F establishes the boundary between execution and quality. An agent
that completes a run has demonstrated execution capability only. Outcome
quality, alignment, and reliability are separate properties that require
independent evaluation evidence.

**Three critical invariants:**

1. **Execution success ≠ outcome quality.** A run that completes is not
   thereby good. Evaluation assesses dimensions independently.

2. **Outcome quality ≠ reliability authority.** A single good result does not
   establish reliability. Reliability scores derive only from accumulated
   independent evaluation evidence, never from run completion flags.

3. **Learned policy changes route through Stage 13.** When evaluation evidence
   warrants a behavior change, the change is proposed as a `PolicyChangeRequest`
   that routes to the Stage 13 policy layer. `AgentDefinition` and
   `AgentVersion` are never mutated directly.

**Package:** `@rohinik-org/agent-evaluation`
**Path:** `core/runtime/agent-evaluation`
**Tasks covered:** Task 14, Task 15
**Depends on:** AFS-015A (`@rohinik-org/agent-ir`)

---

## Frozen Exports

### Task 14 — Agent Evaluation

| Export | Kind |
|---|---|
| `EvaluationId` | branded ID |
| `EvaluationVerdict` | frozen const enum (3 values) |
| `EvaluationDimension` | frozen const enum (4 values) |
| `EvaluationEvidence` | interface |
| `EvaluationRecord` | interface |
| `EvaluationSummary` | type alias |
| `EvaluationRepository` | interface |
| `InMemoryEvaluationRepository` | class |
| `RecordEvaluationParams` | interface |
| `EvaluationService` | class |

**Verdict invariants:**

| Verdict | Semantics |
|---|---|
| `PASS` | Evaluation criterion met |
| `FAIL` | Evaluation criterion not met |
| `INCONCLUSIVE` | Insufficient evidence to determine outcome |

No `SUCCESS`, `EXECUTED`, `COMPLETED`, or `ERROR` verdict exists or may be
added. Those describe execution status, not outcome quality.

**Dimension invariants:**

| Dimension | What is evaluated |
|---|---|
| `QUALITY` | Output quality relative to task intent |
| `SAFETY` | Adherence to safety constraints |
| `RELIABILITY` | Consistency of outcomes across evaluations |
| `ALIGNMENT` | Alignment with operator values and policy |

**Evaluation invariants:**
- Every record carries `evaluatorId` — anonymous evaluations are not valid
- Every record links to `runId` and `agentId` — traceability mandatory
- `summarize()` counts verdicts per dimension from a record set
- `EvaluationRecord` is JSON-safe — no functions or class instances

### Task 15 — Reliability Authority

| Export | Kind |
|---|---|
| `ReliabilityScoreId` | branded ID |
| `PolicyChangeRequestId` | branded ID |
| `ReliabilityScore` | interface |
| `PolicyChangeStatus` | frozen const enum (4 values) |
| `PolicyChangeRequest` | interface |
| `ReliabilityScoreRepository` | interface |
| `PolicyChangeRequestRepository` | interface |
| `InMemoryReliabilityScoreRepository` | class |
| `InMemoryPolicyChangeRequestRepository` | class |
| `RequestPolicyChangeParams` | interface |
| `ReliabilityService` | class |

**Reliability score invariants:**

| Field | Constraint |
|---|---|
| `derivedFrom` | Always `'evaluation-evidence'` — literal type, not a flag |
| `passRate` | `passed / total` from `EvaluationRecord[]`; 0 when no records |
| `evaluationCount` | Count of records passed to `computeScore()` |

`computeScore()` signature: `(agentId, versionId, records: ReadonlyArray<EvaluationRecord>)` —
takes evaluation records, not run records. Execution status is structurally
absent from the input type.

**Policy change invariants:**
- `requestPolicyChange()` creates a `PolicyChangeRequest` with status `PENDING`
- Status never auto-advances to `APPLIED` — routing to Stage 13 is caller's responsibility
- `AgentDefinition` and `AgentVersion` are not referenced in this package
- `loadPending()` returns only PENDING requests for operator review

---

## Constitutional Laws Encoded

| Law | Encoding |
|---|---|
| LAW-150: evaluation independence | `EvaluationVerdict` has no SUCCESS/EXECUTED/COMPLETED — execution excluded structurally |
| LAW-151: reliability from evidence | `ReliabilityScore.derivedFrom` is literal `'evaluation-evidence'`; `computeScore()` takes `EvaluationRecord[]` |
| LAW-152: policy via Stage 13 | `PolicyChangeRequest` is a proposal record; `AgentDefinition` never imported or mutated |
| LAW-153: evaluator identity | `EvaluationRecord.evaluatorId` required — anonymous evaluation not valid |

---

## Test Evidence

18 tests pass across:

| Suite | Tests |
|---|---|
| `agent-evaluation: EvaluationVerdict and EvaluationDimension` | 3 |
| `agent-evaluation: EvaluationService` | 6 |
| `agent-evaluation: ReliabilityService` | 9 |

**Commit:** `fbab665`

---

## Downstream Verification

Verified against AFS-015A:
- Only `AgentId`, `AgentRunId`, `AgentVersionId` consumed from `@rohinik-org/agent-ir`
- No admission, lifecycle, delegation, coordination, or oversight logic imported
- `AgentDefinition` and `AgentVersion` are not referenced

---

## Frozen Constraints for Downstream Stages

1. `EvaluationVerdict` has exactly 3 values. No execution-status values may be added.
2. `EvaluationDimension` has exactly 4 values. No `EXECUTION` or `PERFORMANCE` kind without a new AFS.
3. `ReliabilityScore.derivedFrom` is the literal `'evaluation-evidence'` — cannot be widened.
4. `computeScore()` must take `EvaluationRecord[]`, never `AgentRun[]` or boolean flags.
5. `PolicyChangeRequest` status `PENDING` never auto-advances — Stage 13 owns routing.
6. `AgentDefinition` and `AgentVersion` are not mutated by this package or any package depending on it for reliability computation.

---

## Release Gate

- [x] All 18 tests pass
- [x] `typecheck` clean (zero errors)
- [x] ESM build clean (`dist/index.js` + `dist/index.d.ts`)
- [x] Single runtime dependency: `@rohinik-org/agent-ir` only
- [x] Verified against AFS-015A
- [x] `stage-15f-evidence.json` produced
- [x] Freeze commit tagged `stage-15f-freeze`

---

## Stage 15 Closure

With Stage 15F frozen, Stage 15 (Governed Agent Runtime and Multi-Agent
Orchestration) is complete:

| Stage | Package | Tasks | Status |
|---|---|---|---|
| 15A | `agent-ir` | 1–3 | FROZEN |
| 15B | `agent-runtime` | 4–6 | FROZEN |
| 15C | `agent-delegation` | 7–8 | FROZEN |
| 15D | `agent-coordination` | 9–11 | FROZEN |
| 15E | `agent-oversight` | 12–13 | FROZEN |
| 15F | `agent-evaluation` | 14–15 | FROZEN |
