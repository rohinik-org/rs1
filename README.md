# Rohinik — The Intelligent Computing Platform

Rohinik compiles existing AI ecosystems into a unified, local, deterministic runtime.
Install Claude Skills, Cursor Rules, MCP servers, or custom capabilities — without rewriting them.

**Rohinik OS 1.0 implements the RS-1 Runtime System architecture, specified in AFS-0001.**

| Component | Name |
|-----------|------|
| Platform | Rohinik |
| Product | Rohinik OS |
| Architecture | RS-1 (Runtime System, Revision 1) |
| Runtime | Rohinik Runtime |
| CLI binary | `rhk` |
| Daemon | `rhkd` |
| Config file | `rohinik.yaml` |
| State directory | `.rohinik/` |
| npm scope | `@rohinik-org/*` |

---

## The 5-Minute Example

```bash
# Install Rohinik
npm install -g @rohinik-org/cli@beta

# Clone a community Claude Skill (no Rohinik-specific code)
git clone https://github.com/joseguiaCES/autocad-dotnet-claude-skill
rhk install ./autocad-dotnet-claude-skill

# See what was compiled
rhk inspect autocad

# Execute it
rhk run "Create a flange with 8 bolt holes"
```

Rohinik detected the Claude Skill, compiled it into a native capability, and made it executable.

---

## Install

```bash
npm install -g @rohinik-org/cli@beta
```

Requires Node.js ≥ 22.0.0

```bash
rhk doctor
```

---

## Key Concepts

**Semantic Compiler** — Rohinik translates external AI formats (Claude Skills, Cursor Rules, MCP servers) into Rohinik-native capability artifacts. You bring what already exists; Rohinik compiles it.

**Capability Catalog** — Every installed capability is tracked in `.rohinik/catalog.json`. List, inspect, upgrade, and remove capabilities with standard CLI commands.

**Execution Corpus** — Every routing decision is recorded as an immutable `ExecutionRecord` in `.rohinik/corpus/`. Query it with `rhk corpus stats`.

---

## Commands

| Command | Description |
|---------|-------------|
| `rhk doctor` | Verify environment, config, and installed packages |
| `rhk install <source>` | Install a Claude Skill, Cursor Rule, MCP adapter, or pack |
| `rhk inspect <id>` | Show compiled capability details |
| `rhk search <term>` | Search installed capabilities |
| `rhk list` | List all installed packages |
| `rhk run "<request>"` | Execute a natural language request |
| `rhk corpus stats` | View execution history |
| `rhk quickstart` | Guided onboarding |
| `rhk demo` | Walk through the compiler pipeline |
| `rhk version` | Show Rohinik version and environment |

Full reference: [docs/CLI.md](docs/CLI.md)

---

## Install Sources

```bash
rhk install ./my-claude-skill           # Local directory
rhk install git:https://github.com/org/skill  # Git repository
rhk install npm:@rohinik-org/provider-anthropic  # npm package
rhk install npm:@rohinik-org/starter-pack        # Rohinik Pack (multiple capabilities)
```

---

## Documentation

- [Quickstart](docs/QUICKSTART.md)
- [Installation](docs/INSTALL.md)
- [CLI Reference](docs/CLI.md)
- [Configuration](docs/CONFIG.md)
- [Rohinik Packs](docs/PACKS.md)
- [Semantic Frontends](docs/SEMANTIC-FRONTENDS.md)
- [Protocol Adapters](docs/ADAPTERS.md)
- [Architecture](docs/ARCHITECTURE.md)

---

## License

MIT — see [LICENSE](LICENSE)
