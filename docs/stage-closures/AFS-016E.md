# AFS-016E — Stage 16E Closure: Control Plane for AI Mutation Authority

## Status: FROZEN

Stage 16E is closed. The control plane packages are frozen at Tasks T1–T10.
No changes to approval authority, workflow state transitions, verification
contracts, recovery safety rules, or SDK handles without a new AFS superseding
this document.

---

## Scope

Stage 16E establishes the boundary between generation and mutation. An AI
system that produces a patch has produced a candidate only. Applying that
patch to a real repository requires independent approval, a recorded
checkpoint, a verification verdict, and — if mutation is partial or
indeterminate — an explicit recovery strategy.

**Five critical invariants:**

1. **approve ≠ apply.** An approval record binds a content hash to a scope
   and action type. It does not authorise any actor to apply. Applying
   requires presenting the approvalId at the apply boundary, where the server
   re-derives the binding from the artifact.

2. **apply ≠ verify.** A mutation that reaches APPLIED state has demonstrated
   that the patch was accepted by the apply mechanism. It has not demonstrated
   that the resulting working tree is correct. Verification is a separate,
   independent step.

3. **VERIFICATION_FAILED ≠ rollback authority.** A failed or inconclusive
   verification does not grant the system authority to reverse its own
   mutation. Recovery requires an explicit strategy chosen by an operator.

4. **recover ≠ automatic rollback.** `REVERSE_PATCH` and `RESTORE_CHECKPOINT`
   are both explicit strategies. `RESTORE_CHECKPOINT` is only admissible when
   the pre-mutation checkpoint has no uncommitted changes (`dirtyState.hasUncommittedChanges === false`).
   `REVERSE_PATCH` is always admissible regardless of dirty state.

5. **Content hash is server-authoritative.** The `ApprovalBinding` content
   hash is derived from the stored artifact, not from any caller-supplied
   value. No client can fabricate or override the hash in a binding.

---

## Packages

| Package | Path | Tasks |
|---|---|---|
| `@rohinik-org/control-protocol-v1` | `core/runtime/control-protocol-v1` | T1 |
| `@rohinik-org/control-approval-store` | `core/runtime/control-approval-store` | T2 |
| `@rohinik-org/control-workflow-engine` | `core/runtime/control-workflow-engine` | T3 |
| `@rohinik-org/control-verification-engine` | `core/runtime/control-verification-engine` | T4 |
| `@rohinik-org/control-recovery-engine` | `core/runtime/control-recovery-engine` | T5 |
| `@rohinik-org/server` (control routes) | `core/runtime/server` | T6 |
| `@rohinik-org/control` (SDK) | `core/runtime/control` | T7–T8 |
| `app/repo-engineer` (migration) | `app/repo-engineer` | T9 |
| Cross-repository conformance | server + control | T10 |

---

## Workflow State Machine

13 terminal and transit states:

```
DRAFT
  └─ apply(APPLIED)      → APPLIED
  └─ apply(PARTIAL)      → RECOVERY_REQUIRED
  └─ apply(INDETERMINATE)→ RECOVERY_REQUIRED
  └─ cancel()            → CANCELLED

APPLIED
  └─ verify(PASSED)      → VERIFIED
  └─ verify(FAILED)      → VERIFICATION_FAILED
  └─ verify(INCONCLUSIVE)→ VERIFICATION_FAILED

RECOVERY_REQUIRED
  └─ recover(strategy)   → RECOVERING → RECOVERED
                         └─ (RESTORE_CHECKPOINT + dirty) → 409 RECOVERY_UNSAFE

Terminal: VERIFIED | VERIFICATION_FAILED | RECOVERED | FAILED | CANCELLED
```

---

## Frozen Exports — `@rohinik-org/control-protocol-v1`

