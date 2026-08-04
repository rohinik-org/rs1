# Contributing to RS-1

## Prerequisites

- Node.js ≥ 22.0.0
- pnpm ≥ 9.0.0
- `pnpm install` at repo root

## Build & Test

```bash
pnpm build      # build all packages in dependency order
pnpm typecheck  # type-check all packages
pnpm test       # run all tests
```

## Package Locations

| Layer | Path | Contents |
|-------|------|----------|
| Compiler | `compiler/` | IR types, schemas, shared interfaces |
| Kernel | `core/kernel/` | Foundation, capability-core, routing |
| Runtime | `core/runtime/` | Adapter IR, adapter runtime, artifacts, client, daemon |
| Intelligence | `core/intelligence/` | Planner, observer, acquisition, autonomy, reasoning, reflection, multi-agent |
| Memory | `core/memory/` | Memory engine, knowledge-graph, corpus, recommender |
| Drivers | `core/drivers/` | Anthropic, OpenAI, filesystem, MCP, null-reasoning |
| Shell | `shell/` | NL → WorkflowPlan |

## Contribution Guidelines

- Follow existing patterns. Read the relevant AFS-* spec before adding to a subsystem.
- Every non-trivial change needs tests. Run `pnpm test` locally before opening a PR.
- Keep PRs focused. One feature or bugfix per PR.
- Add a `ponytail:` comment when you deliberately simplify (state the known ceiling and upgrade path).
- Do not add external dependencies without discussion.

## Architecture Specs

Before changing system-level behaviour, read the relevant spec in `docs/`:
- `AFS-0001` — Core architecture
- `AFS-0002` — Governance strategy
- ADR-001 through ADR-004 — Key design decisions

## Constitutional Changes

Changes that affect AFS-0001 architectural boundaries (package admission, dependency direction, protocol contracts) require a governance review. Open an issue tagged `constitutional` before raising a PR.

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
