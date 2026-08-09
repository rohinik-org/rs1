# AFS-016C — Typed Output Schemas

**Stage:** 16C  
**Status:** FROZEN  
**Date:** 2026-08-09  
**Author:** sritamsarkar

---

## 1. Stage Objectives

Stage 16C delivered authoritative server-side output schema validation, a public schema SDK, and typed client results. The concrete objectives were:

1. Define public schema contracts in `@rohinik-org/execution-protocol-v1`: `OutputSchemaRef`, `ValidationResult`, `ValidationOutcome`, `SchemaRecord`, and schema-related DTOs.
2. Build a server-side schema registry (`@rohinik-org/schema-registry`) with Ajv 8 validation, canonical SHA-256 hashing, and schema lifecycle management.
3. Add schema admission at `POST /v1/executions` — 400 `SCHEMA_NOT_FOUND` / `SCHEMA_HASH_MISMATCH` before creating any record.
4. Add authoritative server-side output validation in the async execution pipeline: INVALID output → `FAILED` terminal state, output nulled, validation evidence appended.
5. Add provider output normalization: string outputs JSON-parsed before validation when schema is bound. FallbackExecutor blocks schema-incompatible fallbacks (`SCHEMA_FALLBACK_BLOCKED`); permits explicit degradation (`SCHEMA_FALLBACK_PERMITTED_DEGRADATION`) when fallback declares `structuredOutput` requirement.
6. Ship `@rohinik-org/schema` — public `defineJsonSchema<T>()` with hash parity, `validateLocal()`, and `SchemaHashMismatchError`.
7. Ship typed client helpers in `@rohinik-org/runtime-client`: `client.executions.startTyped<T>()` returning `TypedExecution<T>` with `waitForTypedResult()` — hash verification before returning typed output.
8. Dogfood in `repo-engineer` — remove FRICTION-012 (`String(result.output)` coercion).
9. Validate cross-repo conformance with a 14-test schema conformance suite (port 19_970).

All nine objectives are complete.

---

## 2. Frozen Boundaries

The following boundaries extend the 16A/16B freeze. All prior boundaries remain in effect.

| # | Boundary | Rule |
|---|---|---|
| 8 | Schema authority | RS1 server is the sole authoritative validator. Client-side `validateLocal()` is advisory only and cannot override the server result. |
| 9 | Admission atomicity | `outputSchemaRef` is verified (existence + hash) before any execution record is created. No record exists if admission fails. |
| 10 | INVALID immutability | When server validation produces `INVALID`, the terminal state is `FAILED`, `output` is null, and `validationResult.outcome` is `INVALID`. These cannot be overridden downstream. |
| 11 | Evidence durability | Validation evidence entries (`validation:VALID` / `validation:INVALID`) are written before the terminal event is published. |
| 12 | Hash parity | `computeSchemaHash` in `@rohinik-org/schema` (SDK) and `@rohinik-org/schema-registry` (RS1) must produce identical output for identical input. Both use canonical JSON (keys sorted recursively) + SHA-256. |
| 13 | Ref completeness | All three fields of `OutputSchemaRef` (`schemaId`, `version`, `semanticHash`) are required at every call site. No implicit latest-version resolution. |
| 14 | Fallback schema contract | A schema-bound execution may only fall back to a skill that declares `requirements.providerCapabilities.reasoningEngine.structuredOutput = true`. Otherwise the fallback is blocked with `SCHEMA_FALLBACK_BLOCKED` diagnostic. Permitted degradation is always evidenced. |
| 15 | TypeScript type ≠ validity proof | The `<T>` parameter in `startTyped<T>()` is a caller assertion. The server `ValidationResult` is the authoritative proof. `waitForTypedResult()` must verify `validationResult.schemaRef.semanticHash` before returning typed output. |

---

## 3. Protocol Inventory (delta from 16A/16B)

**Package:** `@rohinik-org/execution-protocol-v1`  
**Source file SHA-256:** `c006ff741dd5bf99b67b00a876adf716e179b134bf8e5f0495c9ed29299dd770`

### New types added in 16C