| Export | Kind |
|---|---|
| `ControlWorkflowState` | frozen const enum (13 values) |
| `MutationOutcome` | frozen const enum (5 values) |
| `VerificationStatus` | frozen const enum (5 values) |
| `RecoveryStrategy` | frozen const enum (2 values) |
| `ControlErrorCode` | frozen const enum |
| `PreMutationCheckpoint` | interface |
| `DirtyState` | interface |
| `ApprovalBinding` | interface |
| `ApplyRecord` | interface |
| `VerificationRecord` | interface |
| `RecoveryRecord` | interface |
| `ControlWorkflowEvent` | discriminated union (7 event kinds) |

**Enum invariants — MutationOutcome:**

| Value | Semantics |
|---|---|
| `NOT_STARTED` | Apply mechanism never invoked |
| `NO_MUTATION` | Apply ran; no bytes changed |
| `APPLIED` | Patch fully applied |
| `PARTIAL` | Patch partially applied — RECOVERY_REQUIRED |
| `INDETERMINATE` | Apply ran; outcome unknown — RECOVERY_REQUIRED |

**Enum invariants — VerificationStatus:**

| Value | State reached |
|---|---|
| `PASSED` | VERIFIED |
| `FAILED` | VERIFICATION_FAILED |
| `SKIPPED` | VERIFICATION_FAILED |
| `ERROR` | VERIFICATION_FAILED |
| `INCONCLUSIVE` | VERIFICATION_FAILED |

`exitCode=0` with `FAILED` → VERIFICATION_FAILED. `exitCode=1` with `PASSED` → VERIFIED.
Process success is not verification success.

---

## Frozen Exports — `@rohinik-org/control` (SDK)

| Export | Kind |
|---|---|
| `ControlSdkError` | class (name, status?, code?) |
| `ArtifactHandle` | class |
| `WorkflowHandle` | class |
| `createControlClient` | factory function |
| `ControlClient` | interface |

**SDK authority boundaries:**

- `artifact.approve()` — issues approval; does not apply
- `workflow.apply()` — applies; requires caller to supply approvalId and checkpoint
- `workflow.verify()` — verifies; does not auto-recover on failure
- `workflow.recover()` — requires explicit `RecoveryStrategy`; does not auto-choose
- `workflow.cancel()` — only valid from DRAFT
- `workflow.evidence()` — read-only audit log; no state change

**`ControlSdkError` invariants:**
- `name` is always `'ControlSdkError'`
- `status` is the HTTP response status code (optional)
- `code` is the `ControlErrorCode` string (optional)
- `status` and `code` are set via conditional assignment (exactOptionalPropertyTypes safe)

---

## Dogfooding Migration — `app/repo-engineer`

`repo-engineer` no longer owns an independent approval/apply/verification/recovery
authority. It consumes the Rohinik public control plane.

**Before Stage 16E:** `execute.ts` wrote local sidecar JSON files
(`.approved.json`, `.applied.json`, `.verified.json`) as ad-hoc approval and
verification records. No shared state. No checkpoint. No recovery.

**After Stage 16E:** `execute.ts` drives the control plane via
`createControlClient(baseUrl)`:

1. `artifacts.create()` — registers diff; receives server-authoritative contentHash
2. `artifact.approve()` — approval binding derived server-side; caller cannot override hash
3. `workflows.create(artifactId, { idempotencyKey })` — idempotent workflow creation
4. `captureCheckpoint()` — pre-mutation git state (headRef, workingTreeHash, dirtyState)
5. `workflow.apply({ approvalId, checkpoint, applyRecord })` — recorded mutation
6. `workflow.verify({ status, exitCode, … })` — recorded verification verdict
7. `workflow.recover({ strategy: REVERSE_PATCH, … })` — explicit recovery; only on `--recover` flag

Local sidecar files are removed from the apply path. All approval, mutation,
verification, and recovery records are owned and enforced by the control plane.

---

## Constitutional Laws Encoded

