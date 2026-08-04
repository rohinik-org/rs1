# RS-1 Dependency Boundary Report

Generated: 2026-08-04  
Scanned HEAD: ff4cc22 (pre-extraction commits applied)  
Workspace: 122 packages  

---

## Summary

| Category | Count |
|----------|-------|
| Workspace packages (total) | 122 |
| New RS-1-owned packages created | 4 |
| Excluded domains removed from workspace | 9 entries |
| Remaining `@rohinik-org/cli` imports in TS source | 0 |
| Remaining `@rohinik-org/adapter-sdk` imports in TS source | 0 |
| Remaining `@rohinik-org/cli` deps in package.json files | 0 |
| Remaining `@rohinik-org/adapter-sdk` deps in package.json files | 0 |

---

## New RS-1-Owned Packages

| Package | Path | Role |
|---------|------|------|
| `@rohinik-org/adapter-ir` | `core/runtime/adapter-ir` | Pure interface contracts (CapabilityAdapter, AdapterConfig, ExecutionBinding, etc.) — no runtime deps |
| `@rohinik-org/adapter-runtime` | `core/runtime/adapter-runtime` | Real operational implementations (CapabilityCatalog, InstallManager, DescriptorBuilder, CapabilityCompiler, RegistrationPipeline) |
| `@rohinik-org/runtime-client` | `core/runtime/client` | HTTP client with full API parity to excluded CLI client (36 methods, 16 interfaces, 1 error class) |
| `@rohinik-org/installer` | `core/runtime/installer-ir` | Pure Installer interface for capability-acquisition engine — no stub classes |

---

## Excluded Domains Removed from Workspace

The following workspace entries were present in the monorepo but belong to downstream CLI / tooling layers excluded from RS-1:

| Removed Entry | Reason |
|---------------|--------|
| `packages/reference/*` | CLI reference packages |
| `sdk/typescript/adapter-sdk` | Replaced by adapter-ir + adapter-runtime |
| `sdk/typescript/asset-sdk` | CLI SDK layer |
| `cli` | Downstream CLI — not part of RS-1 |
| `tools/installer` | CLI tooling layer |
| `tools/package-manager` | CLI tooling layer |
| `tools/asset-*` | CLI tooling layer |
| `tools/benchmark/reference-runner-node` | Benchmark tooling |
| `registry/packs/starter-pack` | Registry layer |
| `examples/knowledge-assistant` | Example app |
| `apps/*` | Application layer |

---

## Architectural Violations Fixed

### Violation 1: `shell` → `@rohinik-org/cli`
- **Before:** `shell/package.json` depended on `@rohinik-org/cli`; `shell/src/context-assembler.ts` and `shell/src/shell.ts` imported `RohinikHttpClient` from `@rohinik-org/cli/client`
- **After:** Both files import from `@rohinik-org/runtime-client`; shell package.json updated

### Violation 2: `core/drivers/mcp` → `@rohinik-org/adapter-sdk`
- **Before:** `mcp/package.json` depended on `@rohinik-org/adapter-sdk`; `mcp-adapter.ts` and `mcp-binding.ts` imported interfaces from it
- **After:** Both files import from `@rohinik-org/adapter-ir` (pure interface contracts only)

### Violation 3: `core/runtime/artifacts` → `@rohinik-org/adapter-sdk`
- **Before:** `artifacts/package.json` depended on `@rohinik-org/adapter-sdk`; `lifecycle-manager.ts`, `lifecycle.test.ts`, `policy-engine.ts`, `registry.ts` imported from it
- **After:** All files import from `@rohinik-org/adapter-ir` (interfaces) or `@rohinik-org/adapter-runtime` (implementations)

### Violation 4: `compiler` → `@rohinik-org/cli` (phantom dep)
- **Before:** `compiler/package.json` listed `@rohinik-org/cli` as a dependency with no corresponding imports
- **After:** Dependency removed

---

## Dependency Direction (Post-Fix)

```
cli (downstream, excluded)
  └── runtime-client ← shell
                     ↑
              adapter-runtime
                     ↑
               adapter-ir
```

All dependency arrows now point inward toward the core, with no RS-1 package depending on any excluded domain.

---

## Scan Commands Used

```bash
# Zero violations confirmed:
grep -r "from '@rohinik-org/cli"    --include="*.ts" (result: 0 files)
grep -r "from '@rohinik-org/adapter-sdk" --include="*.ts" (result: 0 files)
grep -r '"@rohinik-org/cli"'        --include="package.json" (result: 0 files)
grep -r '"@rohinik-org/adapter-sdk"' --include="package.json" (result: 0 files)
```
