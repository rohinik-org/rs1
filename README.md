# RS-1 Runtime System

RS-1 is the core runtime system for the Rohinik platform, implementing the architecture specified in AFS-0001. This repository contains the standalone, independently buildable kernel, compiler, shell, and supporting runtime packages.

> **Pre-1.0 — interfaces and protocols are unstable.** Breaking changes may occur between minor versions until the 1.0 release.

| Component | Description |
|-----------|-------------|
| Architecture | RS-1 (Runtime System, Revision 1) |
| Spec | AFS-0001 |
| npm scope | `@rohinik-org/*` |
| Node.js | ≥ 22.0.0 |
| Package manager | pnpm ≥ 9.0.0 |

---

## Repository Layout

```
compiler/          IR types, schemas, shared interfaces
core/
  kernel/          Foundation, capability-core, routing
  runtime/         Adapter IR, adapter runtime, artifacts, client, daemon
  intelligence/    Planner, observer, acquisition, autonomy, reasoning
  memory/          Memory engine, knowledge-graph, corpus, recommender
  drivers/         Anthropic, OpenAI, filesystem, MCP, null-reasoning
shell/             Natural-language → WorkflowPlan translation
```

---

## Build

```bash
pnpm install
pnpm build      # build all packages in dependency order
pnpm typecheck  # type-check all packages
pnpm test       # run all tests
```

---

## Key Concepts

**Semantic Compiler** — Translates external AI formats (Claude Skills, Cursor Rules, MCP servers) into RS-1-native capability artifacts.

**Capability Catalog** — Every installed capability is tracked in `.rohinik/catalog.json`. Managed via the `CapabilityCatalog` class in `@rohinik-org/adapter-runtime`.

**Execution Corpus** — Every routing decision is recorded as an immutable `ExecutionRecord` in `.rohinik/corpus/`.

**Shell** — Translates natural-language requests into `WorkflowPlan` objects for execution by the runtime.

---

## Architecture

The normative RS-1 architecture is defined by AFS-0001. Public architecture
documentation is maintained separately from this implementation repository.

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