| Law | Encoding |
|---|---|
| LAW-160: approve ≠ apply | `artifact.approve()` and `workflow.apply()` are separate HTTP requests; ApprovalBinding derives hash from artifact, not caller |
| LAW-161: apply ≠ verify | Workflow reaches APPLIED state before verify is callable; no auto-verify |
| LAW-162: VERIFICATION_FAILED ≠ rollback | No auto-recover on VERIFICATION_FAILED; recover() requires explicit strategy |
| LAW-163: RESTORE_CHECKPOINT safety | 409 RECOVERY_UNSAFE if `dirtyState.hasUncommittedChanges === true` with RESTORE_CHECKPOINT |
| LAW-164: server-authoritative hash | ApprovalBinding.contentHash derived from stored artifact; no caller override |
| LAW-165: recovery requires strategy | `RecoveryStrategy` is required on `workflow.recover()`; no implicit rollback |

---

## Test Evidence

| Suite | Location | Tests | Boundary |
|---|---|---|---|
| control-protocol-v1 unit | `control-protocol-v1/src/__tests__` | T1 | types/enums |
| control-approval-store unit | `control-approval-store/src/__tests__` | T2 | approval binding |
| control-workflow-engine unit | `control-workflow-engine/src/__tests__` | T3 | state machine |
| control-verification-engine unit | `control-verification-engine/src/__tests__` | T4 | verification contract |
| control-recovery-engine unit | `control-recovery-engine/src/__tests__` | T5 | recovery safety matrix |
| control-conformance (HTTP) | `server/src/__tests__/control-conformance.test.ts` | 31 | live HTTP routes |
| control SDK unit | `control/src/__tests__/control.test.ts` | 24 | SDK handles |
| control attack | `control/src/__tests__/control.attack.test.ts` | 34 | B1 mock fetch attacks |
| control-sdk-live | `server/src/__tests__/control-sdk-live.test.ts` | 14 | B2 live SDK (Pillars I–XIV) |
| boundary4-control-consumer | `server/src/__tests__/boundary4-control-consumer.test.ts` | 1 | B3 packed external consumer |

**T10 Commits:**
- `66754f0` — T10 cross-repository conformance (3 boundaries, 49 tests)
- `20f8b4f` — T9 repo-engineer migration
- `1a8e489` — T7/T8 @rohinik-org/control SDK
- `096c7ff` — T6 control HTTP vertical slice
- `2c0d9da` — T5 recovery directives
- `6bb8a51` — T4 verification contract
- `1c208f2` — T3 workflow state machine
- `113bc25` — T2 hash-bound approval authority

---

## Release Gate

- [x] All control plane tests pass
- [x] Three-boundary conformance: mock fetch (34) + live SDK (14) + packed consumer (1)
- [x] `typecheck` clean on all control packages and server
- [x] ESM builds clean on all packages
- [x] `app/repo-engineer` migrated; local sidecar approval removed
- [x] `@rohinik-org/control` + `@rohinik-org/control-protocol-v1` vendored as tarballs
- [x] Zero `workspace:*` deps in packed control tarball (verified by B3)
- [x] Pre-existing port-conflict failures (boundary3, compat-floor, sse-events) unchanged

---

## Frozen Constraints for Downstream Stages

1. `ControlWorkflowState` has exactly 13 values. No new states without a new AFS.
2. `MutationOutcome` has exactly 5 values. No `SUCCESS` or `COMPLETE` outcome exists.
3. `VerificationStatus` has exactly 5 values. `exitCode=0` is not equivalent to `PASSED`.
4. `RecoveryStrategy` has exactly 2 values (`REVERSE_PATCH`, `RESTORE_CHECKPOINT`).
   `RESTORE_CHECKPOINT` is gated on clean checkpoint. No new strategies without a new AFS.
5. `ApprovalBinding.contentHash` is always server-derived. Callers cannot supply or override it.
6. `workflow.recover()` requires an explicit `RecoveryStrategy`. No implicit rollback path exists.
7. `repo-engineer` must not re-introduce local sidecar approval or verification files.
   All mutation authority flows through the control plane.
