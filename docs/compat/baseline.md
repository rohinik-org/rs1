# Platform Compatibility Baseline — v0.16.0-stage16a

This directory contains the frozen compatibility baseline for `v0.16.0-stage16a`.
Every future stage is measured against these artifacts.

---

## What is frozen

### Protocol (docs/compat/protocol-baseline.json)

Semantic contract of `@rohinik-org/execution-protocol-v1` v1.0.0:

- Five routes, their HTTP methods, and response status codes
- Required and optional fields on every request/response schema
- Property types and allowed enum values
- `PublicErrorCode` values
- `PublicExecutionState` enum

**Breaking change policy:** hash change triggers semantic diff. If diff contains
only additive-compatible changes (new optional fields, new routes, new enum values
in forward-compatible positions), the check passes. Any breaking change fails CI.

Breaking = route removal, required-field removal, optional→required, type
narrowing, enum-variant removal, error-code removal.

### SDK API (docs/compat/sdk-api-baseline.json)

Exported symbol inventory of `@rohinik-org/client` v1.0.0 with normalized
signatures for runtime exports and class member inventories.

**Breaking change policy:** removed/renamed exports fail. Runtime-export signature
change fails. New exports pass. New optional parameters pass.

### Performance (docs/compat/perf-baseline.json)

Latency baselines for the five protocol routes against an in-memory mock-provider
server, measured at baseline commit. Regression rule:

```
current p50 ≤ max(baseline.p50 × 3, baseline.p50 + 15)
current p95 ≤ max(baseline.p95 × 3, baseline.p95 + 30)
```

Run in a dedicated CI job. Never mixed with unit/integration tests.

---

## Conformance

Single authoritative suite: `packages/client/src/__tests__/conformance.test.ts`
(SDK repository, 19 tests).

Run against two targets:
1. SDK mock server (SDK CI)
2. RS1 real mock-provider server (RS1 CI — `protocol-compat.test.ts`)

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/generate-protocol-baseline.ts` | Extract semantic baseline from schemas + OpenAPI |
| `scripts/check-protocol-compat.ts` | Hash-then-semantic-diff check against baseline |
| `scripts/generate-sdk-api-baseline.ts` | Extract SDK export inventory with signatures |
| `scripts/check-sdk-compat.ts` | Symbol + signature diff against baseline |
| `scripts/measure-protocol-perf.ts` | Measure live latency; emit perf-baseline.json |
| `scripts/check-protocol-perf.ts` | Assert current latency within baseline tolerance |

---

## Baseline tag

`v0.16.0-stage16a` (git tag `stage-16a-freeze`)
