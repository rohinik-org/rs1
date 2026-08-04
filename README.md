<div align="center">

<img
  src="./assets/rohinik-logo-wordmark.svg"
  alt="Rohinik"
  width="280"
/>

<br>

### RS-1 Core Runtime

**Reference implementation of the RS-1 execution architecture**

Governed execution · Structured memory · Capability contracts · Provider independence

<br>

[![Status](https://img.shields.io/badge/status-pre--1.0-00668A?style=flat-square&labelColor=0B1C30)](#project-status)
[![Architecture](https://img.shields.io/badge/architecture-RS--1-0B1C30?style=flat-square&labelColor=000000)](#architecture)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522.0.0-4C4546?style=flat-square&labelColor=191C1E)](#requirements)
[![License](https://img.shields.io/badge/license-Apache%202.0-00668A?style=flat-square&labelColor=0B1C30)](./LICENSE)

</div>

---

## Overview

**RS-1 defines the core execution architecture for governed intelligent computing. Rohinik Runtime is the reference implementation of RS-1.**

This repository contains the standalone RS-1 kernel, compiler, shell, intelligence, memory, driver, and supporting runtime packages.

RS-1 is designed around explicit contracts, deterministic control boundaries, structured context and memory, capability-based execution, provider-independent interfaces, and auditable runtime decisions.

> **Pre-1.0:** Public interfaces, package contracts, and protocols may change between minor releases until the RS-1 conformance and release criteria are complete.

---

## Architecture

RS-1 separates architectural policy from providers, tools, models, and product interfaces.

```text
┌─────────────────────────────────────────────────────────────┐
│                  STATE & EXECUTION LAYER                    │
│                                                             │
│  Intelligence · Context · Memory · Evaluation · Learning    │
│  Evidence · Prediction · Federation · Runtime State         │
├─────────────────────────────────────────────────────────────┤
│                 MICROKERNEL INTERFACE                       │
│                                                             │
│  Capability Contracts · Admission · Dispatch · Lifecycle    │
│  Trust · Permissions · Binding · Provisioning               │
├─────────────────────────────────────────────────────────────┤
│              HOST & PROVIDER ABSTRACTION                    │
│                                                             │
│  Drivers · Model Providers · Filesystems · MCP · Networks   │
└─────────────────────────────────────────────────────────────┘
```

The normative RS-1 architecture is defined by approved Rohinik architecture specifications, including AFS-0001 and the subsequent AFS series.

Public architecture documentation is maintained separately from this implementation repository.

---

## Core principles

### Governed execution

Runtime decisions pass through explicit contracts, policies, admission boundaries, and evidence-producing control points.

### Capability-based architecture

External functionality is represented as declared capabilities with defined contracts, bindings, trust requirements, permissions, and lifecycle semantics.

### Structured context and memory

Context, memory, knowledge, experience, evaluation, prediction, and learning are governed runtime concerns rather than unstructured prompt assembly.

### Deterministic control boundaries

Critical control decisions are designed to be reproducible, inspectable, testable, and independent of hidden provider behaviour.

### Provider independence

Model providers, storage systems, drivers, external services, and execution hosts remain replaceable behind stable RS-1 interfaces.

### Specification authority

Approved architecture specifications govern externally observable behaviour. Implementation code must not silently redefine the architecture.

---

## Repository scope

This repository contains the RS-1 reference implementation only.

| Domain | Path | Responsibility |
|---|---|---|
| Kernel | `core/kernel/` | Foundation, capability core, matching, routing, and kernel contracts |
| Runtime | `core/runtime/` | Execution, orchestration, state, trust, packages, provisioning, learning, and federation |
| Intelligence | `core/intelligence/` | Planning, reasoning, reflection, evaluation, experience, autonomy, and observation |
| Memory | `core/memory/` | Memory engine, knowledge graph, corpus, and recommendation |
| Drivers | `core/drivers/` | Model, filesystem, MCP, and runtime provider adapters |
| Compiler | `compiler/` | IR, schemas, transformations, and execution-facing compilation |
| Shell | `shell/` | Governed conversion of user intent into runtime execution requests |

The following are intentionally outside this repository:

- public SDKs
- CLI applications
- examples and starter applications
- registries and marketplaces
- public documentation sites
- commercial platform services
- commercial products

---

## Repository map

```text
rs1/
├── compiler/
│   └── src/
├── core/
│   ├── drivers/
│   │   ├── anthropic/
│   │   ├── filesystem/
│   │   ├── mcp/
│   │   ├── null-reasoning/
│   │   └── openai/
│   ├── intelligence/
│   │   ├── acquisition/
│   │   ├── autonomy/
│   │   ├── context-quality/
│   │   ├── evaluation/
│   │   ├── experience/
│   │   ├── multi-agent/
│   │   ├── observer/
│   │   ├── planner/
│   │   ├── reasoning/
│   │   └── reflection/
│   ├── kernel/
│   │   ├── capability-core/
│   │   └── foundation/
│   ├── memory/
│   │   ├── corpus/
│   │   ├── knowledge-graph/
│   │   └── recommender/
│   └── runtime/
│       ├── adapter-ir/
│       ├── adapter-runtime/
│       ├── artifacts/
│       ├── client/
│       ├── daemon/
│       ├── execution/
│       ├── orchestration/
│       ├── package-trust/
│       ├── provisioning-runtime/
│       ├── runtime-federation/
│       └── runtime-state/
├── shell/
├── assets/
├── LICENSE
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── vitest.config.ts
```

The abbreviated map above highlights major domains. The workspace contains additional packages under these boundaries.

---

## Key runtime packages

### `@rohinik-org/adapter-ir`

Pure adapter interface contracts used by RS-1 packages.

It contains no operational installation or registration behaviour.

### `@rohinik-org/adapter-runtime`

Runtime-owned adapter operations, including capability catalogue, installation, descriptor construction, compilation, and registration workflows.

### `@rohinik-org/runtime-client`

RS-1-owned HTTP client used by runtime-facing consumers such as the shell.

It prevents the core runtime from depending on downstream CLI packages.

### `@rohinik-org/installer`

Pure installer contract used by the capability-acquisition boundary.

---

## Key concepts

### Semantic compilation

The compiler transforms supported external declarations and formats into RS-1-compatible intermediate representations and capability artefacts.

### Capability catalogue

Installed capabilities are represented through governed catalogue records and adapter-runtime lifecycle operations.

### Execution corpus

Execution and routing evidence may be recorded as structured runtime records for inspection, evaluation, recommendation, and governed learning.

### Shell

The shell translates natural-language requests into governed runtime structures such as workflow plans and execution requests.

### Context quality

Context packages can be evaluated against explicit quality, budget, authority, provenance, freshness, consistency, efficiency, and safety requirements before intelligence-provider execution.

### Package trust

Package acquisition and provisioning pass through trust, integrity, provenance, permissions, revocation, quarantine, and authorisation boundaries.

---

## Requirements

- Node.js `>=22.0.0`
- pnpm `>=9.0.0`
- Git

Check installed versions:

```bash
node --version
pnpm --version
git --version
```

---

## Getting started

Clone the repository:

```bash
git clone https://github.com/rohinik-org/rs1.git
cd rs1
```

Install workspace dependencies:

```bash
pnpm install
```

Run the workspace checks:

```bash
pnpm typecheck
pnpm build
pnpm test
```

List available root scripts:

```bash
pnpm run
```

> Some packages have ordered workspace dependencies. When working on an individual package, ensure its transitive workspace dependencies have been built first.

---

## Development workflow

Before submitting a change:

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
git diff --check
```

For package-specific development:

```bash
pnpm --filter <package-name> typecheck
pnpm --filter <package-name> build
pnpm --filter <package-name> test
```

Example:

```bash
pnpm --filter @rohinik-org/adapter-runtime test
```

---

## Architectural changes

A change is architectural when it alters externally observable RS-1 behaviour or changes a governed boundary.

Examples include changes to:

- capability contracts
- package lifecycle semantics
- compiler IR
- execution ordering
- context or memory behaviour
- trust and admission decisions
- provider boundaries
- runtime state transitions
- evidence requirements
- distributed execution
- federation semantics

Architectural changes must reference the applicable approved specification, law, invariant, or design record.

Internal refactoring, diagnostics, testing improvements, and performance work should preserve externally observable behaviour unless an approved specification explicitly authorises the change.

---

## Project status

RS-1 is currently under active pre-1.0 development.

The repository includes the standalone extraction completed after Rohinik Stage 14. Development from subsequent stages continues in this repository.

Current status:

| Area | Status |
|---|---|
| Standalone RS-1 repository | Complete |
| Kernel, runtime, compiler, and shell extraction | Complete |
| Downstream CLI and SDK dependency removal | Complete |
| Adapter contract/runtime separation | Complete |
| Runtime HTTP client ownership | Complete |
| Public CI workflow | Pending |
| RS-1 1.0 conformance criteria | Pending |
| Stable public interfaces | Pending |

The repository must not be described as RS-1 version 1.0 until the conformance, compatibility, release, and governance criteria are approved and complete.

---

## Contributing

Contributions should be focused, tested, and consistent with RS-1 package boundaries.

Read:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- [`SECURITY.md`](./SECURITY.md)

Do not introduce dependencies from RS-1 packages to downstream CLI, SDK, marketplace, examples, documentation, or product repositories.

---

## Security

Do not disclose suspected vulnerabilities through public GitHub issues.

Follow the private reporting process defined in [`SECURITY.md`](./SECURITY.md).

Local credentials, runtime state, private keys, and environment files must never be committed.

---

## Versioning

RS-1 is currently pre-1.0.

Until the first stable release:

- minor versions may contain breaking changes
- package interfaces may evolve
- protocols may change as specifications are approved
- compatibility is not guaranteed across unreleased stages

Release tags identify verified implementation checkpoints. They do not automatically imply stable public compatibility.

---

## License

Copyright © Rohinik contributors.

Licensed under the **Apache License 2.0**.

See [`LICENSE`](./LICENSE) for the complete terms.

---

<div align="center">

**RS-1 architecture · Rohinik Runtime reference implementation**

`kernel / runtime / intelligence / memory / compiler / shell`

</div>
