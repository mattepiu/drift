# Cortex Learning System

The Learning System enables Cortex V2 to improve from corrections and feedback, creating a continuously improving knowledge base.

## Overview

When you correct the AI, Cortex V2:
1. **Analyzes** the correction to understand what went wrong
2. **Categorizes** it into one of 10 correction types
3. **Extracts** generalizable principles
4. **Creates** new memories from the learning
5. **Calibrates** confidence based on evidence

## Correction Categories

| Category | Description | Example |
|----------|-------------|---------|
| `security` | Security-related corrections | "Don't use MD5, use bcrypt" |
| `performance` | Performance improvements | "Use pagination for large lists" |
| `style` | Code style preferences | "Use early returns" |
| `architecture` | Structural decisions | "Services shouldn't call controllers" |
| `naming` | Naming conventions | "Use camelCase for functions" |
| `error_handling` | Error handling patterns | "Always wrap async in try-catch" |
| `testing` | Testing practices | "Mock external services" |
| `documentation` | Documentation standards | "Add JSDoc to public functions" |
| `api_design` | API design patterns | "Use REST conventions" |
| `data_handling` | Data management | "Validate input at boundaries" |

## Learning Flow

```
┌─────────────────┐
│   Correction    │
│   "Use bcrypt"  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Analyzer     │
│  - Diff code    │
│  - Extract why  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Categorizer   │
│  → "security"   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Principle     │
│   Extractor     │
│  → "Use secure  │
│    hashing"     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Memory Factory  │
│  - Tribal       │
│  - Pattern      │
│  - Smell        │
└─────────────────┘
```

## API Usage

### Learn from Correction
```typescript
await cortex.learn(
  'Use MD5 for hashing',           // Original (wrong)
  'MD5 is insecure. Use bcrypt.',  // Correction
  'const hash = await bcrypt.hash(password, 10);',  // Correct code
  {
    activeFile: 'src/auth.ts',
    intent: 'fix_bug',
    severity: 'high'
  }
);
```

### Provide Feedback
```typescript
// Confirm a memory is correct
await cortex.feedback('mem_abc123', 'confirmed');

// Reject a memory
await cortex.feedback('mem_abc123', 'rejected', {
  reason: 'This pattern is outdated'
});

// Modify a memory
await cortex.feedback('mem_abc123', 'modified', {
  newContent: 'Updated guidance...'
});
```

## Confidence Calibration

Confidence is calculated from multiple signals:

```typescript
interface ConfidenceMetrics {
  usageCount: number;      // Times memory was used
  confirmations: number;   // Positive feedback
  rejections: number;      // Negative feedback
  age: number;             // Days since creation
  sourceReliability: number; // Trust in source
}

function calculateConfidence(metrics: ConfidenceMetrics): number {
  const usageScore = Math.min(metrics.usageCount / 10, 1) * 0.3;
  const feedbackScore = (metrics.confirmations - metrics.rejections) / 
    (metrics.confirmations + metrics.rejections + 1) * 0.4;
  const ageDecay = Math.exp(-metrics.age / 365) * 0.1;
  const sourceScore = metrics.sourceReliability * 0.2;
  
  return Math.max(0, Math.min(1, usageScore + feedbackScore + ageDecay + sourceScore));
}
```

## Active Learning

The system identifies memories that need validation:

### Validation Candidates
```typescript
interface ValidationCandidate {
  memoryId: string;
  reason: 'low_confidence' | 'conflicting' | 'stale' | 'unused';
  priority: number;
  suggestedPrompt: string;
}
```

### Validation Prompts
```typescript
const candidates = await cortex.getValidationCandidates(5);
// Returns memories that need human review

for (const candidate of candidates) {
  console.log(candidate.suggestedPrompt);
  // "Is this still accurate? 'Always use bcrypt for passwords'"
}
```

## Memory Creation from Learning

### Tribal Knowledge
Created when learning reveals team conventions:
```typescript
{
  type: 'tribal_knowledge',
  content: 'Always use bcrypt for password hashing',
  source: 'correction',
  confidence: 0.8,
  category: 'security'
}
```

### Pattern Rationale
Created when learning explains why a pattern exists:
```typescript
{
  type: 'pattern_rationale',
  content: 'JWT tokens are used because the API is stateless',
  patternId: 'jwt-auth-pattern',
  source: 'correction',
  confidence: 0.75
}
```

### Code Smell
Created when learning identifies anti-patterns:
```typescript
{
  type: 'code_smell',
  content: 'Using MD5 for password hashing is insecure',
  severity: 'high',
  source: 'correction',
  confidence: 0.9
}
```

## MCP Tools

### `drift_memory_learn`
Learn from a correction:
```json
{
  "original": "Use MD5 for hashing",
  "correction": "MD5 is insecure. Use bcrypt.",
  "correctCode": "const hash = await bcrypt.hash(password, 10);",
  "context": {
    "file": "src/auth.ts",
    "intent": "fix_bug"
  }
}
```

### `drift_memory_feedback`
Provide feedback on a memory:
```json
{
  "memoryId": "mem_abc123",
  "action": "confirmed"
}
```

### `drift_memory_validate`
Get memories needing validation:
```json
{
  "limit": 5,
  "includePrompts": true
}
```

## Metrics & Health

Track learning system health:
```typescript
const health = await cortex.getLearningHealth();
// {
//   totalCorrections: 47,
//   categorizedCorrections: 45,
//   principlesExtracted: 32,
//   memoriesCreated: 28,
//   averageConfidence: 0.78,
//   validationBacklog: 5
// }
```

## Best Practices

1. **Provide context** — Include file and intent when learning
2. **Be specific** — Explain WHY something is wrong
3. **Include correct code** — Show the right way
4. **Review candidates** — Regularly validate low-confidence memories
5. **Track metrics** — Monitor learning health

## Related Documentation

- [Cortex V2 Overview](Cortex-V2-Overview.md)
- [Causal Graphs](Cortex-Causal-Graphs.md)
- [Token Efficiency](Cortex-Token-Efficiency.md)
- [MCP Tools Reference](MCP-Tools-Reference.md)
