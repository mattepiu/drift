# Cortex V2 Overview

Cortex V2 is Drift's intelligent memory system that learns from your codebase and interactions to provide contextual guidance during development.

---

## 🚫 Stop Maintaining AGENTS.md

You know that `AGENTS.md` or `CLAUDE.md` file in your repo? The one you wrote once, forgot about, and is now completely stale? **Delete it.**

Cortex replaces static instruction files with a living memory system:

| Static AGENTS.md | Cortex Memory |
|------------------|---------------|
| Written once, forgotten | Learns continuously from corrections |
| Gets stale immediately | Confidence decays on unused memories |
| Manual updates required | Self-correcting through feedback |
| One-size-fits-all dump | Intent-aware retrieval |
| No way to know if accurate | Validation and health monitoring |
| Clutters your repo | Stored in `.drift/memory/` |

### Migration from AGENTS.md

```bash
# Initialize Cortex
drift memory init

# Add your key knowledge (instead of writing AGENTS.md)
drift memory add tribal "Always use bcrypt for passwords" --importance critical
drift memory add tribal "Services should not call controllers directly" --topic Architecture
drift memory add procedural "Deploy: 1) Run tests 2) Build 3) Push to main" --topic Deployment

# Now AI gets context dynamically
drift memory why "authentication"  # Returns relevant memories

# And learns from corrections automatically
drift memory learn --original "Used MD5" --feedback "Use bcrypt instead"
```

Your knowledge stays current because:
- **Corrections create new memories** — AI learns from mistakes
- **Confidence decays** — Stale memories fade naturally  
- **Feedback calibrates** — Confirm or reject memories
- **Consolidation prunes** — Old episodic memories merge into semantic knowledge

---

## Key Features

### 🧠 Causal Memory Graph
- Memories are linked with causal relationships (derived_from, supersedes, supports, contradicts)
- Understand WHY patterns exist, not just WHAT they are
- Trace the origin of any piece of knowledge

### 📚 Memory Types
- **Tribal Knowledge**: Team conventions and unwritten rules
- **Pattern Rationales**: Why specific patterns are used
- **Decision Context**: Historical decisions and their reasoning
- **Code Smells**: Anti-patterns to avoid
- **Procedural**: Step-by-step processes and checklists

### 🎯 Intent-Aware Retrieval
- Retrieval adapts based on what you're trying to do
- `add_feature`, `fix_bug`, `refactor`, `security_audit`, `understand_code`, `add_test`
- Prioritizes relevant memories for each intent

### 💡 Active Learning
- Learns from corrections and feedback
- Confidence calibration based on usage
- Automatic validation of low-confidence memories

### 🗜️ Token Efficiency
- Hierarchical compression (3 levels)
- Session-based deduplication
- Smart budget management

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CortexV2                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   Retrieval     │  │    Learning     │  │  Generation  │ │
│  │  Orchestrator   │  │  Orchestrator   │  │ Orchestrator │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘ │
│           │                    │                   │         │
│  ┌────────┴────────────────────┴───────────────────┴───────┐ │
│  │                    Memory Storage                        │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │
│  │  │ SQLite   │  │ Causal   │  │ Session  │  │Prediction│ │ │
│  │  │ Storage  │  │ Graph    │  │ Context  │  │  Cache   │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Get Context for a Task
```typescript
import { getCortex } from 'driftdetect-cortex';

const cortex = await getCortex();
const context = await cortex.getContext('add_feature', 'authentication', {
  maxTokens: 2000,
  compressionLevel: 2,
});
```

### Learn from a Correction
```typescript
await cortex.learn(
  'Use MD5 for hashing',
  'MD5 is insecure. Use bcrypt or argon2.',
  'const hash = await bcrypt.hash(password, 10);',
  { activeFile: 'src/auth.ts', intent: 'fix_bug' }
);
```

### Get "Why" Explanation
```typescript
const why = await cortex.getWhy('understand_code', 'authentication');
console.log(why.narrative);
// "Authentication uses JWT because of the decision to support 
//  stateless API design. This led to the middleware-auth pattern..."
```

## MCP Tools

Cortex V2 exposes these MCP tools:

| Tool | Description |
|------|-------------|
| `drift_why` | Get causal narrative explaining WHY |
| `drift_memory_status` | Health overview with recommendations |
| `drift_memory_for_context` | Get memories for current context |
| `drift_memory_search` | Search with session deduplication |
| `drift_memory_add` | Add with causal inference |
| `drift_memory_learn` | Learn from corrections |
| `drift_memory_feedback` | Confirm/reject/modify memories |
| `drift_memory_health` | Comprehensive health report |
| `drift_memory_explain` | Causal explanations |
| `drift_memory_predict` | Predicted memories for context |
| `drift_memory_conflicts` | Detect memory conflicts |
| `drift_memory_graph` | Visualize relationships |
| `drift_memory_validate` | Validate and heal memories |
| `drift_memory_get` | Get memory with causal chain |

## Related Documentation

- [Token Efficiency](Cortex-Token-Efficiency.md)
- [Causal Graphs](Cortex-Causal-Graphs.md)
- [Learning System](Cortex-Learning-System.md)
- [MCP Tools Reference](MCP-Tools-Reference.md)
