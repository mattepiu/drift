# Drift Cortex

> **"The only AI memory system that understands code as code, not text."**

Drift Cortex is the memory layer for Drift, providing persistent, intelligent memory that makes AI agents truly understand your codebase.

## Features

- **9 Memory Types**: Core, Tribal, Procedural, Semantic, Episodic, PatternRationale, ConstraintOverride, DecisionContext, CodeSmell
- **Bitemporal Tracking**: Know when you learned something AND when it was true
- **Self-Healing Validation**: Memories stay synchronized with actual code
- **Sleep-Inspired Consolidation**: Episodic memories compress into semantic knowledge
- **Intent-Aware Retrieval**: Different intents weight different memory types
- **Multi-Provider Embeddings**: Local (Transformers.js), OpenAI, Ollama

## Installation

```bash
pnpm add driftdetect-cortex
```

## Quick Start

```typescript
import { Cortex } from 'driftdetect-cortex';

// Initialize
const cortex = await Cortex.create({
  dbPath: '.drift/cortex/memory.db',
  embeddingProvider: 'local', // or 'openai', 'ollama'
});

// Add tribal knowledge
await cortex.add({
  type: 'tribal',
  topic: 'authentication',
  knowledge: 'Never store JWT secrets in environment variables on the client',
  severity: 'critical',
});

// Retrieve context-aware memories
const memories = await cortex.retrieve({
  intent: 'add_feature',
  focus: 'user authentication',
  maxTokens: 2000,
});
```

## Memory Types

| Type | Purpose | Half-Life |
|------|---------|-----------|
| Core | Project identity, preferences | ∞ |
| Tribal | Institutional knowledge | 365 days |
| Procedural | How-to procedures | 180 days |
| Semantic | Consolidated knowledge | 90 days |
| Episodic | Interaction history | 7 days |
| PatternRationale | Why patterns exist | 180 days |
| ConstraintOverride | Approved exceptions | 90 days |
| DecisionContext | Human context for ADRs | 180 days |
| CodeSmell | Patterns to avoid | 90 days |

## MCP Tools

- `drift_memory_status` - Health overview
- `drift_memory_add` - Add new memory
- `drift_memory_search` - Semantic search
- `drift_memory_for_context` - Context-aware retrieval
- `drift_why` - Complete "why" context
- `drift_memory_validate` - Self-healing validation
- `drift_memory_consolidate` - Trigger consolidation

## License

Apache-2.0
