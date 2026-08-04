# RS-1 Extraction Baseline

## Source

| Field | Value |
|---|---|
| Original monorepo source tag | `v0.14.0-stage14` |
| Source checkpoint tag | `pre-rs1-extraction` |
| Filtered Stage 14 HEAD | `ff4cc221073619d0208277c82ae517acc3c4ba36` |
| Extraction scope | core/, compiler/, shell/ and required root config |
| Excluded domains | sdk/, cli/, tools/, examples/, registry/, apps/, docs/, platform/, products/, packages/reference/ |
| Destination repository | https://github.com/rohinik-org/rs1.git |
| Date of standalone repair | 2026-08-04 |

## Safety branch

`backup/pre-rs1-standalone-repair` — local only, not pushed. Points at the same commit as `main` at the start of standalone repair.

## Violations found at extraction time

| Package | Invalid dependency | Resolution |
|---|---|---|
| `shell` | `@rohinik-org/cli` (workspace) | Replaced by new `@rohinik-org/runtime-client` |
| `compiler` | `@rohinik-org/cli` (workspace, unused) | Removed |
| `core/drivers/mcp` | `@rohinik-org/adapter-sdk` (workspace) | Replaced by new `@rohinik-org/adapter-ir` |
| `core/runtime/artifacts` | `@rohinik-org/adapter-sdk` (workspace) | Replaced by new `@rohinik-org/adapter-ir` |
| `pnpm-workspace.yaml` | 17 absent workspace entries | Removed |
| `README.md` | Broken docs/ links, wrong scope | Rewritten |
| `CONTRIBUTING.md` | References excluded SDK, CLI, tools | Rewritten |
| `SECURITY.md` | Scope includes sdk/, cli/ | Corrected |
| `core/kernel/src/matching/matcher.ts` | Reference to `docs/Rohinik-WHITEPAPER.md` | Replaced with neutral AFS-0001 reference |
| Root `package.json` | `benchmark` script references excluded tools | Removed |
