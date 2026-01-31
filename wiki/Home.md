# Drift — Codebase Intelligence for AI Agents

**Make AI write code that actually fits your codebase.**

Drift scans your code, learns your patterns, and gives AI agents deep understanding of your conventions. 50+ MCP tools. 60+ CLI commands. 10 languages. Native Rust core.

---

## 🚫 Delete Your AGENTS.md

That static `AGENTS.md` file you wrote once and forgot about? It's stale. Replace it with **Cortex** — a living memory system:

```bash
drift memory init
drift memory add tribal "Always use bcrypt for passwords" --importance critical
drift memory add tribal "Services should not call controllers" --topic Architecture

# AI gets context dynamically, learns from corrections, confidence decays on stale knowledge
```

→ [Learn about Cortex Memory](Cortex-V2-Overview) | [Memory CLI Reference](Memory-CLI)

---

## ⚡ Quick Start (2 minutes)

```bash
# Install
npm install -g driftdetect

# Scan your project
cd your-project
drift init
drift scan

# See what Drift found
drift status
```

**That's it.** Drift now understands your codebase.

→ [Full Getting Started Guide](Getting-Started)

---

## 🤖 Connect AI (5 minutes)

```bash
# Install MCP server
npm install -g driftdetect-mcp
```

Add to your AI tool's config:

```json
{
  "mcpServers": {
    "drift": {
      "command": "driftdetect-mcp"
    }
  }
}
```

→ [Full MCP Setup Guide](MCP-Setup)

---

## 📊 Current Version: 0.9.40