| Type | Description |
|---|---|
| `OutputSchemaRef` | `{ schemaId, version, semanticHash }` — all three required |
| `ValidationOutcome` | `VALID \| INVALID \| NOT_REQUESTED \| NOT_EVALUATED` |
| `ValidationResult` | `{ outcome, firstError?, errorCount, schemaRef? }` |
| `SchemaRecord` | `{ schemaId, version, semanticHash, schema, registeredAt }` |
| `RegisterSchemaRequest` | `{ schemaId, version, schema }` — body for `POST /v1/schemas` |
| `ValidateAgainstSchemaResponse` | `{ schemaId, version, semanticHash, outcome, errors? }` |

### Fields added to existing types

| Type | Field | Notes |
|---|---|---|
| `SubmitExecutionRequest` | `outputSchemaRef?: OutputSchemaRef` | Optional; triggers admission + validation |
| `ExecutionResultResponse` | `validationResult?: ValidationResult` | Present when schema was bound |

### New routes

| Method | Path | Description |
|---|---|---|
| POST | `/v1/schemas` | Register schema — 201 + `{ schemaId, version, semanticHash }` or 409 if duplicate |
| GET  | `/v1/schemas/:schemaId/:version` | Retrieve `SchemaRecord` — 200 or 404 |
| POST | `/v1/schemas/:schemaId/:version/validate` | Validate value — 200 with outcome |

### Error codes added

| Code | HTTP | Condition |
|---|---|---|
| `SCHEMA_NOT_FOUND` | 400 | `outputSchemaRef` references unknown schema at admission |
| `SCHEMA_HASH_MISMATCH` | 400 | `semanticHash` in ref doesn't match stored hash |
| `SCHEMA_ALREADY_EXISTS` | 409 | `POST /v1/schemas` duplicate |

---

## 4. Package Inventory (new in 16C)

| Package | Version | Location | Runtime Deps |
|---|---|---|---|
| `@rohinik-org/schema-registry` | 0.1.0 | `core/runtime/schema-registry/` | `ajv@^8`, protocol |
| `@rohinik-org/schema` | 0.1.0 | `core/runtime/schema/` | `ajv@^8`, protocol |
| `@rohinik-org/runtime-client` | 0.1.0 | `core/runtime/client/` | `@rohinik-org/schema` |

### Source file hashes

| File | SHA-256 |
|---|---|
| `core/runtime/schema-registry/src/index.ts` | `3e2fbbeea5c80811593ac8c017491c6e7d5e1a8f4c80e15500b685b0da66c63d` |
| `core/runtime/schema/src/index.ts` | `a076ad66b4d327a3837611e69fb49e297ed6b6f429a515362ffb8828c961589b` |
| `core/runtime/server/src/routes/async-executions.ts` | `89529b1fee8cb9b0c16a3878cb91d848cae4bcf11d8b7011f99934af5c9e3d2d` |
| `core/kernel/src/engine/fallback-executor.ts` | `00a72cf6b90490e94736abb8d5a8d6003c654b578b2efedb6eeb8a156af9727e` |
| `core/runtime/client/src/typed-executions.ts` | `3d48bc79264f911b6dab9ae4d7959003c79d058fb30b5064f1f9fbca7c7b5c2d` |

---

## 5. Public API Inventory (new in 16C)

### `@rohinik-org/schema`

```typescript
// Schema definition
function defineJsonSchema<T>(
  schemaId: string,
  version: string,
  schema: Readonly<Record<string, unknown>>,
): BoundSchema<T>

interface BoundSchema<_T> {
  readonly schemaId: string
  readonly version: string
  readonly semanticHash: string
  readonly rawSchema: Readonly<Record<string, unknown>>
  ref(): OutputSchemaRef
  validateLocal(value: unknown): LocalValidationResult
}

interface LocalValidationResult {
  readonly valid: boolean
  readonly errors?: Array<{ message?: string; instancePath?: string }>
}

// Hash utility (parity with schema-registry)
function computeSchemaHash(schema: Readonly<Record<string, unknown>>): string

// Error
class SchemaHashMismatchError extends Error {
  readonly expected: string
  readonly received: string
}
```

### `@rohinik-org/runtime-client` (additions)

