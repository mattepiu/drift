# Cortex Code Generation Context

Cortex V2 provides rich context for AI code generation, ensuring generated code follows established patterns and avoids known anti-patterns.

## Overview

When generating code, Cortex V2 provides:
- **Relevant patterns** — How similar code is written
- **Tribal knowledge** — Team conventions and preferences
- **Constraints** — Rules that must be followed
- **Anti-patterns** — What to avoid
- **Provenance tracking** — What influenced the generation

## Generation Context Structure

```typescript
interface GenerationContext {
  target: GenerationTarget;
  patterns: PatternContext[];
  tribal: TribalContext[];
  constraints: ConstraintContext[];
  antipatterns: AntipatternContext[];
  provenance: ProvenanceTracker;
}
```

## Context Gathering

### Pattern Gathering
Finds relevant patterns for the generation target:
```typescript
const patterns = await patternGatherer.gather({
  targetFile: 'src/api/users.ts',
  intent: 'add_feature',
  focus: 'user CRUD'
});

// Returns patterns like:
// - REST controller pattern
// - Error handling pattern
// - Validation pattern
```

### Tribal Knowledge Gathering
Finds team conventions:
```typescript
const tribal = await tribalGatherer.gather({
  targetFile: 'src/api/users.ts',
  categories: ['naming', 'style', 'architecture']
});

// Returns knowledge like:
// - "Use camelCase for function names"
// - "Controllers should be thin"
// - "Always validate input at boundaries"
```

### Constraint Gathering
Finds rules that must be followed:
```typescript
const constraints = await constraintGatherer.gather({
  targetFile: 'src/api/users.ts'
});

// Returns constraints like:
// - "All API routes must use authentication middleware"
// - "Database queries must use parameterized queries"
```

### Anti-pattern Gathering
Finds what to avoid:
```typescript
const antipatterns = await antipatternGatherer.gather({
  targetFile: 'src/api/users.ts'
});

// Returns anti-patterns like:
// - "Don't use string concatenation for SQL"
// - "Avoid synchronous file operations"
```

## Provenance Tracking

Track what memories influenced generated code:

```typescript
interface CodeProvenance {
  generatedAt: Date;
  targetFile: string;
  influencingMemories: InfluencingMemory[];
  confidenceScore: number;
}

interface InfluencingMemory {
  memoryId: string;
  influence: 'pattern' | 'constraint' | 'tribal' | 'antipattern';
  weight: number;
  excerpt: string;
}
```

### Adding Provenance Comments
```typescript
const code = await generator.generate(context);
const withProvenance = provenanceTracker.addComments(code, provenance);

// Result:
// /**
//  * @drift-provenance
//  * - Pattern: REST controller (mem_abc123)
//  * - Constraint: Auth required (mem_def456)
//  */
// export async function createUser(req, res) { ... }
```

## Validation

Validate generated code against patterns:

```typescript
const validation = await validator.validate(generatedCode, {
  targetFile: 'src/api/users.ts',
  strictMode: true
});

// Returns:
// {
//   valid: false,
//   violations: [
//     { rule: 'auth-required', message: 'Missing auth middleware' }
//   ],
//   suggestions: [
//     { fix: 'Add @RequireAuth decorator', confidence: 0.9 }
//   ]
// }
```

## API Usage

### Get Generation Context
```typescript
const context = await cortex.getGenerationContext({
  targetFile: 'src/api/users.ts',
  intent: 'add_feature',
  focus: 'create user endpoint',
  maxTokens: 3000
});
```

### Validate Generated Code
```typescript
const result = await cortex.validateGenerated(code, {
  targetFile: 'src/api/users.ts',
  checkPatterns: true,
  checkConstraints: true,
  checkAntipatterns: true
});
```

### Record Outcome
```typescript
// After code is accepted/rejected
await cortex.recordOutcome({
  generatedCode: code,
  outcome: 'accepted',  // or 'modified', 'rejected'
  modifications: diff,   // if modified
  provenance: provenance
});
```

## MCP Integration

### `drift_context` with Generation Focus
```json
{
  "intent": "add_feature",
  "focus": "user authentication",
  "question": "How do I add a new auth endpoint?"
}
```

### `drift_prevalidate`
```json
{
  "code": "export async function createUser(...) { ... }",
  "targetFile": "src/api/users.ts",
  "kind": "function"
}
```

### `drift_validate_change`
```json
{
  "file": "src/api/users.ts",
  "content": "// full file content",
  "strictMode": true
}
```

## Feedback Loop

Generated code outcomes feed back into learning:

```
┌─────────────────┐
│  Generate Code  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Reviews   │
│  - Accept       │
│  - Modify       │
│  - Reject       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Record Outcome │
│  - Update conf. │
│  - Learn from   │
│    modifications│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Improve Future │
│  Generations    │
└─────────────────┘
```

## Best Practices

1. **Always get context** — Don't generate blind
2. **Check constraints** — Validate before presenting
3. **Track provenance** — Know what influenced code
4. **Record outcomes** — Enable learning from results
5. **Use strict mode** — For critical code paths

## Related Documentation

- [Cortex V2 Overview](Cortex-V2-Overview.md)
- [Learning System](Cortex-Learning-System.md)
- [Token Efficiency](Cortex-Token-Efficiency.md)
- [MCP Tools Reference](MCP-Tools-Reference.md)
