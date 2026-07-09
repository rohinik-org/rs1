# AIOS — AI Operating System

AIOS compiles existing AI ecosystems into a unified, local, deterministic runtime.
Install Claude Skills, Cursor Rules, MCP servers, or custom capabilities — without rewriting them.

---

## The 5-Minute Example

```bash
# Install AIOS
npm install -g @aios/cli@beta

# Clone a community Claude Skill (no AIOS-specific code)
git clone https://github.com/joseguiaCES/autocad-dotnet-claude-skill
aios install ./autocad-dotnet-claude-skill

# See what was compiled
aios inspect autocad

# Execute it
aios run "Create a flange with 8 bolt holes"
```

AIOS detected the Claude Skill, compiled it into a native capability, and made it executable.

---

## Install

```bash
npm install -g @aios/cli@beta
```

Requires Node.js ≥ 22.0.0

```bash
aios doctor
```

---

## Key Concepts

**Semantic Compiler** — AIOS translates external AI formats (Claude Skills, Cursor Rules, MCP servers) into AIOS-native capability artifacts. You bring what already exists; AIOS compiles it.

**Capability Catalog** — Every installed capability is tracked in `.aios/catalog.json`. List, inspect, upgrade, and remove capabilities with standard CLI commands.

**Execution Corpus** — Every routing decision is recorded as an immutable `ExecutionRecord` in `.aios/corpus/`. Query it with `aios corpus stats`.

---

## Commands

| Command | Description |
|---------|-------------|
| `aios doctor` | Verify environment, config, and installed packages |
| `aios install <source>` | Install a Claude Skill, Cursor Rule, MCP adapter, or pack |
| `aios inspect <id>` | Show compiled capability details |
| `aios search <term>` | Search installed capabilities |
| `aios list` | List all installed packages |
| `aios run "<request>"` | Execute a natural language request |
| `aios corpus stats` | View execution history |
| `aios quickstart` | Guided onboarding |
| `aios demo` | Walk through the compiler pipeline |
| `aios version` | Show AIOS version and environment |

Full reference: [docs/CLI.md](docs/CLI.md)

---

## Install Sources

```bash
aios install ./my-claude-skill           # Local directory
aios install git:https://github.com/org/skill  # Git repository
aios install npm:@aios/provider-anthropic  # npm package
aios install npm:@aios/starter-pack        # AIOS Pack (multiple capabilities)
```

---

## Documentation

- [Quickstart](docs/QUICKSTART.md)
- [Installation](docs/INSTALL.md)
- [CLI Reference](docs/CLI.md)
- [Configuration](docs/CONFIG.md)
- [AIOS Packs](docs/PACKS.md)
- [Semantic Frontends](docs/SEMANTIC-FRONTENDS.md)
- [Protocol Adapters](docs/ADAPTERS.md)
- [Architecture](docs/ARCHITECTURE.md)

---

## License

MIT — see [LICENSE](LICENSE)