| Package | Version | npm |
|---------|---------|-----|
| CLI (`driftdetect`) | 0.9.40 | [npm](https://www.npmjs.com/package/driftdetect) |
| MCP Server (`driftdetect-mcp`) | 0.9.39 | [npm](https://www.npmjs.com/package/driftdetect-mcp) |
| Core (`driftdetect-core`) | 0.9.39 | [npm](https://www.npmjs.com/package/driftdetect-core) |
| Native (`driftdetect-native`) | 0.9.39 | [npm](https://www.npmjs.com/package/driftdetect-native) |

**Upgrade:** `npm install -g driftdetect@latest driftdetect-mcp@latest`

---

## The Problem

AI writes code that works but doesn't fit. It ignores your conventions, misses your patterns, and creates inconsistency. You spend more time fixing AI output than you saved.

**Drift fixes this.**

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR CODEBASE                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        1. DRIFT SCAN                             │
│   $ drift init && drift scan                                     │
│   Analyzes code with Tree-sitter parsing:                        │
│   • Discovers patterns (how YOU write code)                      │
│   • Builds call graph (who calls what, data flow)                │
│   • Maps security boundaries (sensitive data access)             │
│   • Tracks test coverage (which code is tested)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      2. PATTERN LEARNING                         │
│   Drift discovers YOUR conventions:                              │
│   • API patterns (routes, middleware, response format)           │
│   • Auth patterns (decorators, guards, middleware)               │
│   • Error patterns (try/catch, Result types, boundaries)         │
│   You approve what matters: $ drift approve <pattern-id>         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      3. AI GETS CONTEXT                          │
│   drift_context({ intent: "add_feature", focus: "auth" })        │
│   Returns:                                                       │
│   • Your patterns with examples                                  │
│   • Similar code in your codebase                                │
│   • Files to modify                                              │
│   • Security warnings                                            │
│   • Constraints to satisfy                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   4. AI WRITES FITTING CODE                      │
│   Generated code matches YOUR patterns automatically             │
└─────────────────────────────────────────────────────────────────┘
```

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Languages** | 10 | TypeScript, JavaScript, Python, Java, C#, PHP, Go, Rust, C, C++ |
| **Web Frameworks** | 21 | Express, NestJS, Next.js, Spring Boot, ASP.NET, Laravel, FastAPI, Gin, Echo, Actix, Axum, and more |
| **ORMs** | 16 | Prisma, TypeORM, Sequelize, Django ORM, Entity Framework, Eloquent, SQLAlchemy, and more |
| **Pattern Detectors** | 400+ | API, Auth, Security, Errors, Logging, Testing, Data Access, and more |
| **MCP Tools** | 50 | Organized in 7 layers for efficient AI interaction |
| **CLI Commands** | 45+ | Full analysis and management capabilities |

→ [Full Language Support](Language-Support)

---

## Key Features

| Feature | Description | Learn More |
|---------|-------------|------------|
| **Pattern Detection** | Discovers how YOU write code across 15 categories | [Pattern Categories](Pattern-Categories) |
| **Cortex Memory** | AI memory system that learns from your codebase | [Cortex V2 Overview](Cortex-V2-Overview) |
| **Call Graph** | Maps function calls and data flow | [Call Graph Analysis](Call-Graph-Analysis) |
| **Security Analysis** | Tracks sensitive data access | [Security Analysis](Security-Analysis) |
| **Test Topology** | Maps tests to code | [Test Topology](Test-Topology) |
| **Coupling Analysis** | Finds dependency cycles | [Coupling Analysis](Coupling-Analysis) |
| **Error Handling** | Detects unhandled errors | [Error Handling Analysis](Error-Handling-Analysis) |
| **Quality Gates** | CI/CD integration | [Quality Gates](Quality-Gates) |
| **MCP Server** | 50+ tools for AI agents | [MCP Tools Reference](MCP-Tools-Reference) |

---

## Documentation

### Getting Started
- [Getting Started](Getting-Started) — Installation and first scan
- [Configuration](Configuration) — Project configuration options
- [MCP Setup](MCP-Setup) — Connect to Claude, Cursor, Windsurf, Kiro
- [Dashboard](Dashboard) — Web visualization

### Core Concepts
- [Architecture](Architecture) — How Drift works under the hood
- [Pattern Categories](Pattern-Categories) — The 15 pattern categories
- [Detectors Deep Dive](Detectors-Deep-Dive) — 400+ detectors explained
- [Language Support](Language-Support) — 10 languages, 21 frameworks, 16 ORMs
- [Skills](Skills) — 72 implementation guides for AI agents

### Cortex Memory System
- [Cortex V2 Overview](Cortex-V2-Overview) — AI memory system overview
- [Memory CLI](Memory-CLI) — CLI commands for memory management
- [Learning System](Cortex-Learning-System) — How Cortex learns from corrections
- [Token Efficiency](Cortex-Token-Efficiency) — Compression and deduplication
- [Causal Graphs](Cortex-Causal-Graphs) — Memory relationships and "why" explanations
- [Code Generation](Cortex-Code-Generation) — Context for AI code generation
- [Predictive Retrieval](Cortex-Predictive-Retrieval) — Anticipating memory needs

### Analysis Features
- [Call Graph Analysis](Call-Graph-Analysis) — Data flow and reachability
- [Impact Analysis](Impact-Analysis) — Understand blast radius of changes
- [Security Analysis](Security-Analysis) — Sensitive data tracking
- [Data Boundaries](Data-Boundaries) — Data access enforcement
- [Test Topology](Test-Topology) — Test coverage mapping
- [Coupling Analysis](Coupling-Analysis) — Dependency analysis
- [Error Handling Analysis](Error-Handling-Analysis) — Error handling gaps
- [Wrappers Detection](Wrappers-Detection) — Framework wrapper patterns
- [Environment Variables](Environment-Variables) — Env var analysis
- [Constants Analysis](Constants-Analysis) — Constants and magic numbers
- [Styling DNA](Styling-DNA) — Component styling patterns

### AI Tools
- [Code Examples](Code-Examples) — Get real code snippets
- [Similar Code](Similar-Code) — Find semantically similar code
- [Explain Tool](Explain-Tool) — Comprehensive code explanation
- [Suggest Changes](Suggest-Changes) — AI-guided fix suggestions
- [Validate Change](Validate-Change) — Pre-commit validation
- [AI Navigation Guide](AI-Navigation-Guide) — Tool selection decision tree

### Advanced Features
- [Constraints](Constraints) — Architectural invariants
- [Contracts](Contracts) — API contract verification
- [Decision Mining](Decision-Mining) — ADRs from git history
- [Speculative Execution](Speculative-Execution) — Simulate before coding
- [Watch Mode](Watch-Mode) — Real-time pattern detection
- [Trends Analysis](Trends-Analysis) — Pattern regressions
- [Projects Management](Projects-Management) — Multi-project registry
- [Package Context](Package-Context) — Monorepo package context
- [Monorepo Support](Monorepo-Support) — Working with monorepos
- [Reports & Export](Reports-Export) — Generate reports

### Reference
- [CLI Reference](CLI-Reference) — All 45+ CLI commands
- [MCP Tools Reference](MCP-Tools-Reference) — All 50 MCP tools
- [MCP Architecture](MCP-Architecture) — The 7-layer tool design
- [Quality Gates](Quality-Gates) — CI/CD integration

### CI/CD
- [Incremental Scans](Incremental-Scans) — Efficient re-scanning
- [CI Integration](CI-Integration) — GitHub/GitLab setup
- [Git Hooks](Git-Hooks) — Pre-commit integration
- [Audit System](Audit-System) — Pattern audit and auto-approval

### Community
- [Contributing](Contributing) — How to contribute
- [Troubleshooting](Troubleshooting) — Common issues and fixes
- [FAQ](FAQ) — Frequently asked questions

---

## Architecture Overview

Drift is a **monorepo** with a Rust core and TypeScript packages:

### Rust Core
| Crate | Purpose |
|-------|---------|
| `drift-core` | 12 native analysis modules |
| `drift-napi` | Node.js bindings via NAPI |

### TypeScript Packages
| Package | npm Name | Purpose |
|---------|----------|---------|
| Core | `driftdetect-core` | Analysis orchestration + native bindings |
| Detectors | `driftdetect-detectors` | 400+ pattern detectors |
| CLI | `driftdetect` | Command-line interface |
| MCP | `driftdetect-mcp` | MCP server for AI agents |
| LSP | `driftdetect-lsp` | Language Server Protocol |
| Dashboard | `driftdetect-dashboard` | Web dashboard |
| Galaxy | `driftdetect-galaxy` | 3D visualization |

---

## Security & Privacy

Drift runs **100% locally**. Your code never leaves your machine.

| Aspect | Details |
|--------|---------|
| **Reads** | Source files in your project directory |
| **Writes** | `.drift/` directory only |
| **Network** | No outbound calls for analysis |
| **Telemetry** | Anonymous usage stats, opt-out with `drift telemetry disable` |

---

## License

**Open Core** model:
- **Core packages**: Apache 2.0 (fully open source)
- **Enterprise features**: BSL 1.1 (converts to Apache 2.0 after 4 years)

Individual developers and small teams use Drift completely free.

See [licenses/LICENSING.md](https://github.com/dadbodgeoff/drift/blob/main/licenses/LICENSING.md) for details.

---

## Links

- [GitHub Repository](https://github.com/dadbodgeoff/drift)
- [npm Package](https://www.npmjs.com/package/driftdetect)
- [Issues](https://github.com/dadbodgeoff/drift/issues)
- [Discussions](https://github.com/dadbodgeoff/drift/discussions)
