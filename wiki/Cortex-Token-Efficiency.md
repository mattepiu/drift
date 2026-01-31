# Cortex Token Efficiency

Cortex V2 introduces a sophisticated token management system that reduces context retrieval costs by 5-15x while maintaining retrieval quality.

## Overview

Traditional memory systems send full context every time. Cortex V2 uses:
- **Hierarchical compression** — 4 levels of detail
- **Session deduplication** — Never send the same memory twice
- **Smart budget management** — Fit maximum value in minimum tokens

## Compression Levels

| Level | Name | Tokens | Use Case |
|-------|------|--------|----------|
| 0 | IDs Only | ~10 | Reference tracking |
| 1 | One-liners | ~50 | Quick summaries |
| 2 | With Examples | ~200 | Working context |
| 3 | Full Detail | ~500+ | Deep dives |

### Level 0: IDs Only
```json
{
  "id": "mem_abc123",
  "type": "tribal_knowledge"
}
```

### Level 1: One-liners
```json
{
  "id": "mem_abc123",
  "type": "tribal_knowledge",
  "summary": "Always use bcrypt for password hashing, never MD5"
}
```

### Level 2: With Examples
```json
{
  "id": "mem_abc123",
  "type": "tribal_knowledge",
  "summary": "Always use bcrypt for password hashing, never MD5",
  "example": "const hash = await bcrypt.hash(password, 10);",
  "context": "Security requirement from 2024 audit"
}
```

### Level 3: Full Detail
```json
{
  "id": "mem_abc123",
  "type": "tribal_knowledge",
  "summary": "Always use bcrypt for password hashing, never MD5",
  "content": "Full explanation with rationale...",
  "example": "const hash = await bcrypt.hash(password, 10);",
  "context": "Security requirement from 2024 audit",
  "causalChain": [...],
  "relatedMemories": [...],
  "confidence": 0.95,
  "usageCount": 47
}
```

## Session Deduplication

The session context tracks what's been sent:

```typescript
interface SessionContext {
  loadedMemories: Set<string>;  // Memory IDs already sent
  loadedPatterns: Set<string>;  // Pattern IDs already sent
  tokensSent: number;           // Running token count
  queriesMade: number;          // Query count
}
```

When retrieving memories:
1. Check if memory ID is in `loadedMemories`
2. If yes, skip or send Level 0 reference only
3. If no, send at requested compression level
4. Add to `loadedMemories`

## Budget Management

### Token Budget Allocation

```typescript
const budget = {
  total: 4000,
  allocation: {
    patterns: 0.4,      // 1600 tokens
    tribal: 0.3,        // 1200 tokens
    constraints: 0.2,   // 800 tokens
    antipatterns: 0.1   // 400 tokens
  }
};
```

### Dynamic Level Selection

The system automatically selects compression levels based on:
- Available budget
- Memory relevance score
- Whether memory was previously sent

```typescript
function selectLevel(memory: Memory, budget: number, session: SessionContext): CompressionLevel {
  if (session.loadedMemories.has(memory.id)) {
    return CompressionLevel.IdsOnly;  // Already sent
  }
  
  if (budget < 50) return CompressionLevel.IdsOnly;
  if (budget < 200) return CompressionLevel.OneLiners;
  if (budget < 500) return CompressionLevel.WithExamples;
  return CompressionLevel.FullDetail;
}
```

## Usage Examples

### Basic Context Retrieval
```typescript
const context = await cortex.getContext('add_feature', 'authentication', {
  maxTokens: 2000,
  compressionLevel: 2,  // With examples
});
```

### Budget-Aware Retrieval
```typescript
const context = await cortex.getContext('fix_bug', 'payment', {
  maxTokens: 1000,
  compressionLevel: 'auto',  // System chooses
  prioritize: ['patterns', 'constraints'],
});
```

### Session-Aware Retrieval
```typescript
// First query - full context
const ctx1 = await cortex.getContext('add_feature', 'auth');
// ~2000 tokens

// Second query - deduplicated
const ctx2 = await cortex.getContext('add_feature', 'auth/login');
// ~500 tokens (shared memories skipped)
```

## MCP Tool: `drift_memory_for_context`

```json
{
  "intent": "add_feature",
  "focus": "authentication",
  "maxTokens": 2000,
  "compressionLevel": 2,
  "sessionId": "session_abc123"
}
```

Response includes token tracking:
```json
{
  "memories": [...],
  "tokenUsage": {
    "used": 1847,
    "budget": 2000,
    "saved": 3200,
    "deduplicatedCount": 5
  }
}
```

## Performance Benchmarks

| Scenario | Without V2 | With V2 | Reduction |
|----------|------------|---------|-----------|
| First query | 8000 tokens | 2000 tokens | 4x |
| Follow-up query | 8000 tokens | 500 tokens | 16x |
| Multi-file session | 24000 tokens | 3000 tokens | 8x |

## Best Practices

1. **Use session IDs** — Enable deduplication across queries
2. **Start with Level 2** — Good balance of detail and efficiency
3. **Let the system choose** — Use `compressionLevel: 'auto'`
4. **Monitor token usage** — Check `tokenUsage` in responses

## Related Documentation

- [Cortex V2 Overview](Cortex-V2-Overview.md)
- [Causal Graphs](Cortex-Causal-Graphs.md)
- [MCP Tools Reference](MCP-Tools-Reference.md)
