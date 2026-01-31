# Cortex Predictive Retrieval

Predictive retrieval anticipates what memories you'll need before you ask, reducing latency and improving relevance.

## Overview

Instead of waiting for queries, Cortex V2 predicts what you'll need based on:
- Current file context
- Recent activity patterns
- Temporal signals (time of day, day of week)
- Git activity

## Prediction Signals

### File Signals
```typescript
interface FileSignals {
  activeFile: string;           // Currently open file
  recentFiles: string[];        // Recently edited files
  fileType: string;             // .ts, .tsx, .py, etc.
  directory: string;            // Current directory
  imports: string[];            // Imported modules
}
```

### Temporal Signals
```typescript
interface TemporalSignals {
  hourOfDay: number;            // 0-23
  dayOfWeek: number;            // 0-6
  sessionDuration: number;      // Minutes in session
  timeSinceLastQuery: number;   // Seconds
}
```

### Behavioral Signals
```typescript
interface BehavioralSignals {
  recentIntents: Intent[];      // Recent query intents
  recentTopics: string[];       // Recent focus areas
  queryFrequency: number;       // Queries per hour
  correctionRate: number;       // Corrections per query
}
```

### Git Signals
```typescript
interface GitSignals {
  currentBranch: string;        // Feature branch name
  recentCommits: string[];      // Recent commit messages
  stagedFiles: string[];        // Files staged for commit
  modifiedFiles: string[];      // Uncommitted changes
}
```

## Prediction Engine

The engine combines signals to predict relevant memories:

```
┌─────────────────┐
│  Signal Gatherer │
│  - File signals  │
│  - Temporal      │
│  - Behavioral    │
│  - Git           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Predictors     │
│  - File-based   │
│  - Pattern-based│
│  - Temporal     │
│  - Behavioral   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Prediction     │
│  Cache          │
│  (preloaded)    │
└─────────────────┘
```

## Prediction Types

### File-Based Prediction
Predicts memories based on current file:
```typescript
// If editing src/auth/login.ts
// Predict: auth patterns, security constraints, login-related tribal knowledge
```

### Pattern-Based Prediction
Predicts based on detected patterns in code:
```typescript
// If file contains Express route handlers
// Predict: API patterns, error handling, validation patterns
```

### Temporal Prediction
Predicts based on time patterns:
```typescript
// If it's Monday morning
// Predict: memories frequently accessed on Monday mornings
```

### Behavioral Prediction
Predicts based on recent activity:
```typescript
// If recent queries were about "authentication"
// Predict: more auth-related memories
```

## Prediction Cache

Predicted memories are preloaded into a fast cache:

```typescript
interface PredictionCache {
  memories: Map<string, Memory>;  // Preloaded memories
  predictions: PredictedMemory[]; // Ranked predictions
  lastUpdated: Date;
  hitRate: number;                // Cache effectiveness
}
```

### Cache Warming
```typescript
// On file open
await predictionCache.warmForFile('src/auth/login.ts');

// On session start
await predictionCache.warmForSession(sessionContext);
```

## API Usage

### Get Predictions
```typescript
const predictions = await cortex.getPredictions({
  activeFile: 'src/auth/login.ts',
  limit: 10
});

// Returns:
// [
//   { memory: {...}, confidence: 0.92, reason: 'file_match' },
//   { memory: {...}, confidence: 0.85, reason: 'pattern_match' },
//   ...
// ]
```

### Preload Predictions
```typescript
// Preload into cache for instant retrieval
await cortex.preloadPredictions({
  activeFile: 'src/auth/login.ts',
  maxMemories: 20
});
```

## MCP Tool: `drift_memory_predict`

```json
{
  "activeFile": "src/auth/login.ts",
  "recentFiles": ["src/auth/logout.ts", "src/middleware/auth.ts"],
  "intent": "add_feature",
  "limit": 10
}
```

Response:
```json
{
  "predictions": [
    {
      "memoryId": "mem_abc123",
      "summary": "JWT tokens must be validated on every request",
      "confidence": 0.92,
      "reason": "file_match",
      "signals": ["activeFile contains 'auth'", "recent intent was 'add_feature'"]
    }
  ],
  "cacheStatus": {
    "preloaded": 15,
    "hitRate": 0.78
  }
}
```

## Performance

| Metric | Without Prediction | With Prediction |
|--------|-------------------|-----------------|
| First query latency | 150ms | 20ms (cache hit) |
| Relevance score | 0.75 | 0.88 |
| Token efficiency | 1x | 1.3x (better targeting) |

## Configuration

```typescript
const predictionConfig = {
  enabled: true,
  maxCacheSize: 100,           // Max memories in cache
  cacheWarmingThreshold: 0.6,  // Min confidence to cache
  signalWeights: {
    file: 0.4,
    pattern: 0.3,
    temporal: 0.15,
    behavioral: 0.15
  }
};
```

## Best Practices

1. **Enable prediction** — Significant latency improvement
2. **Monitor hit rate** — Should be > 60%
3. **Tune weights** — Adjust based on your workflow
4. **Warm on file open** — Preload when opening files

## Related Documentation

- [Cortex V2 Overview](Cortex-V2-Overview.md)
- [Token Efficiency](Cortex-Token-Efficiency.md)
- [MCP Tools Reference](MCP-Tools-Reference.md)