```typescript
// On RohinikHttpClient
readonly executions: ExecutionsNamespace

// Typed start
client.executions.startTyped<T>(
  schema: BoundSchema<T>,
  request: AsyncExecuteRequest,
): Promise<TypedExecution<T>>

interface TypedExecution<T> {
  readonly executionId: string
  waitForTypedResult(options?: { pollIntervalMs?: number; timeoutMs?: number }): Promise<TypedResult<T>>
}

interface TypedResult<T> {
  readonly executionId: string
  readonly output: T
  readonly validation: ValidationInfo
}
```

---

## 6. Conformance Summary

Cross-repository schema conformance validated by `schema-conformance.test.ts` (port 19_970) — a real RS1 server + mock provider exercising all four 16C pillars.

| Pillar | Scenario | Tests | Result |
|---|---|---|---|
| 1 — Schema Registry | Registration, retrieval, 409, 404, canonical hash | 5 | PASS |
| 2 — Execution Admission | SCHEMA_NOT_FOUND, SCHEMA_HASH_MISMATCH, valid 202 | 3 | PASS |
| 3 — Output Validation | NOT_REQUESTED, VALID (null schema), INVALID→FAILED, evidence | 4 | PASS |
| 4 — Normalization + Fallback Guard | No degradation evidence, no fallback evidence without schema | 2 | PASS |
| **Total** | | **14** | **ALL PASS** |

---

## 7. Evidence

### Test counts

| Suite | Tests | Location |
|---|---|---|
| Kernel (incl. FallbackExecutor guard) | 383 | `core/kernel/src/__tests__/` |
| Schema registry | (embedded in server suite) | `schemas.test.ts` (17) |
| Output validation | 9 | `output-validation.test.ts` |
| Provider normalization | 4 | `provider-normalization.test.ts` |
| Schema conformance | 14 | `schema-conformance.test.ts` |
| `@rohinik-org/schema` unit | 10 | `core/runtime/schema/src/__tests__/` |
| `@rohinik-org/runtime-client` (incl. typed) | 16 | `core/runtime/client/src/__tests__/` |
| RS1 16A/16B regressions (async-executions + cancellation) | 34 | `async-executions.test.ts`, `cancellation.test.ts` |
| repo-engineer | 52 | `app/repo-engineer/src/__tests__/` |
| **New 16C tests** | **54** | tasks 1–9 |

### Dogfooding

FRICTION-012 (`String(result.output)` coercion) removed from `repo-engineer/src/commands/execute.ts` and `plan.ts`. Both now require `typeof result.output === 'string'` and throw on violation.

### Friction resolved

| Item | Summary | Resolution |
|---|---|---|
| FRICTION-019 | `result.output` is `unknown` | Resolved: typed schemas + `startTyped<T>()` + server `validationResult` |
| FRICTION-012 | `String()` coercion of agent output | Resolved: explicit `typeof` guard in execute.ts and plan.ts |

---

## 8. Known Limitations

1. **Schema registry is in-memory.** All schema records are lost on process restart. Persistence belongs to a future stage.
2. **No schema versioning policy.** Multiple versions of the same `schemaId` are allowed; no compatibility checks between versions.
3. **`startTyped<T>()` registers schema at call time.** Callers sharing a schema across many calls trigger unnecessary 409s. A pre-registration step would avoid this.
4. **`@rohinik-org/runtime-client` not vendored.** Task 7 typed client lives in the workspace; it is not yet bundled for external consumers. Packaging belongs to Stage 16D/16E.
5. **`T` in `BoundSchema<T>` is advisory.** No runtime coercion to `T` — the server validates the output but TypeScript type narrowing still depends on the caller's schema claim being consistent with `T`.

---

## 9. Roadmap to 16D

| Stage | Theme | Primary driver |
|---|---|---|
| 16D | Progress UX | FRICTION-022 — no progress indication during polling |
| 16E | Client unification | FRICTION-018/020/021 — two clients, two error classes, mirror type drift |
| 16F | Persistence + idempotency | Schema registry persistence; execution record persistence |

---

## Release Gate

This stage is **FROZEN** as `v0.16.0-stage16c`.

Git tag: `stage-16c-freeze`  
Release: `v0.16.0-stage16c`

All 16C tests pass. Protocol, schema registry, schema SDK, typed client, fallback guard, and conformance suite are frozen at the hashes recorded in sections 3–5. No changes to the schema admission contract, validation outcomes, hash algorithm, or typed client API are permitted under this version.
