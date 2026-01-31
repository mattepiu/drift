# Cortex Causal Graphs

Causal graphs are the foundation of Cortex V2's "why" explanations. They connect memories with causal relationships, enabling narrative generation and deep understanding.

## Overview

Traditional memory systems store isolated facts. Cortex V2 connects them:

```
┌─────────────────┐     caused      ┌─────────────────┐
│ Security Audit  │ ───────────────▶│ bcrypt Adoption │
│ (Jan 2024)      │                 │                 │
└─────────────────┘                 └────────┬────────┘
                                             │
                                             │ derived_from
                                             ▼
                                    ┌─────────────────┐
                                    │ Password Hash   │
                                    │ Pattern         │
                                    └─────────────────┘
```

## Causal Relation Types

| Relation | Description | Example |
|----------|-------------|---------|
| `caused` | Direct causation | "Security audit caused bcrypt adoption" |
| `enabled` | Made possible | "TypeScript enabled strict null checks" |
| `prevented` | Blocked outcome | "Rate limiting prevented DDoS" |
| `contradicts` | Conflicts with | "MD5 usage contradicts security policy" |
| `supersedes` | Replaces | "bcrypt supersedes MD5 for hashing" |
| `supports` | Reinforces | "Unit tests support refactoring safety" |
| `derived_from` | Based on | "Login pattern derived from auth spec" |
| `triggered_by` | Initiated by | "Migration triggered by performance issue" |

## Causal Edge Structure

```typescript
interface CausalEdge {
  id: string;
  sourceId: string;      // Memory that caused
  targetId: string;      // Memory that was affected
  relation: CausalRelation;
  strength: number;      // 0.0 - 1.0
  evidence: string[];    // Supporting evidence IDs
  createdAt: Date;
  validatedAt?: Date;
}
```

## Automatic Inference

Cortex V2 automatically infers causal relationships using four strategies:

### 1. Temporal Inference
Memories created close in time may be related:
```typescript
// If memory B was created within 1 hour of memory A
// and they share entities, infer: A -> triggered_by -> B
```

### 2. Semantic Inference
Memories with similar content may be related:
```typescript
// If memory A mentions "bcrypt" and memory B is about "password hashing"
// infer: A -> supports -> B
```

### 3. Entity Inference
Memories mentioning the same entities are likely related:
```typescript
// If both memories mention "UserService"
// infer: A -> derived_from -> B (if A is newer)
```

### 4. Explicit Inference
Direct references in content:
```typescript
// If memory A says "because of the security audit"
// and memory B is about the security audit
// infer: A -> caused -> B
```

## Graph Traversal

### Trace Origins
Find what caused a memory:
```typescript
const origins = await causalGraph.traceOrigins('mem_abc123', {
  maxDepth: 3,
  minStrength: 0.5
});
// Returns: [Security Audit] -> [bcrypt Decision] -> [Password Pattern]
```

### Trace Effects
Find what a memory influenced:
```typescript
const effects = await causalGraph.traceEffects('mem_security_audit', {
  maxDepth: 5
});
// Returns all downstream decisions and patterns
```

### Find Path
Find connection between two memories:
```typescript
const path = await causalGraph.findPath('mem_audit', 'mem_login_pattern');
// Returns: [Audit] -> caused -> [bcrypt] -> derived_from -> [Login Pattern]
```

## Narrative Generation

Causal chains are converted to human-readable narratives:

### Input: Causal Chain
```json
{
  "nodes": [
    { "id": "mem_1", "summary": "Security audit in Jan 2024" },
    { "id": "mem_2", "summary": "Adopted bcrypt for password hashing" },
    { "id": "mem_3", "summary": "Login endpoint uses bcrypt" }
  ],
  "edges": [
    { "source": "mem_1", "target": "mem_2", "relation": "caused" },
    { "source": "mem_2", "target": "mem_3", "relation": "derived_from" }
  ]
}
```

### Output: Narrative
```
The login endpoint uses bcrypt for password hashing. This pattern was 
derived from the team's decision to adopt bcrypt, which was caused by 
the security audit conducted in January 2024.
```

## MCP Tools

### `drift_memory_graph`
Visualize memory relationships:
```json
{
  "memoryId": "mem_abc123",
  "direction": "both",
  "maxDepth": 3,
  "format": "mermaid"
}
```

### `drift_memory_explain`
Get causal explanation:
```json
{
  "memoryId": "mem_abc123",
  "includeNarrative": true
}
```

### `drift_why`
Get "why" narrative for a topic:
```json
{
  "intent": "understand_code",
  "focus": "authentication"
}
```

## Storage Schema

```sql
CREATE TABLE causal_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  strength REAL DEFAULT 1.0,
  evidence TEXT,  -- JSON array
  created_at TEXT,
  validated_at TEXT,
  
  FOREIGN KEY (source_id) REFERENCES memories(id),
  FOREIGN KEY (target_id) REFERENCES memories(id)
);

CREATE INDEX idx_causal_source ON causal_edges(source_id);
CREATE INDEX idx_causal_target ON causal_edges(target_id);
```

## Best Practices

1. **Validate inferences** — Review auto-inferred relationships
2. **Add explicit edges** — When you know the causation
3. **Use strength scores** — Higher for confirmed relationships
4. **Prune weak edges** — Remove edges with strength < 0.3

## Related Documentation

- [Cortex V2 Overview](Cortex-V2-Overview.md)
- [Learning System](Cortex-Learning-System.md)
- [MCP Tools Reference](MCP-Tools-Reference.md)
