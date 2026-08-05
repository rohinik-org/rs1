# AFS-015C — Stage 15C Closure: Delegation Contracts and Authority Attenuation

## Status: FROZEN

Stage 15C is closed. `@rohinik-org/agent-delegation` is frozen at Tasks 7–8.
No changes to certificate structure, attenuation logic, task lifecycle states,
or transition maps without a new AFS superseding this document.

---

## Scope

Stage 15C establishes delegation as the creation of a signed, immutable
delegation certificate. Every authority dimension is independently monotonic
(child ≤ parent). Child execution is impossible without a valid, unrevoked
certificate. Silence is not acceptance. Submission is not acceptance.

**Package:** `@rohinik-org/agent-delegation`
**Path:** `core/runtime/agent-delegation`
**Tasks covered:** Task 7, Task 8
**Depends on:** AFS-015A (`@rohinik-org/agent-ir`), AFS-015B (`@rohinik-org/agent-runtime`)

---

## Frozen Exports

### Task 7 — Delegation Certificates and Authority Attenuation

| Export | Kind |
|---|---|
| `CertificateId` | branded ID |
| `DelegatedAuthority` | interface |
| `DelegatedBudget` | interface |
| `AttenuationResult` | interface |
| `validateAttenuation` | function |
| `DelegationCertificate` | interface |
| `IssueCertificateParams` | interface |
| `issueCertificate` | function |
| `CertificateRepository` | interface |
| `InMemoryCertificateRepository` | class |

**Certificate invariants:**
- Immutable: `Object.freeze()` applied at issuance
- Fingerprint: SHA-256 of canonical JSON with sorted arrays — deterministic
- `issueCertificate` throws `attenuation-violated: <violations>` if any dimension exceeds parent
- `InMemoryCertificateRepository.revoke()` sets `revoked: true`; all other fields unchanged

**Attenuation invariants — all 6 dimensions independently monotonic:**

| Dimension | Rule |
|---|---|
| `allowedCapabilities` | child ⊆ parent (strict subset) |
| `allowedActions` | child ⊆ parent (strict subset) |
| `maxDelegationDepth` | child < parent (strictly less — leaf nodes set to 0) |
| `maxCostUsd` | child ≤ parent |
| `maxLatencyMs` | child ≤ parent |
| `maxTokens` | child ≤ parent |

`validateAttenuation` collects **all** violations — not fail-fast.

### Task 8 — Delegated Task Lifecycle

| Export | Kind |
|---|---|
| `DelegatedTaskId` | branded ID |
| `DelegatedTaskState` | frozen const enum (9 states) |
| `DelegatedTaskTransitions` | frozen transition map |
| `DelegatedTaskTerminalStates` | frozen ReadonlySet |
| `DelegatedTask` | interface |
| `DelegatedTaskRepository` | interface |
| `InMemoryDelegatedTaskRepository` | class |
| `ProposeParams` | interface |
| `TaskOpResult` | interface |
| `DelegatedTaskService` | class |

**Lifecycle invariants:**
```
PROPOSED → OFFERED → ACCEPTED → RUNNING → SUBMITTED → ACCEPTED_RESULT
                  ↘ REJECTED_RESULT (from OFFERED or SUBMITTED)
PROPOSED/OFFERED/ACCEPTED/RUNNING → CANCELLED
RUNNING → FAILED
```
- **Silence ≠ acceptance**: `OFFERED` does not auto-advance; explicit `accept()` required
- **Submission ≠ acceptance**: `SUBMITTED` requires explicit `acceptResult()` or `rejectResult()`
- **Certificate gate**: `offer()` validates cert exists and is not revoked; rejects with `certificate-not-found` or `certificate-revoked`
- Invalid transitions rejected without mutation
- Terminal states: `ACCEPTED_RESULT`, `REJECTED_RESULT`, `CANCELLED`, `FAILED` (4)

---

## Constitutional Laws Encoded

| Law | Encoding |
|---|---|
| LAW-135: delegation attenuates authority | `validateAttenuation` — 6 dimensions, all independently ≤ parent; `issueCertificate` throws on any violation |
| LAW-137: no implicit delegation | `offer()` requires explicit cert; PROPOSED cannot advance without one |
| LAW-135 depth: no authority expansion | `maxDelegationDepth` must be strictly < parent; leaf nodes forced to 0 |

---

## Test Evidence

40 tests pass across:

| Suite | Tests |
|---|---|
| `agent-delegation: DelegatedAuthority attenuation` | 5 |
| `agent-delegation: DelegatedBudget attenuation` | 5 |
| `agent-delegation: DelegationCertificate issuance and structure` | 7 |
| `agent-delegation: DelegatedTaskState transition map` | 7 |
| `agent-delegation: DelegatedTaskService lifecycle` | 16 |

**Commit:** `5b0cfcf`

---

## Downstream Verification

Verified against AFS-015A and AFS-015B:
- IR branded types (`AgentRunId`, `AgentTaskId`, `DelegationId`) consumed via `@rohinik-org/agent-ir`
- No admission, lifecycle, or port logic duplicated from `@rohinik-org/agent-runtime`
- No Stage 9/11/13/14 imports

---

## Frozen Constraints for Downstream Stages

1. Every delegation requires a valid, unrevoked `DelegationCertificate`.
2. Authority attenuation is non-negotiable — all 6 dimensions enforced at issuance.
3. `maxDelegationDepth: 0` = leaf; cannot re-delegate.
4. Silence is not acceptance — explicit `accept()` call required to move from `OFFERED`.
5. Submission is not acceptance — explicit `acceptResult()` or `rejectResult()` required.
6. Revoked certificates are permanently revoked — no un-revoke operation.
7. No agent framework SDK in core packages.

---

## Release Gate

- [x] All 40 tests pass
- [x] `typecheck` clean (zero errors)
- [x] ESM build clean (`dist/index.js` + `dist/index.d.ts`)
- [x] Dependencies: `@rohinik-org/agent-ir` only
- [x] Verified against AFS-015A and AFS-015B
- [x] `stage-15c-evidence.json` produced
- [x] Freeze commit tagged `stage-15c-freeze`

---

## Roadmap

| Stage | Depends on |
|---|---|
| 15D Task 9–11 (coordination) | 15A + 15B + 15C — DONE, frozen |
| 15E Task 12–13 (oversight) | 15A + 15B |
| 15F Task 14–15 (evaluation, closure) | All prior |
