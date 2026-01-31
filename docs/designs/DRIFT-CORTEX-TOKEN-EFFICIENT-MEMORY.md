# Drift Cortex v2: Token-Efficient Intelligent Memory

## The Design Document That Ends All Complaints

**Status:** Proposed Enhancement  
**Author:** Drift Team  
**Date:** January 2026  
**Supersedes:** DRIFT-CORTEX-ULTIMATE-MEMORY-ARCHITECTURE.md

---

## Executive Summary

This document describes a fundamental reimagining of Drift Cortex. The current implementation is a "memory system" — it stores and retrieves. This design transforms it into a **Token Efficiency Engine** and **Learning System** that:

1. Reduces AI token consumption by 10-15x
2. Actually learns from corrections (not just stores them)
3. Builds causal understanding (not just flat facts)
4. Generates code with traceable provenance
5. Prevents refactors before they're needed

**The Core Thesis:** Every token spent re-reading, re-understanding, or re-learning is a failure. Cortex should make the AI smarter with fewer tokens, not dumber with more.

---

## Table of Contents

1. [Critical Analysis of Current State](#part-i-critical-analysis)
2. [Token Efficiency Architecture](#part-ii-token-efficiency)
3. [Code-Aware Embeddings](#part-iii-code-aware-embeddings)
4. [Causal Memory Graphs](#part-iv-causal-memory-graphs)
5. [True Learning System](#part-v-true-learning)
6. [Predictive Retrieval](#part-vi-predictive-retrieval)
7. [Memory-Guided Code Generation](#part-vii-code-generation)
8. [Conflict Resolution](#part-viii-conflict-resolution)
9. [Feedback Loops](#part-ix-feedback-loops)
10. [Implementation Roadmap](#part-x-implementation)

---

## Part I: Critical Analysis of Current State

### 1.1 What's Actually Wrong

The current Cortex implementation has five fundamental flaws:

#### Flaw 1: The Learning System Doesn't Learn

```typescript
// Current implementation (correction-extractor.ts)
extract(episodes: EpisodicMemory[]): ExtractedCorrection[] {
  for (const episode of episodes) {
    if (episode.interaction.outcome === 'rejected') {
      corrections.push({
        original: episode.interaction.agentResponse.slice(0, 200),
        corrected: 'User rejected this approach',  // ← THIS IS USELESS
        reason: episode.context.focus,
        confidence: 0.7,
      });
    }
  }
}
```

This extracts nothing. It doesn't know:
- WHAT was wrong with the code
- WHY the user rejected it
- WHAT the correct approach would be
- HOW to avoid this mistake next time

**An AI that can't learn from corrections is just a fancy cache.**

#### Flaw 2: Embeddings Are Wrong for Code

Using `all-MiniLM-L6-v2` for code is like using a French dictionary to read Spanish — similar enough to fool you, wrong enough to fail you.

Code semantics are fundamentally different:
- `authMiddleware` and `authentication guard` should be close
- `user.save()` and `userRepository.persist()` should be close
- `async function` and `Promise.then` should be close

MiniLM doesn't understand any of this.

#### Flaw 3: "Why" Is Just a List

Current `drift_why` returns:
```json
{
  "patterns": [...],
  "decisions": [...],
  "tribal": [...],
  "warnings": [...]
}
```

This is a data dump, not understanding. A real "why" would be:

> "This pattern exists because in commit abc123, the team decided to use JWT 
> after incident SEC-042 exposed session fixation vulnerabilities. Three tribal 
> memories warn about token rotation. The constraint was overridden twice: 
> once for the health check endpoint (CO-012) and once for public APIs (CO-018)."

#### Flaw 4: Consolidation Is Naive

The "sleep-inspired" consolidation just:
1. Groups episodes by topic
2. Averages confidence
3. Creates a semantic memory

Real consolidation should:
1. Detect contradictions and resolve them
2. Build causal chains (A → B → C)
3. Identify patterns across unrelated episodes
4. Strengthen connections that proved useful
5. Prune connections that led to failures

#### Flaw 5: No Feedback Loop

The system never knows if memories were useful:
- Did the tribal knowledge prevent a bug?
- Did the pattern rationale help understanding?
- Did the constraint override cause problems?

Without feedback, you're accumulating noise, not knowledge.

### 1.2 The Token Waste Problem

Current AI coding workflow:

```
User: "Add auth to this endpoint"

AI: *reads 15 files to understand codebase*     → 8,000 tokens
AI: *figures out patterns from scratch*          → 2,000 tokens  
AI: *generates code*                             → 500 tokens
AI: *gets rejected because missed tribal rule*
User: "No, we always use authGuard middleware"
AI: *re-reads, re-generates*                     → 3,000 tokens

Total: ~13,500 tokens for ONE task
```

With Cortex v2:

```
User: "Add auth to this endpoint"

AI: *calls drift_context*                        → 50 tokens (request)
Cortex: *returns compressed context*             → 400 tokens
  - Pattern: authGuard middleware (3 examples)
  - Tribal: "never inline auth logic"
  - Constraint: all /api/* need auth
AI: *generates correct code first time*          → 500 tokens

Total: ~950 tokens — 14x more efficient
```

---

## Part II: Token Efficiency Architecture

### 2.1 Design Principles

**Principle 1: Compression at Storage Time**

Don't store verbose explanations. Store distilled, actionable knowledge.

```typescript
// BAD: Wastes tokens on every retrieval
{
  knowledge: "When implementing authentication in this codebase, you should 
    always use the authGuard middleware that is located in src/middleware/auth.ts. 
    This middleware was created by the team in Q2 2024 after several security 
    incidents where developers forgot to add authentication checks. The middleware 
    handles JWT validation, token refresh, and role-based access control."
}

// GOOD: Dense, actionable, expandable
{
  knowledge: "Use authGuard from src/middleware/auth.ts for all auth",
  details: {  // Only retrieved if needed
    handles: ["JWT validation", "token refresh", "RBAC"],
    created: "Q2 2024",
    reason: "SEC-042, SEC-047 incidents"
  },
  evidence: ["commit:abc123", "incident:SEC-042"],
  examples: ["src/api/users.ts:45", "src/api/orders.ts:23"]
}
```

**Principle 2: Hierarchical Retrieval**

```
Level 0: IDs only (5 tokens)
  → "Relevant: auth-middleware, error-handling, rate-limiting"

Level 1: One-liners (50 tokens)
  → "auth-middleware: Use authGuard for /api/* routes"
  → "error-handling: Wrap async handlers with asyncHandler()"

Level 2: With one example (200 tokens)
  → Includes best matching code snippet

Level 3: Full context (500+ tokens)
  → Everything, only when explicitly requested
```

**Principle 3: Session State Tracking**

```typescript
interface SessionContext {
  // What's already been sent this session
  loadedMemories: Set<string>;
  loadedPatterns: Set<string>;
  loadedFiles: Set<string>;
  
  // Don't re-send these
  alreadyKnows: {
    patterns: string[];
    tribal: string[];
    constraints: string[];
  };
}
```

**Principle 4: Predictive Pre-computation**

When user opens a file, immediately compute:
- Related memories
- Applicable patterns
- Relevant tribal knowledge
- Likely questions

Cache this. When they ask, context is ready (0 retrieval latency).

### 2.2 Compressed Memory Schema

```typescript
interface CompressedMemory {
  id: string;
  type: MemoryType;
  
  // Level 0: Always included (5-10 tokens)
  summary: string;  // Max 50 chars
  confidence: number;
  importance: Importance;
  
  // Level 1: On request (20-50 tokens)
  oneLiner?: string;  // Max 100 chars
  tags?: string[];
  
  // Level 2: On request (100-200 tokens)
  details?: {
    knowledge?: string;
    examples?: string[];  // File:line references only
    evidence?: string[];  // Commit/incident IDs only
  };
  
  // Level 3: On explicit request (unlimited)
  full?: {
    completeKnowledge?: string;
    allExamples?: CodeSnippet[];
    allEvidence?: Evidence[];
    relatedMemories?: string[];
    causalChain?: string[];
  };
}
```

### 2.3 Token Budget Manager v2

```typescript
class TokenBudgetManagerV2 {
  private sessionContext: SessionContext;
  
  fitToBudget(
    candidates: ScoredMemory[],
    budget: number,
    options: {
      preferNew: boolean;      // Prefer memories not yet in session
      minLevel: 0 | 1 | 2 | 3; // Minimum detail level
      maxLevel: 0 | 1 | 2 | 3; // Maximum detail level
    }
  ): CompressedMemory[] {
    
    // Filter out already-loaded memories
    const newCandidates = candidates.filter(
      c => !this.sessionContext.loadedMemories.has(c.memory.id)
    );
    
    // Start at minimum level
    let level = options.minLevel;
    let result: CompressedMemory[] = [];
    let tokensUsed = 0;
    
    // Greedy packing with level escalation
    for (const candidate of newCandidates) {
      const compressed = this.compressToLevel(candidate.memory, level);
      const tokens = this.countTokens(compressed);
      
      if (tokensUsed + tokens <= budget) {
        result.push(compressed);
        tokensUsed += tokens;
        this.sessionContext.loadedMemories.add(candidate.memory.id);
      } else if (level < options.maxLevel) {
        // Try lower detail level
        level++;
        // Re-process this candidate
      }
    }
    
    return result;
  }
  
  private compressToLevel(memory: Memory, level: number): CompressedMemory {
    const base = {
      id: memory.id,
      type: memory.type,
      summary: memory.summary.slice(0, 50),
      confidence: memory.confidence,
      importance: memory.importance,
    };
    
    if (level === 0) return base;
    
    if (level >= 1) {
      base.oneLiner = this.generateOneLiner(memory);
      base.tags = memory.tags?.slice(0, 5);
    }
    
    if (level >= 2) {
      base.details = {
        knowledge: this.extractKnowledge(memory)?.slice(0, 200),
        examples: this.extractExampleRefs(memory).slice(0, 3),
        evidence: this.extractEvidenceRefs(memory).slice(0, 3),
      };
    }
    
    if (level >= 3) {
      base.full = this.extractFullContext(memory);
    }
    
    return base;
  }
}
```


---

## Part III: Code-Aware Embeddings

### 3.1 The Problem with General-Purpose Embeddings

`all-MiniLM-L6-v2` was trained on natural language. It doesn't understand:

| Code Concept | MiniLM Similarity | Should Be |
|--------------|-------------------|-----------|
| `authMiddleware` vs `authentication guard` | 0.3 | 0.95 |
| `user.save()` vs `userRepo.persist()` | 0.2 | 0.9 |
| `async/await` vs `Promise.then()` | 0.1 | 0.85 |
| `try/catch` vs `Result<T, E>` | 0.05 | 0.8 |

### 3.2 Hybrid Embedding Architecture

We need embeddings that understand code at three levels:

```
┌─────────────────────────────────────────────────────────────┐
│                    HYBRID EMBEDDING                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  STRUCTURAL │  │  SEMANTIC   │  │  LEXICAL    │         │
│  │  (AST-based)│  │  (CodeBERT) │  │  (BM25/TF)  │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          ▼                                  │
│                   ┌─────────────┐                           │
│                   │   FUSION    │                           │
│                   │   LAYER     │                           │
│                   └──────┬──────┘                           │
│                          ▼                                  │
│                   [768-dim vector]                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Structural Embeddings (AST-Based)

Capture code structure independent of naming:

```typescript
interface StructuralEmbedding {
  // AST pattern hash
  astSignature: string;
  
  // Structural features
  features: {
    hasAsync: boolean;
    hasErrorHandling: boolean;
    callDepth: number;
    paramCount: number;
    returnType: 'void' | 'promise' | 'value' | 'stream';
    sideEffects: ('db' | 'network' | 'fs' | 'state')[];
  };
  
  // Pattern classification
  patterns: string[];  // e.g., ['middleware', 'error-boundary', 'factory']
}

class StructuralEmbedder {
  embed(code: string, language: string): number[] {
    const ast = this.parse(code, language);
    const features = this.extractFeatures(ast);
    
    // Convert to fixed-size vector
    return this.featuresToVector(features);  // 128 dims
  }
  
  private extractFeatures(ast: AST): StructuralFeatures {
    return {
      hasAsync: this.hasAsyncPattern(ast),
      hasErrorHandling: this.hasErrorHandling(ast),
      callDepth: this.measureCallDepth(ast),
      paramCount: this.countParams(ast),
      returnType: this.inferReturnType(ast),
      sideEffects: this.detectSideEffects(ast),
    };
  }
}
```

### 3.4 Semantic Embeddings (CodeBERT)

Use a code-trained model for semantic understanding:

```typescript
class SemanticEmbedder {
  private model: CodeBERTModel;
  
  async embed(code: string): Promise<number[]> {
    // CodeBERT understands code semantics
    // "user.save()" and "userRepository.persist()" will be close
    const tokens = this.tokenize(code);
    const embedding = await this.model.encode(tokens);
    return embedding;  // 512 dims
  }
}

// Model options (in order of preference):
// 1. microsoft/codebert-base (best quality, 125M params)
// 2. microsoft/graphcodebert-base (understands data flow)
// 3. Salesforce/codet5-base (good for generation tasks)
// 4. Local fine-tuned model on user's codebase
```

### 3.5 Lexical Embeddings (Fast Fallback)

For speed and exact matching:

```typescript
class LexicalEmbedder {
  embed(text: string): number[] {
    // TF-IDF style embedding
    const tokens = this.tokenize(text);
    const vector = new Array(128).fill(0);
    
    for (const token of tokens) {
      const hash = this.hash(token) % 128;
      vector[hash] += this.idf(token);
    }
    
    return this.normalize(vector);  // 128 dims
  }
}
```

### 3.6 Fusion Layer

Combine all three for robust similarity:

```typescript
class HybridEmbedder implements IEmbeddingProvider {
  readonly name = 'hybrid';
  readonly dimensions = 768;  // 128 + 512 + 128
  
  private structural: StructuralEmbedder;
  private semantic: SemanticEmbedder;
  private lexical: LexicalEmbedder;
  
  async embed(text: string, context?: EmbeddingContext): Promise<number[]> {
    const [structural, semantic, lexical] = await Promise.all([
      this.structural.embed(text, context?.language),
      this.semantic.embed(text),
      this.lexical.embed(text),
    ]);
    
    // Weighted concatenation
    // Weights can be tuned per use case
    return [
      ...structural.map(v => v * 0.3),   // 30% structural
      ...semantic.map(v => v * 0.5),     // 50% semantic
      ...lexical.map(v => v * 0.2),      // 20% lexical
    ];
  }
  
  // For memory retrieval, we can query each component separately
  // and combine results for better recall
  async hybridSearch(
    query: string,
    candidates: Memory[],
    weights: { structural: number; semantic: number; lexical: number }
  ): Promise<ScoredMemory[]> {
    const queryEmbedding = await this.embed(query);
    
    const scores = await Promise.all(candidates.map(async (memory) => {
      const memoryEmbedding = await this.getOrComputeEmbedding(memory);
      
      // Compute similarity for each component
      const structuralSim = this.cosineSimilarity(
        queryEmbedding.slice(0, 128),
        memoryEmbedding.slice(0, 128)
      );
      const semanticSim = this.cosineSimilarity(
        queryEmbedding.slice(128, 640),
        memoryEmbedding.slice(128, 640)
      );
      const lexicalSim = this.cosineSimilarity(
        queryEmbedding.slice(640, 768),
        memoryEmbedding.slice(640, 768)
      );
      
      // Weighted combination
      const score = 
        structuralSim * weights.structural +
        semanticSim * weights.semantic +
        lexicalSim * weights.lexical;
      
      return { memory, score };
    }));
    
    return scores.sort((a, b) => b.score - a.score);
  }
}
```

### 3.7 Embedding Cache Strategy

Embeddings are expensive. Cache aggressively:

```typescript
interface EmbeddingCache {
  // L1: In-memory LRU (hot memories)
  l1: LRUCache<string, number[]>;  // 1000 entries
  
  // L2: SQLite (all computed embeddings)
  l2: SQLiteEmbeddingStore;
  
  // L3: Precomputed for common queries
  l3: {
    patterns: Map<string, number[]>;      // Pattern name → embedding
    fileTypes: Map<string, number[]>;     // .ts, .py, etc → embedding
    intents: Map<Intent, number[]>;       // add_feature, fix_bug → embedding
  };
}

class CachedEmbedder {
  async embed(text: string): Promise<number[]> {
    const hash = this.hash(text);
    
    // Check L1
    const l1Hit = this.cache.l1.get(hash);
    if (l1Hit) return l1Hit;
    
    // Check L2
    const l2Hit = await this.cache.l2.get(hash);
    if (l2Hit) {
      this.cache.l1.set(hash, l2Hit);
      return l2Hit;
    }
    
    // Compute and cache
    const embedding = await this.embedder.embed(text);
    this.cache.l1.set(hash, embedding);
    await this.cache.l2.set(hash, embedding);
    
    return embedding;
  }
}
```

---

## Part IV: Causal Memory Graphs

### 4.1 The Problem with Flat Memories

Current memories are isolated facts:

```
Memory 1: "Use JWT for authentication"
Memory 2: "Refresh tokens must be rotated"
Memory 3: "Bug fix in commit xyz for token expiry"
```

No connection. No understanding of WHY.

### 4.2 Causal Graph Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                      CAUSAL MEMORY GRAPH                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐                                              │
│   │  DECISION    │                                              │
│   │  "Use JWT"   │                                              │
│   │  (D-001)     │                                              │
│   └──────┬───────┘                                              │
│          │ caused                                                │
│          ▼                                                       │
│   ┌──────────────┐         ┌──────────────┐                     │
│   │   PATTERN    │ caused  │   TRIBAL     │                     │
│   │ jwt-middleware├────────►│ "rotate      │                     │
│   │   (P-042)    │         │  tokens"     │                     │
│   └──────┬───────┘         │  (TM-089)    │                     │
│          │                 └──────┬───────┘                     │
│          │ caused                 │ prevented                    │
│          ▼                        ▼                              │
│   ┌──────────────┐         ┌──────────────┐                     │
│   │  CONSTRAINT  │         │   INCIDENT   │                     │
│   │ "all /api/*  │         │  SEC-042     │                     │
│   │  need auth"  │         │  (avoided)   │                     │
│   │  (C-015)     │         └──────────────┘                     │
│   └──────────────┘                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Causal Relationship Types

```typescript
type CausalRelation =
  | 'caused'           // A directly led to B
  | 'enabled'          // A made B possible
  | 'prevented'        // A stopped B from happening
  | 'contradicts'      // A conflicts with B
  | 'supersedes'       // A replaces B
  | 'supports'         // A provides evidence for B
  | 'derived_from'     // A was extracted from B
  | 'triggered_by';    // A happened because of event B

interface CausalEdge {
  source: string;      // Memory ID
  target: string;      // Memory ID
  relation: CausalRelation;
  strength: number;    // 0.0 - 1.0
  evidence: string[];  // Commits, incidents, etc.
  timestamp: string;
}
```

### 4.4 Causal Graph Storage

```sql
-- Extend memory_relationships table
CREATE TABLE causal_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN (
    'caused', 'enabled', 'prevented', 'contradicts',
    'supersedes', 'supports', 'derived_from', 'triggered_by'
  )),
  strength REAL DEFAULT 1.0,
  evidence TEXT,  -- JSON array
  created_at TEXT DEFAULT (datetime('now')),
  validated_at TEXT,
  
  FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Index for graph traversal
CREATE INDEX idx_causal_source ON causal_edges(source_id);
CREATE INDEX idx_causal_target ON causal_edges(target_id);
CREATE INDEX idx_causal_relation ON causal_edges(relation);
```

### 4.5 Causal Chain Traversal

```typescript
class CausalGraphTraverser {
  constructor(private storage: IMemoryStorage) {}
  
  /**
   * Trace the causal chain for a memory
   * "Why does this exist?"
   */
  async traceOrigins(
    memoryId: string,
    maxDepth: number = 5
  ): Promise<CausalChain> {
    const chain: CausalChain = {
      root: memoryId,
      nodes: [],
      edges: [],
    };
    
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [
      { id: memoryId, depth: 0 }
    ];
    
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);
      
      const memory = await this.storage.read(id);
      if (!memory) continue;
      
      chain.nodes.push({
        id,
        type: memory.type,
        summary: memory.summary,
        depth,
      });
      
      // Find incoming edges (what caused this?)
      const causes = await this.storage.getCausalEdges(id, 'incoming');
      
      for (const edge of causes) {
        chain.edges.push(edge);
        queue.push({ id: edge.source, depth: depth + 1 });
      }
    }
    
    return chain;
  }
  
  /**
   * Trace the effects of a memory
   * "What did this cause?"
   */
  async traceEffects(
    memoryId: string,
    maxDepth: number = 5
  ): Promise<CausalChain> {
    // Similar but follows outgoing edges
    // ...
  }
  
  /**
   * Generate narrative explanation
   */
  async explainCausally(memoryId: string): Promise<string> {
    const chain = await this.traceOrigins(memoryId);
    
    // Build narrative from chain
    const narrative = this.buildNarrative(chain);
    
    return narrative;
  }
  
  private buildNarrative(chain: CausalChain): string {
    // Sort by depth (root causes first)
    const sorted = chain.nodes.sort((a, b) => b.depth - a.depth);
    
    const parts: string[] = [];
    
    for (const node of sorted) {
      const incomingEdges = chain.edges.filter(e => e.target === node.id);
      
      if (incomingEdges.length === 0) {
        parts.push(`This originated from: ${node.summary}`);
      } else {
        const causes = incomingEdges.map(e => {
          const sourceNode = chain.nodes.find(n => n.id === e.source);
          return `${sourceNode?.summary} (${e.relation})`;
        });
        parts.push(`${node.summary} was ${incomingEdges[0].relation} by: ${causes.join(', ')}`);
      }
    }
    
    return parts.join('\n→ ');
  }
}
```

### 4.6 Automatic Causal Inference

When new memories are created, infer causal relationships:

```typescript
class CausalInferenceEngine {
  /**
   * Infer causal relationships for a new memory
   */
  async inferCauses(memory: Memory): Promise<CausalEdge[]> {
    const edges: CausalEdge[] = [];
    
    // 1. Temporal proximity: memories created around same time
    const temporalCandidates = await this.findTemporallyClose(memory);
    
    // 2. Semantic similarity: memories about same topic
    const semanticCandidates = await this.findSemanticallyClose(memory);
    
    // 3. Entity overlap: memories referencing same files/patterns
    const entityCandidates = await this.findEntityOverlap(memory);
    
    // 4. Explicit references: memory mentions another memory's ID
    const explicitCandidates = await this.findExplicitReferences(memory);
    
    // Score and filter candidates
    const allCandidates = [
      ...temporalCandidates,
      ...semanticCandidates,
      ...entityCandidates,
      ...explicitCandidates,
    ];
    
    for (const candidate of allCandidates) {
      const relation = this.inferRelationType(memory, candidate);
      const strength = this.calculateStrength(memory, candidate);
      
      if (strength > 0.5) {
        edges.push({
          source: candidate.id,
          target: memory.id,
          relation,
          strength,
          evidence: this.gatherEvidence(memory, candidate),
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    return edges;
  }
  
  private inferRelationType(target: Memory, source: Memory): CausalRelation {
    // Decision → Pattern: 'caused'
    if (source.type === 'decision_context' && target.type === 'pattern_rationale') {
      return 'caused';
    }
    
    // Pattern → Tribal: 'caused' or 'enabled'
    if (source.type === 'pattern_rationale' && target.type === 'tribal') {
      return 'enabled';
    }
    
    // Tribal → Incident prevention: 'prevented'
    if (source.type === 'tribal' && target.type === 'episodic') {
      if (this.isPreventionScenario(target)) {
        return 'prevented';
      }
    }
    
    // Same topic, different content: might be 'contradicts' or 'supersedes'
    if (this.sameTopic(source, target) && !this.sameContent(source, target)) {
      if (new Date(target.createdAt) > new Date(source.createdAt)) {
        return 'supersedes';
      }
      return 'contradicts';
    }
    
    // Default
    return 'supports';
  }
}
```


---

## Part V: True Learning System

### 5.1 What "Learning" Actually Means

Learning isn't storing "user rejected this." Learning is:

1. **Understanding WHAT was wrong** — The specific issue
2. **Understanding WHY it was wrong** — The underlying principle
3. **Generalizing** — Applying to similar situations
4. **Validating** — Confirming the learning was correct
5. **Strengthening/Weakening** — Adjusting based on outcomes

### 5.2 Correction Analysis Engine

```typescript
interface AnalyzedCorrection {
  // What the AI generated
  original: {
    code: string;
    intent: string;
    reasoning: string;
  };
  
  // What the user wanted
  correction: {
    code?: string;           // If user provided correct code
    feedback: string;        // User's explanation
    action: 'rejected' | 'modified' | 'accepted_with_changes';
  };
  
  // Extracted learning
  learning: {
    category: CorrectionCategory;
    principle: string;       // The generalizable rule
    scope: string[];         // Where this applies
    confidence: number;
    examples: {
      wrong: string;
      right: string;
    }[];
  };
}

type CorrectionCategory =
  | 'pattern_violation'      // Didn't follow established pattern
  | 'tribal_miss'            // Missed tribal knowledge
  | 'constraint_violation'   // Violated a constraint
  | 'style_mismatch'         // Wrong coding style
  | 'architecture_error'     // Wrong architectural approach
  | 'security_issue'         // Security problem
  | 'performance_issue'      // Performance problem
  | 'logic_error'            // Actual bug
  | 'preference'             // User preference (not objective)
  | 'unknown';               // Couldn't categorize

class CorrectionAnalyzer {
  /**
   * Analyze a correction to extract learning
   */
  async analyze(
    original: string,
    feedback: string,
    correctedCode?: string
  ): Promise<AnalyzedCorrection> {
    
    // 1. Diff analysis (if corrected code provided)
    const diff = correctedCode 
      ? this.computeDiff(original, correctedCode)
      : null;
    
    // 2. Categorize the correction
    const category = await this.categorize(original, feedback, diff);
    
    // 3. Extract the principle
    const principle = await this.extractPrinciple(
      original, 
      feedback, 
      diff, 
      category
    );
    
    // 4. Determine scope
    const scope = await this.determineScope(principle, category);
    
    // 5. Generate examples
    const examples = this.generateExamples(original, correctedCode, diff);
    
    return {
      original: {
        code: original,
        intent: await this.inferIntent(original),
        reasoning: 'Generated without specific context',
      },
      correction: {
        code: correctedCode,
        feedback,
        action: correctedCode ? 'modified' : 'rejected',
      },
      learning: {
        category,
        principle,
        scope,
        confidence: this.calculateConfidence(category, feedback, diff),
        examples,
      },
    };
  }
  
  private async categorize(
    original: string,
    feedback: string,
    diff: Diff | null
  ): Promise<CorrectionCategory> {
    // Check against known patterns
    const patterns = await this.getRelevantPatterns(original);
    for (const pattern of patterns) {
      if (this.violatesPattern(original, pattern)) {
        return 'pattern_violation';
      }
    }
    
    // Check against tribal knowledge
    const tribal = await this.getRelevantTribal(original);
    for (const knowledge of tribal) {
      if (this.contradicts(original, knowledge)) {
        return 'tribal_miss';
      }
    }
    
    // Check against constraints
    const constraints = await this.getRelevantConstraints(original);
    for (const constraint of constraints) {
      if (this.violatesConstraint(original, constraint)) {
        return 'constraint_violation';
      }
    }
    
    // Analyze feedback text for clues
    const feedbackLower = feedback.toLowerCase();
    
    if (feedbackLower.includes('style') || feedbackLower.includes('format')) {
      return 'style_mismatch';
    }
    if (feedbackLower.includes('security') || feedbackLower.includes('vulnerable')) {
      return 'security_issue';
    }
    if (feedbackLower.includes('slow') || feedbackLower.includes('performance')) {
      return 'performance_issue';
    }
    if (feedbackLower.includes('bug') || feedbackLower.includes('wrong')) {
      return 'logic_error';
    }
    if (feedbackLower.includes('prefer') || feedbackLower.includes('like')) {
      return 'preference';
    }
    
    return 'unknown';
  }
  
  private async extractPrinciple(
    original: string,
    feedback: string,
    diff: Diff | null,
    category: CorrectionCategory
  ): Promise<string> {
    // Use the diff to understand what changed
    if (diff) {
      const changes = this.summarizeChanges(diff);
      
      // Pattern: "Changed X to Y" → "Always use Y instead of X"
      if (changes.replacements.length > 0) {
        const rep = changes.replacements[0];
        return `Use ${rep.to} instead of ${rep.from} for ${category}`;
      }
      
      // Pattern: "Added X" → "Always include X"
      if (changes.additions.length > 0) {
        return `Always include ${changes.additions[0]} when ${this.inferContext(original)}`;
      }
      
      // Pattern: "Removed X" → "Don't use X"
      if (changes.removals.length > 0) {
        return `Don't use ${changes.removals[0]} in this codebase`;
      }
    }
    
    // Fall back to feedback analysis
    return this.extractPrincipleFromFeedback(feedback);
  }
}
```

### 5.3 Learning Memory Creation

```typescript
class LearningMemoryFactory {
  /**
   * Create appropriate memory type from analyzed correction
   */
  async createFromCorrection(
    analysis: AnalyzedCorrection
  ): Promise<Memory> {
    const { learning, correction } = analysis;
    
    switch (learning.category) {
      case 'pattern_violation':
        // Strengthen existing pattern or create pattern rationale
        return this.createPatternRationale(analysis);
        
      case 'tribal_miss':
        // Create or strengthen tribal knowledge
        return this.createTribalKnowledge(analysis);
        
      case 'constraint_violation':
        // Note the constraint for future reference
        return this.createConstraintReminder(analysis);
        
      case 'style_mismatch':
        // Create style preference memory
        return this.createStylePreference(analysis);
        
      case 'preference':
        // Create user preference (lower confidence)
        return this.createUserPreference(analysis);
        
      default:
        // Create general semantic memory
        return this.createSemanticMemory(analysis);
    }
  }
  
  private createTribalKnowledge(analysis: AnalyzedCorrection): TribalMemory {
    return {
      id: generateId(),
      type: 'tribal',
      topic: this.inferTopic(analysis),
      knowledge: analysis.learning.principle,
      severity: this.inferSeverity(analysis),
      source: {
        type: 'learned',
        learnedFrom: 'correction',
        originalInteraction: analysis.original.code.slice(0, 100),
      },
      summary: `⚠️ ${analysis.learning.principle.slice(0, 50)}`,
      confidence: analysis.learning.confidence,
      importance: this.inferImportance(analysis),
      accessCount: 0,
      transactionTime: { recordedAt: new Date().toISOString() },
      validTime: { validFrom: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      linkedPatterns: analysis.learning.scope.filter(s => s.startsWith('pattern:')),
      linkedFiles: analysis.learning.scope.filter(s => s.startsWith('file:')),
    };
  }
}
```

### 5.4 Confidence Calibration

Memories should know how confident they are, and ask when uncertain:

```typescript
interface ConfidenceMetrics {
  // Base confidence from creation
  baseConfidence: number;
  
  // Evidence-based adjustments
  supportingEvidence: number;    // +0.1 per supporting episode
  contradictingEvidence: number; // -0.15 per contradiction
  
  // Usage-based adjustments
  timesUsed: number;             // +0.05 per successful use
  timesIgnored: number;          // -0.1 per ignore
  timesCorrected: number;        // -0.2 per correction
  
  // Temporal decay
  daysSinceLastValidation: number;
  decayFactor: number;
  
  // Final calculated confidence
  currentConfidence: number;
}

class ConfidenceCalibrator {
  /**
   * Calculate current confidence for a memory
   */
  calculate(memory: Memory, metrics: ConfidenceMetrics): number {
    let confidence = metrics.baseConfidence;
    
    // Evidence adjustments
    confidence += metrics.supportingEvidence * 0.1;
    confidence -= metrics.contradictingEvidence * 0.15;
    
    // Usage adjustments
    confidence += Math.min(metrics.timesUsed * 0.05, 0.3);  // Cap at +0.3
    confidence -= metrics.timesIgnored * 0.1;
    confidence -= metrics.timesCorrected * 0.2;
    
    // Temporal decay
    const halfLife = HALF_LIVES[memory.type];
    if (halfLife !== Infinity) {
      const decayFactor = Math.exp(-metrics.daysSinceLastValidation / halfLife);
      confidence *= decayFactor;
    }
    
    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence));
  }
  
  /**
   * Determine if we should ask the user for validation
   */
  shouldAskUser(memory: Memory, confidence: number): boolean {
    // Ask if confidence is in the "uncertain" zone
    if (confidence >= 0.4 && confidence <= 0.7) {
      // And memory is important enough to matter
      if (memory.importance === 'high' || memory.importance === 'critical') {
        return true;
      }
      // Or it's been a while since validation
      if (this.daysSinceValidation(memory) > 30) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Generate validation prompt for user
   */
  generateValidationPrompt(memory: Memory, confidence: number): string {
    const topic = this.extractTopic(memory);
    const knowledge = this.extractKnowledge(memory);
    const lastEvidence = this.getLastEvidence(memory);
    
    return `I'm ${Math.round(confidence * 100)}% confident that "${knowledge}" ` +
           `is still valid for ${topic}. ` +
           `Last evidence: ${lastEvidence}. ` +
           `Should I keep this knowledge?`;
  }
}
```

### 5.5 Active Learning Loop

```typescript
class ActiveLearningLoop {
  private pendingValidations: Map<string, ValidationRequest> = new Map();
  
  /**
   * Process feedback from user
   */
  async processFeedback(
    memoryId: string,
    feedback: 'confirm' | 'reject' | 'modify',
    modification?: string
  ): Promise<void> {
    const memory = await this.storage.read(memoryId);
    if (!memory) return;
    
    switch (feedback) {
      case 'confirm':
        // Boost confidence
        await this.storage.update(memoryId, {
          confidence: Math.min(1.0, memory.confidence + 0.2),
          lastValidated: new Date().toISOString(),
          validationHistory: [
            ...(memory.validationHistory || []),
            { action: 'confirmed', timestamp: new Date().toISOString() }
          ],
        });
        break;
        
      case 'reject':
        // Archive the memory
        await this.storage.update(memoryId, {
          archived: true,
          archiveReason: 'User rejected during validation',
          archivedAt: new Date().toISOString(),
        });
        break;
        
      case 'modify':
        // Create new memory with modification, supersede old
        const newMemory = await this.createModifiedMemory(memory, modification!);
        await this.storage.create(newMemory);
        await this.storage.addRelationship(newMemory.id, memoryId, 'supersedes');
        await this.storage.update(memoryId, {
          supersededBy: newMemory.id,
          archived: true,
          archiveReason: 'Superseded by user modification',
        });
        break;
    }
  }
  
  /**
   * Identify memories that need validation
   */
  async identifyValidationCandidates(): Promise<Memory[]> {
    const allMemories = await this.storage.search({
      minConfidence: 0.3,
      maxConfidence: 0.8,
      includeArchived: false,
    });
    
    const candidates: Memory[] = [];
    
    for (const memory of allMemories) {
      const metrics = await this.getConfidenceMetrics(memory);
      const calibrator = new ConfidenceCalibrator();
      
      if (calibrator.shouldAskUser(memory, metrics.currentConfidence)) {
        candidates.push(memory);
      }
    }
    
    // Prioritize by importance and uncertainty
    return candidates.sort((a, b) => {
      const aScore = this.validationPriority(a);
      const bScore = this.validationPriority(b);
      return bScore - aScore;
    });
  }
}
```

---

## Part VI: Predictive Retrieval

### 6.1 The Prediction Problem

Current retrieval is reactive: user asks, system retrieves. This wastes time and tokens.

Predictive retrieval anticipates what the user will need:

```
User opens src/api/payments.ts
  ↓
System predicts:
  - They'll ask about payment patterns (80% confidence)
  - They'll need Stripe integration knowledge (70%)
  - They might hit the "decimal precision" tribal warning (60%)
  ↓
Pre-compute and cache this context
  ↓
When user asks "add refund endpoint"
  → Context already ready (0ms retrieval)
```

### 6.2 Prediction Signals

```typescript
interface PredictionSignals {
  // File-based signals
  activeFile: string;
  recentFiles: string[];           // Last 10 files edited
  filePatterns: string[];          // Patterns detected in active file
  fileImports: string[];           // What the file imports
  
  // Temporal signals
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  dayOfWeek: string;
  sessionDuration: number;         // Minutes in current session
  
  // Behavioral signals
  recentQueries: string[];         // Last 5 queries
  recentIntents: Intent[];         // Last 5 intents
  correctionRate: number;          // Recent correction frequency
  
  // Git signals
  currentBranch: string;
  recentCommits: string[];
  uncommittedChanges: string[];
  
  // Project signals
  projectPhase: 'early' | 'active' | 'maintenance';
  teamActivity: 'high' | 'medium' | 'low';
}
```

### 6.3 Prediction Model

```typescript
class MemoryPredictor {
  /**
   * Predict what memories will be needed
   */
  async predict(signals: PredictionSignals): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];
    
    // 1. File-based predictions
    const fileMemories = await this.predictFromFile(signals.activeFile);
    predictions.push(...fileMemories);
    
    // 2. Pattern-based predictions
    for (const pattern of signals.filePatterns) {
      const patternMemories = await this.predictFromPattern(pattern);
      predictions.push(...patternMemories);
    }
    
    // 3. Temporal predictions
    const temporalMemories = await this.predictFromTime(signals);
    predictions.push(...temporalMemories);
    
    // 4. Behavioral predictions
    const behavioralMemories = await this.predictFromBehavior(signals);
    predictions.push(...behavioralMemories);
    
    // 5. Git-based predictions
    const gitMemories = await this.predictFromGit(signals);
    predictions.push(...gitMemories);
    
    // Deduplicate and rank
    return this.rankPredictions(predictions);
  }
  
  private async predictFromFile(file: string): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];
    
    // Get memories linked to this file
    const linkedMemories = await this.storage.findByFile(file);
    for (const memory of linkedMemories) {
      predictions.push({
        memory,
        confidence: 0.9,  // High confidence for direct links
        reason: 'directly_linked',
      });
    }
    
    // Get memories for patterns in this file
    const patterns = await this.detectPatterns(file);
    for (const pattern of patterns) {
      const patternMemories = await this.storage.findByPattern(pattern.id);
      for (const memory of patternMemories) {
        predictions.push({
          memory,
          confidence: 0.7,
          reason: 'pattern_match',
        });
      }
    }
    
    // Get memories for similar files
    const similarFiles = await this.findSimilarFiles(file);
    for (const similar of similarFiles.slice(0, 3)) {
      const similarMemories = await this.storage.findByFile(similar);
      for (const memory of similarMemories) {
        predictions.push({
          memory,
          confidence: 0.5,
          reason: 'similar_file',
        });
      }
    }
    
    return predictions;
  }
  
  private async predictFromTime(signals: PredictionSignals): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];
    
    // Morning = more likely to be adding features
    if (signals.timeOfDay === 'morning') {
      const featureMemories = await this.storage.search({
        types: ['pattern_rationale', 'procedural'],
        tags: ['feature', 'implementation'],
        limit: 5,
      });
      for (const memory of featureMemories) {
        predictions.push({
          memory,
          confidence: 0.4,
          reason: 'temporal_pattern',
        });
      }
    }
    
    // Afternoon = more likely to be fixing bugs
    if (signals.timeOfDay === 'afternoon') {
      const bugMemories = await this.storage.search({
        types: ['tribal', 'code_smell'],
        tags: ['bug', 'fix', 'gotcha'],
        limit: 5,
      });
      for (const memory of bugMemories) {
        predictions.push({
          memory,
          confidence: 0.4,
          reason: 'temporal_pattern',
        });
      }
    }
    
    return predictions;
  }
}
```

### 6.4 Prediction Cache

```typescript
class PredictionCache {
  private cache: Map<string, CachedPrediction> = new Map();
  private ttl = 5 * 60 * 1000;  // 5 minutes
  
  /**
   * Get or compute predictions for a file
   */
  async getForFile(file: string): Promise<PredictedMemory[]> {
    const cached = this.cache.get(file);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.predictions;
    }
    
    // Compute predictions
    const signals = await this.gatherSignals(file);
    const predictions = await this.predictor.predict(signals);
    
    // Cache
    this.cache.set(file, {
      predictions,
      timestamp: Date.now(),
    });
    
    // Pre-load embeddings for predicted memories
    this.preloadEmbeddings(predictions);
    
    return predictions;
  }
  
  /**
   * Called when user opens a file
   */
  async onFileOpened(file: string): Promise<void> {
    // Start prediction in background
    this.getForFile(file).catch(console.error);
  }
  
  /**
   * Called when user makes a query
   */
  async onQuery(query: string, file: string): Promise<RetrievalResult> {
    // Check if we have predictions
    const predictions = await this.getForFile(file);
    
    // Filter predictions by query relevance
    const relevant = await this.filterByQuery(predictions, query);
    
    // If predictions cover the query, use them (fast path)
    if (this.predictionsCoverQuery(relevant, query)) {
      return {
        memories: relevant.map(p => p.memory),
        source: 'prediction_cache',
        retrievalTime: 0,
      };
    }
    
    // Otherwise, do full retrieval (slow path)
    return this.fullRetrieval(query, file);
  }
}
```


---

## Part VII: Memory-Guided Code Generation

### 7.1 The Vision

When an AI generates code, it shouldn't just generate — it should:
1. Check memories for relevant patterns
2. Check for tribal warnings
3. Check for constraint overrides
4. Generate code that **cites its sources**

```typescript
// Generated with context from:
// - Pattern: error-handling-middleware (confidence: 0.95)
// - Tribal: "Always wrap async handlers" (TM-089)
// - Constraint override: CO-012 allows sync handlers for health checks

export const healthCheck = (req, res) => {
  res.json({ status: 'ok' });
};
```

This is what makes users trust the AI. It's not magic — it's traceable reasoning.

### 7.2 Generation Context Builder

```typescript
interface GenerationContext {
  // What we're generating
  intent: Intent;
  target: {
    file: string;
    location?: { line: number; column: number };
    type: 'function' | 'class' | 'module' | 'snippet';
  };
  
  // Memory-derived context
  patterns: {
    id: string;
    name: string;
    confidence: number;
    examples: CodeSnippet[];
    rationale?: string;
  }[];
  
  tribal: {
    id: string;
    knowledge: string;
    severity: 'critical' | 'warning' | 'info';
    applies: boolean;  // Does this apply to current generation?
  }[];
  
  constraints: {
    id: string;
    description: string;
    overrides?: {
      id: string;
      reason: string;
      applies: boolean;
    }[];
  }[];
  
  antiPatterns: {
    id: string;
    pattern: string;
    why: string;
    instead: string;
  }[];
  
  // Provenance tracking
  provenance: {
    memoriesUsed: string[];
    patternsApplied: string[];
    warningsConsidered: string[];
    constraintsChecked: string[];
  };
}

class GenerationContextBuilder {
  /**
   * Build context for code generation
   */
  async build(
    intent: Intent,
    target: GenerationTarget,
    query: string
  ): Promise<GenerationContext> {
    
    // 1. Get relevant patterns
    const patterns = await this.getRelevantPatterns(target, query);
    
    // 2. Get tribal warnings
    const tribal = await this.getTribalWarnings(target, query);
    
    // 3. Get constraints and overrides
    const constraints = await this.getConstraints(target);
    
    // 4. Get anti-patterns to avoid
    const antiPatterns = await this.getAntiPatterns(target, query);
    
    // 5. Build provenance
    const provenance = {
      memoriesUsed: [
        ...patterns.map(p => p.id),
        ...tribal.map(t => t.id),
        ...constraints.flatMap(c => [c.id, ...(c.overrides?.map(o => o.id) || [])]),
        ...antiPatterns.map(a => a.id),
      ],
      patternsApplied: patterns.filter(p => p.confidence > 0.7).map(p => p.name),
      warningsConsidered: tribal.filter(t => t.applies).map(t => t.id),
      constraintsChecked: constraints.map(c => c.id),
    };
    
    return {
      intent,
      target,
      patterns,
      tribal,
      constraints,
      antiPatterns,
      provenance,
    };
  }
  
  private async getRelevantPatterns(
    target: GenerationTarget,
    query: string
  ): Promise<GenerationContext['patterns']> {
    // Get patterns from file
    const filePatterns = await this.storage.findByFile(target.file);
    
    // Get patterns from query
    const queryPatterns = await this.storage.search({
      types: ['pattern_rationale'],
      topics: this.extractTopics(query),
      limit: 5,
    });
    
    // Combine and enrich
    const allPatterns = [...filePatterns, ...queryPatterns]
      .filter(m => m.type === 'pattern_rationale');
    
    return Promise.all(allPatterns.map(async (p) => {
      const examples = await this.getPatternExamples(p.patternId);
      return {
        id: p.id,
        name: p.patternName,
        confidence: p.confidence,
        examples,
        rationale: p.rationale,
      };
    }));
  }
  
  private async getTribalWarnings(
    target: GenerationTarget,
    query: string
  ): Promise<GenerationContext['tribal']> {
    // Get all tribal knowledge
    const tribal = await this.storage.search({
      types: ['tribal'],
      limit: 20,
    });
    
    // Filter to relevant ones
    return tribal.map(t => ({
      id: t.id,
      knowledge: t.knowledge,
      severity: t.severity,
      applies: this.tribalApplies(t, target, query),
    }));
  }
  
  private tribalApplies(
    tribal: TribalMemory,
    target: GenerationTarget,
    query: string
  ): boolean {
    // Check if tribal knowledge applies to this generation
    
    // File match
    if (tribal.linkedFiles?.some(f => target.file.includes(f))) {
      return true;
    }
    
    // Topic match
    const queryTopics = this.extractTopics(query);
    if (queryTopics.some(t => tribal.topic.toLowerCase().includes(t))) {
      return true;
    }
    
    // Pattern match
    if (tribal.linkedPatterns?.length) {
      // Check if any linked patterns are in the target file
      // ...
    }
    
    return false;
  }
}
```

### 7.3 Provenance-Aware Code Generator

```typescript
interface GeneratedCode {
  code: string;
  provenance: CodeProvenance;
  confidence: number;
  alternatives?: GeneratedCode[];
}

interface CodeProvenance {
  // What memories influenced this code
  influences: {
    memoryId: string;
    memoryType: MemoryType;
    influence: 'pattern' | 'warning' | 'constraint' | 'example';
    description: string;
  }[];
  
  // Human-readable explanation
  explanation: string;
  
  // Warnings that were considered
  warnings: string[];
  
  // Constraints that were satisfied
  constraintsSatisfied: string[];
  
  // Anti-patterns that were avoided
  antiPatternsAvoided: string[];
}

class ProvenanceAwareGenerator {
  /**
   * Generate code with full provenance tracking
   */
  async generate(
    context: GenerationContext,
    prompt: string
  ): Promise<GeneratedCode> {
    
    // Build the generation prompt with context
    const enrichedPrompt = this.buildEnrichedPrompt(context, prompt);
    
    // Generate code (this would call the actual LLM)
    const rawCode = await this.llm.generate(enrichedPrompt);
    
    // Validate against context
    const validation = await this.validate(rawCode, context);
    
    // Build provenance
    const provenance = this.buildProvenance(context, validation);
    
    // Add provenance comments to code
    const codeWithProvenance = this.addProvenanceComments(rawCode, provenance);
    
    return {
      code: codeWithProvenance,
      provenance,
      confidence: this.calculateConfidence(validation),
    };
  }
  
  private buildEnrichedPrompt(
    context: GenerationContext,
    prompt: string
  ): string {
    const parts: string[] = [];
    
    // Add patterns
    if (context.patterns.length > 0) {
      parts.push('## Patterns to Follow');
      for (const pattern of context.patterns) {
        parts.push(`- ${pattern.name}: ${pattern.rationale || 'No rationale'}`);
        if (pattern.examples.length > 0) {
          parts.push(`  Example: ${pattern.examples[0].file}:${pattern.examples[0].line}`);
        }
      }
    }
    
    // Add warnings
    const applicableWarnings = context.tribal.filter(t => t.applies);
    if (applicableWarnings.length > 0) {
      parts.push('## Warnings');
      for (const warning of applicableWarnings) {
        parts.push(`- ⚠️ ${warning.knowledge}`);
      }
    }
    
    // Add constraints
    if (context.constraints.length > 0) {
      parts.push('## Constraints');
      for (const constraint of context.constraints) {
        const hasOverride = constraint.overrides?.some(o => o.applies);
        if (hasOverride) {
          const override = constraint.overrides!.find(o => o.applies)!;
          parts.push(`- ${constraint.description} (OVERRIDDEN: ${override.reason})`);
        } else {
          parts.push(`- ${constraint.description}`);
        }
      }
    }
    
    // Add anti-patterns
    if (context.antiPatterns.length > 0) {
      parts.push('## Anti-Patterns to Avoid');
      for (const anti of context.antiPatterns) {
        parts.push(`- DON'T: ${anti.pattern}`);
        parts.push(`  Instead: ${anti.instead}`);
      }
    }
    
    // Add the actual prompt
    parts.push('## Task');
    parts.push(prompt);
    
    return parts.join('\n\n');
  }
  
  private addProvenanceComments(
    code: string,
    provenance: CodeProvenance
  ): string {
    const header = [
      '// Generated with context from:',
      ...provenance.influences.slice(0, 5).map(i => 
        `// - ${i.influence}: ${i.description}`
      ),
    ];
    
    if (provenance.warnings.length > 0) {
      header.push('// Warnings considered:');
      header.push(...provenance.warnings.slice(0, 3).map(w => `//   - ${w}`));
    }
    
    return header.join('\n') + '\n\n' + code;
  }
  
  private async validate(
    code: string,
    context: GenerationContext
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    
    // Check against patterns
    for (const pattern of context.patterns) {
      if (!this.followsPattern(code, pattern)) {
        issues.push({
          type: 'pattern_violation',
          pattern: pattern.name,
          severity: 'warning',
        });
      }
    }
    
    // Check against tribal warnings
    for (const tribal of context.tribal.filter(t => t.applies)) {
      if (this.violatesTribal(code, tribal)) {
        issues.push({
          type: 'tribal_violation',
          warning: tribal.knowledge,
          severity: tribal.severity === 'critical' ? 'error' : 'warning',
        });
      }
    }
    
    // Check against anti-patterns
    for (const anti of context.antiPatterns) {
      if (this.matchesAntiPattern(code, anti)) {
        issues.push({
          type: 'anti_pattern',
          pattern: anti.pattern,
          severity: 'error',
        });
      }
    }
    
    return { issues, valid: issues.filter(i => i.severity === 'error').length === 0 };
  }
}
```

### 7.4 Generation Feedback Loop

```typescript
class GenerationFeedbackLoop {
  /**
   * Track outcome of generated code
   */
  async trackOutcome(
    generation: GeneratedCode,
    outcome: 'accepted' | 'modified' | 'rejected',
    feedback?: string
  ): Promise<void> {
    
    // Update confidence for all influencing memories
    for (const influence of generation.provenance.influences) {
      const memory = await this.storage.read(influence.memoryId);
      if (!memory) continue;
      
      let confidenceAdjustment = 0;
      
      switch (outcome) {
        case 'accepted':
          confidenceAdjustment = 0.05;  // Small boost
          break;
        case 'modified':
          confidenceAdjustment = -0.02; // Slight decrease
          break;
        case 'rejected':
          confidenceAdjustment = -0.1;  // Significant decrease
          break;
      }
      
      await this.storage.update(influence.memoryId, {
        confidence: Math.max(0, Math.min(1, memory.confidence + confidenceAdjustment)),
        usageHistory: [
          ...(memory.usageHistory || []),
          {
            timestamp: new Date().toISOString(),
            outcome,
            context: 'code_generation',
          },
        ],
      });
    }
    
    // If rejected, analyze why and potentially create new memory
    if (outcome === 'rejected' && feedback) {
      const analysis = await this.correctionAnalyzer.analyze(
        generation.code,
        feedback
      );
      
      if (analysis.learning.confidence > 0.5) {
        const newMemory = await this.learningFactory.createFromCorrection(analysis);
        await this.storage.create(newMemory);
      }
    }
  }
}
```

---

## Part VIII: Conflict Resolution

### 8.1 The Conflict Problem

Memories can contradict each other:
- Tribal says "never use raw SQL"
- Pattern shows raw SQL in 3 places
- Decision context says "approved for analytics"

Current system picks one. Better system **surfaces the conflict**.

### 8.2 Conflict Detection

```typescript
interface MemoryConflict {
  id: string;
  type: 'contradiction' | 'supersession' | 'scope_overlap';
  
  memories: {
    id: string;
    type: MemoryType;
    summary: string;
    confidence: number;
    createdAt: string;
  }[];
  
  description: string;
  resolution?: ConflictResolution;
}

interface ConflictResolution {
  strategy: 'newer_wins' | 'higher_confidence' | 'scope_specific' | 'user_decision';
  winner?: string;  // Memory ID
  explanation: string;
  resolvedAt: string;
  resolvedBy: 'automatic' | 'user';
}

class ConflictDetector {
  /**
   * Detect conflicts in memory set
   */
  async detectConflicts(memories: Memory[]): Promise<MemoryConflict[]> {
    const conflicts: MemoryConflict[] = [];
    
    // Group by topic
    const byTopic = this.groupByTopic(memories);
    
    for (const [topic, topicMemories] of byTopic) {
      // Check for contradictions within topic
      for (let i = 0; i < topicMemories.length; i++) {
        for (let j = i + 1; j < topicMemories.length; j++) {
          const a = topicMemories[i];
          const b = topicMemories[j];
          
          if (this.areContradictory(a, b)) {
            conflicts.push({
              id: generateId(),
              type: 'contradiction',
              memories: [
                this.summarizeMemory(a),
                this.summarizeMemory(b),
              ],
              description: this.describeContradiction(a, b),
            });
          }
        }
      }
    }
    
    // Check for scope overlaps
    const scopeConflicts = await this.detectScopeOverlaps(memories);
    conflicts.push(...scopeConflicts);
    
    return conflicts;
  }
  
  private areContradictory(a: Memory, b: Memory): boolean {
    // Same topic, opposite assertions
    if (!this.sameTopic(a, b)) return false;
    
    const aKnowledge = this.extractKnowledge(a);
    const bKnowledge = this.extractKnowledge(b);
    
    // Check for negation patterns
    const negationPatterns = [
      { positive: /always/i, negative: /never/i },
      { positive: /must/i, negative: /must not/i },
      { positive: /should/i, negative: /should not/i },
      { positive: /do/i, negative: /don't|do not/i },
      { positive: /use/i, negative: /avoid|don't use/i },
    ];
    
    for (const pattern of negationPatterns) {
      if (
        (pattern.positive.test(aKnowledge) && pattern.negative.test(bKnowledge)) ||
        (pattern.negative.test(aKnowledge) && pattern.positive.test(bKnowledge))
      ) {
        return true;
      }
    }
    
    // Check semantic similarity (low similarity + same topic = contradiction)
    const similarity = this.calculateSimilarity(aKnowledge, bKnowledge);
    return similarity < 0.3;
  }
}
```

### 8.3 Conflict Surfacing

```typescript
class ConflictSurfacer {
  /**
   * Generate user-friendly conflict report
   */
  formatConflict(conflict: MemoryConflict): string {
    const lines: string[] = [
      '⚠️ **Memory Conflict Detected**',
      '',
    ];
    
    for (const memory of conflict.memories) {
      lines.push(`- **${memory.type}** (${Math.round(memory.confidence * 100)}% confidence):`);
      lines.push(`  "${memory.summary}"`);
      lines.push(`  Created: ${memory.createdAt}`);
      lines.push('');
    }
    
    lines.push(`**Conflict:** ${conflict.description}`);
    
    if (conflict.resolution) {
      lines.push('');
      lines.push(`**Resolution:** ${conflict.resolution.explanation}`);
    } else {
      lines.push('');
      lines.push('**Action needed:** Please clarify which is correct.');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate resolution options
   */
  generateResolutionOptions(conflict: MemoryConflict): ResolutionOption[] {
    const options: ResolutionOption[] = [];
    
    // Option 1: Newer wins
    const newest = conflict.memories.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    options.push({
      strategy: 'newer_wins',
      winner: newest.id,
      explanation: `Use the newer memory: "${newest.summary}"`,
    });
    
    // Option 2: Higher confidence wins
    const mostConfident = conflict.memories.sort(
      (a, b) => b.confidence - a.confidence
    )[0];
    options.push({
      strategy: 'higher_confidence',
      winner: mostConfident.id,
      explanation: `Use the more confident memory: "${mostConfident.summary}"`,
    });
    
    // Option 3: Both are valid in different scopes
    options.push({
      strategy: 'scope_specific',
      explanation: 'Both are valid in different contexts. Please specify when each applies.',
    });
    
    // Option 4: User decides
    options.push({
      strategy: 'user_decision',
      explanation: 'I need your input to resolve this conflict.',
    });
    
    return options;
  }
}
```

### 8.4 Automatic Resolution Strategies

```typescript
class ConflictResolver {
  /**
   * Attempt automatic resolution
   */
  async resolve(conflict: MemoryConflict): Promise<ConflictResolution | null> {
    // Strategy 1: If one memory has much higher confidence, use it
    const confidences = conflict.memories.map(m => m.confidence);
    const maxConfidence = Math.max(...confidences);
    const minConfidence = Math.min(...confidences);
    
    if (maxConfidence - minConfidence > 0.3) {
      const winner = conflict.memories.find(m => m.confidence === maxConfidence)!;
      return {
        strategy: 'higher_confidence',
        winner: winner.id,
        explanation: `Memory "${winner.summary}" has significantly higher confidence (${Math.round(maxConfidence * 100)}% vs ${Math.round(minConfidence * 100)}%)`,
        resolvedAt: new Date().toISOString(),
        resolvedBy: 'automatic',
      };
    }
    
    // Strategy 2: If one is much newer and has decent confidence, use it
    const sorted = conflict.memories.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];
    
    const daysDiff = (
      new Date(newest.createdAt).getTime() - new Date(oldest.createdAt).getTime()
    ) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 30 && newest.confidence > 0.6) {
      return {
        strategy: 'newer_wins',
        winner: newest.id,
        explanation: `Memory "${newest.summary}" is ${Math.round(daysDiff)} days newer with ${Math.round(newest.confidence * 100)}% confidence`,
        resolvedAt: new Date().toISOString(),
        resolvedBy: 'automatic',
      };
    }
    
    // Strategy 3: Check if they apply to different scopes
    const scopes = await this.analyzeScopes(conflict.memories);
    if (scopes.disjoint) {
      return {
        strategy: 'scope_specific',
        explanation: `Both memories are valid: "${conflict.memories[0].summary}" applies to ${scopes.scopes[0]}, while "${conflict.memories[1].summary}" applies to ${scopes.scopes[1]}`,
        resolvedAt: new Date().toISOString(),
        resolvedBy: 'automatic',
      };
    }
    
    // Can't resolve automatically
    return null;
  }
}
```


---

## Part IX: Feedback Loops & Validation

### 9.1 The Noise Problem

Without feedback, memories accumulate noise:
- Outdated knowledge stays forever
- Wrong inferences never get corrected
- Useful memories don't get strengthened
- Useless memories don't get pruned

### 9.2 Feedback Signal Types

```typescript
type FeedbackSignal =
  | 'memory_used'           // Memory was retrieved and shown to user
  | 'memory_helpful'        // User indicated memory was helpful
  | 'memory_ignored'        // Memory was shown but user didn't use it
  | 'memory_wrong'          // User said memory was incorrect
  | 'code_accepted'         // Generated code using memory was accepted
  | 'code_modified'         // Generated code was modified
  | 'code_rejected'         // Generated code was rejected
  | 'bug_prevented'         // Memory helped prevent a bug
  | 'bug_caused'            // Memory led to a bug
  | 'pattern_followed'      // User followed the pattern
  | 'pattern_violated'      // User intentionally violated pattern
  | 'tribal_heeded'         // User heeded tribal warning
  | 'tribal_ignored';       // User ignored tribal warning

interface FeedbackEvent {
  signal: FeedbackSignal;
  memoryId: string;
  timestamp: string;
  context: {
    file?: string;
    query?: string;
    intent?: Intent;
  };
  metadata?: Record<string, unknown>;
}
```

### 9.3 Feedback Processing Engine

```typescript
class FeedbackProcessor {
  /**
   * Process a feedback signal
   */
  async process(event: FeedbackEvent): Promise<void> {
    const memory = await this.storage.read(event.memoryId);
    if (!memory) return;
    
    // Calculate confidence adjustment
    const adjustment = this.calculateAdjustment(event.signal, memory);
    
    // Update memory
    await this.storage.update(event.memoryId, {
      confidence: Math.max(0, Math.min(1, memory.confidence + adjustment)),
      feedbackHistory: [
        ...(memory.feedbackHistory || []),
        {
          signal: event.signal,
          timestamp: event.timestamp,
          adjustment,
        },
      ],
      lastFeedback: event.timestamp,
    });
    
    // Update causal graph if applicable
    if (this.affectsCausalGraph(event.signal)) {
      await this.updateCausalGraph(event);
    }
    
    // Trigger consolidation if needed
    if (this.shouldTriggerConsolidation(event)) {
      await this.scheduler.scheduleConsolidation();
    }
  }
  
  private calculateAdjustment(signal: FeedbackSignal, memory: Memory): number {
    const adjustments: Record<FeedbackSignal, number> = {
      'memory_used': 0.02,
      'memory_helpful': 0.1,
      'memory_ignored': -0.05,
      'memory_wrong': -0.3,
      'code_accepted': 0.05,
      'code_modified': -0.02,
      'code_rejected': -0.15,
      'bug_prevented': 0.2,
      'bug_caused': -0.4,
      'pattern_followed': 0.05,
      'pattern_violated': -0.1,
      'tribal_heeded': 0.1,
      'tribal_ignored': -0.05,
    };
    
    let base = adjustments[signal] || 0;
    
    // Adjust based on memory importance
    if (memory.importance === 'critical') {
      base *= 0.5;  // Critical memories are more stable
    } else if (memory.importance === 'low') {
      base *= 1.5;  // Low importance memories are more volatile
    }
    
    return base;
  }
}
```

### 9.4 Outcome Tracking

```typescript
class OutcomeTracker {
  /**
   * Track whether a memory actually helped
   */
  async trackOutcome(
    memoryId: string,
    outcome: 'helped' | 'neutral' | 'hurt',
    evidence: OutcomeEvidence
  ): Promise<void> {
    const memory = await this.storage.read(memoryId);
    if (!memory) return;
    
    // Record outcome
    await this.storage.update(memoryId, {
      outcomes: [
        ...(memory.outcomes || []),
        {
          result: outcome,
          evidence,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    
    // Update confidence based on outcome
    const adjustment = outcome === 'helped' ? 0.1 : outcome === 'hurt' ? -0.2 : 0;
    await this.storage.update(memoryId, {
      confidence: Math.max(0, Math.min(1, memory.confidence + adjustment)),
    });
    
    // If memory hurt, analyze why
    if (outcome === 'hurt') {
      await this.analyzeNegativeOutcome(memory, evidence);
    }
  }
  
  /**
   * Detect outcomes automatically
   */
  async detectOutcomes(): Promise<DetectedOutcome[]> {
    const outcomes: DetectedOutcome[] = [];
    
    // Check for bug fixes that reference memories
    const recentCommits = await this.git.getRecentCommits(7);
    for (const commit of recentCommits) {
      if (this.isBugFix(commit)) {
        const relatedMemories = await this.findRelatedMemories(commit);
        for (const memory of relatedMemories) {
          // Did the memory help prevent or cause the bug?
          const role = await this.analyzeMemoryRole(memory, commit);
          outcomes.push({
            memoryId: memory.id,
            outcome: role,
            evidence: { type: 'commit', id: commit.sha },
          });
        }
      }
    }
    
    // Check for pattern violations
    const violations = await this.detectPatternViolations();
    for (const violation of violations) {
      const patternMemory = await this.storage.findByPattern(violation.patternId);
      if (patternMemory.length > 0) {
        outcomes.push({
          memoryId: patternMemory[0].id,
          outcome: 'neutral',  // Pattern exists but wasn't followed
          evidence: { type: 'violation', file: violation.file },
        });
      }
    }
    
    return outcomes;
  }
}
```

### 9.5 Memory Health Dashboard

```typescript
interface MemoryHealthReport {
  // Overall health
  overallScore: number;  // 0-100
  
  // Breakdown
  metrics: {
    totalMemories: number;
    activeMemories: number;
    staleMemories: number;
    conflictingMemories: number;
    
    avgConfidence: number;
    avgAge: number;  // days
    
    feedbackRate: number;  // % of memories with recent feedback
    outcomeRate: number;   // % of memories with tracked outcomes
    
    helpfulRate: number;   // % of outcomes that were 'helped'
    hurtRate: number;      // % of outcomes that were 'hurt'
  };
  
  // Issues
  issues: {
    staleMemories: Memory[];      // Need validation
    lowConfidence: Memory[];      // Might be wrong
    conflicts: MemoryConflict[];  // Need resolution
    noFeedback: Memory[];         // Never used
  };
  
  // Recommendations
  recommendations: string[];
}

class MemoryHealthAnalyzer {
  async analyze(): Promise<MemoryHealthReport> {
    const allMemories = await this.storage.search({ includeArchived: false });
    
    // Calculate metrics
    const metrics = await this.calculateMetrics(allMemories);
    
    // Find issues
    const issues = await this.findIssues(allMemories);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics, issues);
    
    // Calculate overall score
    const overallScore = this.calculateOverallScore(metrics, issues);
    
    return {
      overallScore,
      metrics,
      issues,
      recommendations,
    };
  }
  
  private generateRecommendations(
    metrics: MemoryHealthReport['metrics'],
    issues: MemoryHealthReport['issues']
  ): string[] {
    const recommendations: string[] = [];
    
    if (metrics.staleMemories > metrics.totalMemories * 0.2) {
      recommendations.push(
        `${metrics.staleMemories} memories are stale. Run validation to refresh or archive them.`
      );
    }
    
    if (metrics.avgConfidence < 0.6) {
      recommendations.push(
        `Average confidence is low (${Math.round(metrics.avgConfidence * 100)}%). Consider validating uncertain memories.`
      );
    }
    
    if (issues.conflicts.length > 0) {
      recommendations.push(
        `${issues.conflicts.length} memory conflicts detected. Resolve them to improve consistency.`
      );
    }
    
    if (metrics.feedbackRate < 0.3) {
      recommendations.push(
        `Only ${Math.round(metrics.feedbackRate * 100)}% of memories have feedback. Encourage users to rate memory usefulness.`
      );
    }
    
    if (metrics.hurtRate > 0.1) {
      recommendations.push(
        `${Math.round(metrics.hurtRate * 100)}% of tracked outcomes were negative. Review and correct problematic memories.`
      );
    }
    
    return recommendations;
  }
}
```

---

## Part X: Implementation Roadmap

### 10.1 Phase 1: Token Efficiency Foundation (Week 1-2)

**Goal:** Reduce token consumption by 5x

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Implement compressed memory schema | P0 | 2d | High |
| Build hierarchical retrieval (L0-L3) | P0 | 3d | High |
| Add session state tracking | P0 | 1d | Medium |
| Implement token budget manager v2 | P0 | 2d | High |
| Add memory deduplication | P1 | 1d | Medium |

**Deliverables:**
- `CompressedMemory` type and serialization
- `TokenBudgetManagerV2` class
- `SessionContext` tracking
- Benchmark showing 5x token reduction

### 10.2 Phase 2: Code-Aware Embeddings (Week 2-3)

**Goal:** Improve retrieval relevance by 50%

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Implement structural embedder | P0 | 3d | High |
| Integrate CodeBERT for semantic | P0 | 2d | High |
| Build fusion layer | P0 | 2d | High |
| Implement embedding cache | P1 | 1d | Medium |
| Benchmark against MiniLM | P1 | 1d | Low |

**Deliverables:**
- `HybridEmbedder` class
- `EmbeddingCache` with L1/L2/L3
- Benchmark showing 50% relevance improvement

### 10.3 Phase 3: Causal Memory Graphs (Week 3-4)

**Goal:** Enable "why" explanations with full provenance

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Design causal edge schema | P0 | 1d | High |
| Implement causal graph storage | P0 | 2d | High |
| Build causal inference engine | P0 | 3d | High |
| Implement graph traversal | P0 | 2d | High |
| Add narrative generation | P1 | 2d | Medium |

**Deliverables:**
- `CausalEdge` type and storage
- `CausalInferenceEngine` class
- `CausalGraphTraverser` class
- `drift_why` returns causal narratives

### 10.4 Phase 4: True Learning System (Week 4-5)

**Goal:** Learn from corrections, not just store them

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Build correction analyzer | P0 | 3d | High |
| Implement learning memory factory | P0 | 2d | High |
| Add confidence calibration | P0 | 2d | High |
| Build active learning loop | P1 | 2d | Medium |
| Implement validation prompts | P1 | 1d | Medium |

**Deliverables:**
- `CorrectionAnalyzer` class
- `LearningMemoryFactory` class
- `ConfidenceCalibrator` class
- `ActiveLearningLoop` class

### 10.5 Phase 5: Predictive Retrieval (Week 5-6)

**Goal:** Zero-latency context for common queries

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Build prediction model | P0 | 3d | High |
| Implement prediction cache | P0 | 2d | High |
| Add file-open hooks | P0 | 1d | Medium |
| Implement temporal predictions | P1 | 2d | Medium |
| Add behavioral predictions | P1 | 2d | Medium |

**Deliverables:**
- `MemoryPredictor` class
- `PredictionCache` class
- IDE integration for file-open events
- Benchmark showing <20ms retrieval

### 10.6 Phase 6: Memory-Guided Generation (Week 6-7)

**Goal:** Generated code with traceable provenance

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Build generation context builder | P0 | 2d | High |
| Implement provenance tracking | P0 | 2d | High |
| Add provenance comments | P0 | 1d | Medium |
| Build generation feedback loop | P0 | 2d | High |
| Implement validation against context | P1 | 2d | Medium |

**Deliverables:**
- `GenerationContextBuilder` class
- `ProvenanceAwareGenerator` class
- `GenerationFeedbackLoop` class
- Generated code includes provenance comments

### 10.7 Phase 7: Conflict Resolution & Feedback (Week 7-8)

**Goal:** Self-improving memory system

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Build conflict detector | P0 | 2d | High |
| Implement conflict surfacing | P0 | 1d | Medium |
| Add automatic resolution | P0 | 2d | High |
| Build feedback processor | P0 | 2d | High |
| Implement outcome tracking | P0 | 2d | High |
| Add health dashboard | P1 | 2d | Medium |

**Deliverables:**
- `ConflictDetector` class
- `ConflictResolver` class
- `FeedbackProcessor` class
- `OutcomeTracker` class
- `MemoryHealthAnalyzer` class

---

## Part XI: Success Metrics

### 11.1 Token Efficiency Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Tokens per task | ~13,500 | ~900 | Average across 100 tasks |
| Context retrieval tokens | ~2,000 | ~400 | Per retrieval call |
| Redundant context | ~40% | <5% | % of context already in session |
| Retrieval latency | 200ms | 20ms | P95 latency |

### 11.2 Quality Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| First-time correctness | 40% | 95% | % of generations accepted without modification |
| Retrieval relevance | 60% | 90% | % of retrieved memories rated helpful |
| Conflict detection | 0% | 95% | % of conflicts detected before surfacing |
| Learning accuracy | N/A | 80% | % of learned corrections that prove correct |

### 11.3 User Satisfaction Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| "Bad code" complaints | High | Near zero | User feedback |
| "Doesn't understand" complaints | High | Near zero | User feedback |
| Trust in generated code | Low | High | Survey |
| Time to productive | Hours | Minutes | Onboarding time |

---

## Conclusion

This design transforms Drift Cortex from a "memory system" into an **intelligent coding partner** that:

1. **Uses 15x fewer tokens** through aggressive compression and session tracking
2. **Actually learns** from corrections, not just stores them
3. **Understands causality** — why patterns exist, not just that they exist
4. **Predicts needs** before the user asks
5. **Generates code with provenance** — traceable, explainable, trustworthy
6. **Resolves conflicts** instead of hiding them
7. **Improves over time** through feedback loops

The result: users stop complaining about bad code because the AI finally understands their codebase the way they do.

---

## Appendix A: Migration from v1

Existing Cortex v1 installations can migrate incrementally:

1. **Schema migration**: Add new columns for causal edges, feedback history, compression levels
2. **Embedding migration**: Re-compute embeddings with hybrid embedder (background job)
3. **Causal inference**: Run inference on existing memories to build initial graph
4. **Compression**: Compress existing memories to new schema (background job)

No data loss. Full backward compatibility during migration.

## Appendix B: API Changes

New MCP tools:
- `drift_memory_explain` — Get causal explanation for a memory
- `drift_memory_validate` — Trigger validation for uncertain memories
- `drift_memory_conflicts` — List and resolve conflicts
- `drift_memory_health` — Get health report
- `drift_generation_context` — Get context for code generation with provenance

Modified tools:
- `drift_context` — Now returns compressed context with session tracking
- `drift_why` — Now returns causal narratives, not just lists
- `drift_memory_add` — Now triggers causal inference

## Appendix C: Configuration

```json
{
  "cortex": {
    "tokenEfficiency": {
      "defaultCompressionLevel": 1,
      "maxCompressionLevel": 3,
      "sessionTracking": true,
      "predictiveRetrieval": true
    },
    "embeddings": {
      "provider": "hybrid",
      "structural": { "enabled": true },
      "semantic": { "model": "microsoft/codebert-base" },
      "lexical": { "enabled": true },
      "weights": { "structural": 0.3, "semantic": 0.5, "lexical": 0.2 }
    },
    "causalGraph": {
      "autoInference": true,
      "maxDepth": 5,
      "minStrength": 0.5
    },
    "learning": {
      "correctionAnalysis": true,
      "confidenceCalibration": true,
      "activeValidation": true,
      "validationThreshold": 0.6
    },
    "feedback": {
      "trackOutcomes": true,
      "autoDetectOutcomes": true,
      "healthReports": true
    }
  }
}
```


---

## Part XII: Research-Validated Enhancements (January 2026)

Based on latest research and industry developments, here are critical improvements to the design:

### 12.1 Embedding Model Update: voyage-code-3

**Original Design:** Proposed CodeBERT/hybrid embeddings

**Research Finding:** voyage-code-3 (released late 2024) outperforms all alternatives:
- 13.80% better than OpenAI text-embedding-3-large on code retrieval
- 16.81% better than CodeSage-large
- Supports quantized embeddings for lower storage costs
- Optimized specifically for code understanding

**Updated Recommendation:**

```typescript
// packages/cortex/src/embeddings/voyage-code.ts

import Anthropic from '@anthropic-ai/sdk';

export class VoyageCodeEmbedder implements IEmbeddingProvider {
  readonly name = 'voyage-code-3';
  readonly dimensions = 1024;  // Can be reduced with quantization
  readonly maxTokens = 16000;  // Much larger context than CodeBERT
  
  private client: VoyageClient;
  
  async embed(code: string): Promise<number[]> {
    const response = await this.client.embed({
      input: code,
      model: 'voyage-code-3',
      input_type: 'document',  // or 'query' for search queries
    });
    return response.embeddings[0];
  }
  
  // For local/offline: fall back to jina-code-v2 or nomic-embed-code
  async embedLocal(code: string): Promise<number[]> {
    // Use jina-code-embeddings-v2 via transformers.js
    // 768 dimensions, runs locally
  }
}
```

**Fallback Strategy:**
1. **Production:** voyage-code-3 (best quality)
2. **Offline/Local:** jina-code-embeddings-v2 or nomic-embed-code
3. **Budget:** CodeSage-large (open source, self-hosted)

### 12.2 Contextual Retrieval (Anthropic's Approach)

**Research Finding:** Anthropic's Contextual Retrieval reduces retrieval failures by 67% when combined with reranking.

**Key Insight:** Before embedding a chunk, prepend context explaining what the chunk is about.

**Implementation:**

```typescript
// packages/cortex/src/storage/contextual-embedder.ts

class ContextualEmbedder {
  /**
   * Add context to memory before embedding
   * This dramatically improves retrieval accuracy
   */
  async embedWithContext(memory: Memory): Promise<number[]> {
    // Generate context for the memory
    const context = await this.generateContext(memory);
    
    // Prepend context to the memory content
    const contextualContent = `${context}\n\n${this.extractContent(memory)}`;
    
    // Embed the contextualized content
    return this.embedder.embed(contextualContent);
  }
  
  private async generateContext(memory: Memory): Promise<string> {
    // Use a small, fast model to generate context
    // This is cached and only computed once per memory
    
    switch (memory.type) {
      case 'tribal':
        return `This is tribal knowledge about ${memory.topic} in the codebase. ` +
               `Severity: ${memory.severity}. ` +
               `Related to: ${memory.linkedPatterns?.join(', ') || 'general'}.`;
               
      case 'pattern_rationale':
        return `This explains why the pattern "${memory.patternName}" exists. ` +
               `It was created because: ${memory.rationale?.slice(0, 100)}...`;
               
      case 'procedural':
        return `This is a procedure for "${memory.name}" with ${memory.steps?.length || 0} steps. ` +
               `Use when: ${memory.trigger || 'applicable'}.`;
               
      // ... other types
    }
  }
}
```

### 12.3 Two-Stage Retrieval with Reranking

**Research Finding:** Cross-encoder reranking improves precision by 30-50% with minimal latency cost.

**Implementation:**

```typescript
// packages/cortex/src/retrieval/reranker.ts

class TwoStageRetriever {
  private embedder: IEmbeddingProvider;
  private reranker: CrossEncoderReranker;
  
  async retrieve(query: string, options: RetrievalOptions): Promise<Memory[]> {
    // Stage 1: Fast semantic search (wide net)
    const candidates = await this.semanticSearch(query, {
      limit: options.limit * 5,  // Retrieve 5x more than needed
    });
    
    // Stage 2: Cross-encoder reranking (precise)
    const reranked = await this.reranker.rerank(query, candidates);
    
    // Return top results
    return reranked.slice(0, options.limit);
  }
}

class CrossEncoderReranker {
  // Options:
  // 1. Cohere Rerank v4 (best quality, API)
  // 2. zerank-1 (open source, fast)
  // 3. bge-reranker-v2-m3 (multilingual, self-hosted)
  
  async rerank(query: string, candidates: Memory[]): Promise<Memory[]> {
    const pairs = candidates.map(c => ({
      query,
      document: this.memoryToText(c),
    }));
    
    const scores = await this.model.score(pairs);
    
    return candidates
      .map((c, i) => ({ memory: c, score: scores[i] }))
      .sort((a, b) => b.score - a.score)
      .map(x => x.memory);
  }
}
```

### 12.4 Letta/MemGPT Architecture Alignment

**Research Finding:** Letta (formerly MemGPT) pioneered the two-tier memory architecture that's now industry standard.

**Key Concepts to Adopt:**

1. **In-Context Memory (Core):** Always visible in prompt
   - System instructions
   - Memory blocks (read-write)
   - Recent conversation

2. **Out-of-Context Memory:** Searchable via tools
   - Recall memory (conversation history)
   - Archival memory (long-term storage)

**Updated Architecture:**

```typescript
// packages/cortex/src/memory/tiered-memory.ts

interface TieredMemorySystem {
  // Tier 1: Always in context (core memory)
  core: {
    project: CoreMemory;           // Project identity
    activePatterns: string[];      // Currently relevant patterns
    recentTribal: TribalMemory[];  // Last 3 critical warnings
    sessionContext: SessionContext;
  };
  
  // Tier 2: Searchable (out-of-context)
  searchable: {
    recall: RecallMemory;          // Recent interactions
    archival: ArchivalMemory;      // Long-term storage
    patterns: PatternMemory[];     // All pattern rationales
    tribal: TribalMemory[];        // All tribal knowledge
  };
  
  // Memory management tools (agent can call these)
  tools: {
    core_memory_append: (block: string, content: string) => void;
    core_memory_replace: (block: string, old: string, new: string) => void;
    archival_memory_insert: (content: string) => void;
    archival_memory_search: (query: string) => Memory[];
    conversation_search: (query: string) => Message[];
  };
}
```

### 12.5 Mem0 Integration Patterns

**Research Finding:** Mem0's architecture for scalable long-term memory is production-proven.

**Key Patterns to Adopt:**

1. **Incremental Processing:**
   - Extraction phase: Create salient memories from conversations
   - Update phase: Manage memories via LLM-driven tool calls

2. **Hybrid Data Store:**
   - Vector store for semantic search
   - Graph store for relationships
   - Key-value store for fast lookups

**Implementation:**

```typescript
// packages/cortex/src/memory/mem0-style.ts

class Mem0StyleMemoryManager {
  private vectorStore: VectorStore;      // sqlite-vec
  private graphStore: GraphStore;        // Causal edges
  private kvStore: KeyValueStore;        // Fast lookups
  
  /**
   * Extract memories from a conversation
   * (Mem0's extraction phase)
   */
  async extractFromConversation(
    messages: Message[],
    existingMemories: Memory[]
  ): Promise<ExtractedMemory[]> {
    // Use LLM to identify salient information
    const prompt = this.buildExtractionPrompt(messages, existingMemories);
    const extracted = await this.llm.extract(prompt);
    
    // Deduplicate against existing memories
    const deduplicated = await this.deduplicate(extracted, existingMemories);
    
    return deduplicated;
  }
  
  /**
   * Update memories based on new information
   * (Mem0's update phase)
   */
  async updateMemories(
    newInfo: ExtractedMemory[],
    existingMemories: Memory[]
  ): Promise<MemoryUpdate[]> {
    const updates: MemoryUpdate[] = [];
    
    for (const info of newInfo) {
      // Check for conflicts
      const conflicts = await this.findConflicts(info, existingMemories);
      
      if (conflicts.length > 0) {
        // Resolve conflicts (newer wins, or ask user)
        const resolution = await this.resolveConflicts(info, conflicts);
        updates.push(resolution);
      } else {
        // Check for memories to strengthen
        const similar = await this.findSimilar(info, existingMemories);
        
        if (similar.length > 0) {
          // Strengthen existing memory
          updates.push({
            type: 'strengthen',
            memoryId: similar[0].id,
            confidence: similar[0].confidence + 0.1,
          });
        } else {
          // Create new memory
          updates.push({
            type: 'create',
            memory: this.createMemory(info),
          });
        }
      }
    }
    
    return updates;
  }
}
```

### 12.6 GraphRAG for Causal Reasoning

**Research Finding:** GraphRAG achieves 85%+ accuracy on complex queries vs 70% for vector RAG.

**Key Insight:** Knowledge graphs preserve relational context that vector search loses.

**Enhanced Causal Graph:**

```typescript
// packages/cortex/src/graph/causal-rag.ts

class CausalRAG {
  private vectorStore: VectorStore;
  private graphStore: Neo4jStore;  // Or SQLite with graph queries
  
  /**
   * Hybrid retrieval: vector + graph
   */
  async retrieve(query: string): Promise<RetrievalResult> {
    // 1. Vector search for semantic matches
    const vectorResults = await this.vectorStore.search(query, { limit: 20 });
    
    // 2. Extract entities from query
    const entities = await this.extractEntities(query);
    
    // 3. Graph traversal for related context
    const graphResults = await this.graphStore.traverse({
      startNodes: entities,
      maxHops: 3,
      relationTypes: ['caused', 'enabled', 'prevented', 'supports'],
    });
    
    // 4. Merge and deduplicate
    const merged = this.mergeResults(vectorResults, graphResults);
    
    // 5. Rerank with cross-encoder
    const reranked = await this.reranker.rerank(query, merged);
    
    return {
      memories: reranked,
      causalChains: this.extractCausalChains(graphResults),
      confidence: this.calculateConfidence(reranked),
    };
  }
  
  /**
   * Answer "why" questions using causal chains
   */
  async answerWhy(question: string): Promise<WhyAnswer> {
    // Extract the subject of the question
    const subject = await this.extractSubject(question);
    
    // Find the memory for this subject
    const memory = await this.findMemory(subject);
    if (!memory) return { answer: 'No information found', confidence: 0 };
    
    // Trace causal chain backwards
    const chain = await this.traceCausalChain(memory.id, {
      direction: 'backward',
      maxDepth: 5,
    });
    
    // Generate narrative from chain
    const narrative = this.generateNarrative(chain);
    
    return {
      answer: narrative,
      chain,
      confidence: this.calculateChainConfidence(chain),
      sources: chain.nodes.map(n => n.id),
    };
  }
}
```

### 12.7 LLMLingua-Style Compression

**Research Finding:** LLMLingua achieves 20x compression with minimal accuracy loss.

**Key Insight:** Not all tokens are equally important. Compress aggressively while preserving key information.

**Implementation:**

```typescript
// packages/cortex/src/compression/llmlingua-style.ts

class IntelligentCompressor {
  /**
   * Compress memory content while preserving key information
   */
  async compress(
    content: string,
    targetRatio: number  // e.g., 0.2 for 5x compression
  ): Promise<CompressedContent> {
    // 1. Token importance scoring
    const tokens = this.tokenize(content);
    const importance = await this.scoreImportance(tokens);
    
    // 2. Budget allocation
    const targetTokens = Math.floor(tokens.length * targetRatio);
    
    // 3. Greedy selection of most important tokens
    const selected = this.selectTopTokens(tokens, importance, targetTokens);
    
    // 4. Reconstruct coherent text
    const compressed = this.reconstruct(selected);
    
    return {
      original: content,
      compressed,
      ratio: compressed.length / content.length,
      preservedInfo: this.calculatePreservedInfo(content, compressed),
    };
  }
  
  private async scoreImportance(tokens: string[]): Promise<number[]> {
    // Use a small model to score token importance
    // Key signals:
    // - Named entities (high importance)
    // - Technical terms (high importance)
    // - Function/class names (high importance)
    // - Stop words (low importance)
    // - Repeated information (low importance)
    
    const scores: number[] = [];
    
    for (let i = 0; i < tokens.length; i++) {
      let score = 0.5;  // Base score
      
      // Boost for code identifiers
      if (this.isCodeIdentifier(tokens[i])) score += 0.3;
      
      // Boost for technical terms
      if (this.isTechnicalTerm(tokens[i])) score += 0.2;
      
      // Reduce for stop words
      if (this.isStopWord(tokens[i])) score -= 0.3;
      
      // Reduce for repeated tokens
      if (this.isRepeated(tokens[i], tokens.slice(0, i))) score -= 0.2;
      
      scores.push(Math.max(0, Math.min(1, score)));
    }
    
    return scores;
  }
}
```

### 12.8 Feedback Loop Validation

**Research Finding:** 65% of developers say AI assistants "miss relevant context" (Codium 2025 report).

**Key Insight:** The feedback loop must capture WHAT context was missing, not just that it was wrong.

**Enhanced Feedback System:**

```typescript
// packages/cortex/src/feedback/context-gap-detector.ts

class ContextGapDetector {
  /**
   * Analyze a correction to identify what context was missing
   */
  async analyzeGap(
    original: GeneratedCode,
    correction: string,
    feedback: string
  ): Promise<ContextGap> {
    // 1. Diff the code
    const diff = this.computeDiff(original.code, correction);
    
    // 2. Identify what changed
    const changes = this.categorizeChanges(diff);
    
    // 3. Map changes to missing context types
    const gaps: ContextGapType[] = [];
    
    for (const change of changes) {
      if (change.type === 'pattern_change') {
        gaps.push({
          type: 'missing_pattern',
          pattern: change.newPattern,
          shouldHaveKnown: true,
        });
      }
      
      if (change.type === 'api_change') {
        gaps.push({
          type: 'missing_api_knowledge',
          api: change.newApi,
          shouldHaveKnown: await this.isDocumented(change.newApi),
        });
      }
      
      if (change.type === 'style_change') {
        gaps.push({
          type: 'missing_style_preference',
          preference: change.newStyle,
          shouldHaveKnown: false,  // User preference, not documented
        });
      }
    }
    
    // 4. Create memories to fill gaps
    const newMemories = await this.createGapFillingMemories(gaps, feedback);
    
    return {
      gaps,
      newMemories,
      confidence: this.calculateConfidence(gaps, feedback),
    };
  }
}
```

---

## Part XIII: Updated Implementation Priorities

Based on research validation, here's the revised priority order:

### Critical Path (Must Have)

1. **voyage-code-3 Integration** (or jina-code-v2 for local)
   - Replaces MiniLM immediately
   - 15%+ improvement in retrieval accuracy

2. **Contextual Embeddings** (Anthropic's approach)
   - Prepend context before embedding
   - 35% reduction in retrieval failures

3. **Two-Stage Retrieval with Reranking**
   - Cross-encoder reranking after vector search
   - 30-50% precision improvement

4. **Tiered Memory (Letta-style)**
   - Core memory always in context
   - Searchable memory via tools
   - Industry-proven architecture

### High Value (Should Have)

5. **GraphRAG for Causal Chains**
   - 85% accuracy on complex queries
   - Enables true "why" explanations

6. **LLMLingua-style Compression**
   - 20x compression with minimal loss
   - Critical for token efficiency

7. **Context Gap Detection**
   - Learn WHAT was missing, not just that it was wrong
   - Addresses the #1 developer complaint

### Nice to Have

8. **Mem0-style Incremental Processing**
   - Automatic memory extraction
   - Conflict resolution

9. **Predictive Pre-loading**
   - Zero-latency retrieval
   - Requires IDE integration

---

## Part XIV: Competitive Analysis

### How Cortex Compares to Alternatives

| Feature | Cortex v2 | Mem0 | Letta | Cursor | Copilot |
|---------|-----------|------|-------|--------|---------|
| Code-aware embeddings | ✅ voyage-code-3 | ❌ General | ❌ General | ✅ Proprietary | ✅ Proprietary |
| Causal reasoning | ✅ GraphRAG | ❌ | ❌ | ❌ | ❌ |
| Pattern detection | ✅ 400+ detectors | ❌ | ❌ | ❌ | ❌ |
| Tribal knowledge | ✅ First-class | ⚠️ Generic | ⚠️ Generic | ❌ | ❌ |
| Self-healing validation | ✅ | ❌ | ❌ | ❌ | ❌ |
| Token efficiency | ✅ 15x | ⚠️ 3x | ⚠️ 5x | ❌ | ❌ |
| Open source | ✅ | ✅ | ✅ | ❌ | ❌ |
| IDE agnostic | ✅ MCP | ✅ | ✅ | ❌ | ❌ |

### Cortex's Unique Moat

1. **Code Understanding:** Drift's 400+ pattern detectors + call graph analysis
2. **Causal Memory:** Not just facts, but WHY things exist
3. **Self-Healing:** Validates memories against actual code
4. **Token Efficiency:** 15x reduction through intelligent compression
5. **Open + Extensible:** MCP-based, works with any AI

---

## Conclusion: The Path Forward

This design, validated against January 2026 research, transforms Cortex from a memory system into an **intelligent coding partner** that:

1. Uses **voyage-code-3** for state-of-the-art code understanding
2. Applies **Anthropic's Contextual Retrieval** for 67% fewer retrieval failures
3. Implements **two-stage retrieval with reranking** for 30-50% better precision
4. Adopts **Letta's tiered memory architecture** (industry-proven)
5. Builds **causal graphs** for true "why" explanations (GraphRAG)
6. Achieves **20x compression** with LLMLingua-style techniques
7. **Learns from corrections** by detecting context gaps

The result: AI that finally understands codebases the way developers do.

No more "missing context" complaints. No more bad code. No more crying.

**Let's build it.**


---

## Part XV: Novel Features That Don't Exist Anywhere Else

These are the features that will make Cortex truly unique — things no competitor has:

### 15.1 Code-Grounded Memory Validation

**The Problem:** Memory systems store knowledge but never verify it against reality.

**The Innovation:** Cortex validates memories against the actual codebase.

```typescript
// packages/cortex/src/validation/code-grounded-validator.ts

class CodeGroundedValidator {
  /**
   * Validate a memory against the actual codebase
   * This is unique to Cortex because we have Drift's analysis engine
   */
  async validate(memory: Memory): Promise<ValidationResult> {
    switch (memory.type) {
      case 'pattern_rationale':
        return this.validatePatternRationale(memory);
      case 'tribal':
        return this.validateTribalKnowledge(memory);
      case 'constraint_override':
        return this.validateConstraintOverride(memory);
      default:
        return { valid: true, confidence: memory.confidence };
    }
  }
  
  private async validatePatternRationale(memory: PatternRationaleMemory): Promise<ValidationResult> {
    // Check if the pattern still exists in the codebase
    const pattern = await this.drift.getPattern(memory.patternId);
    
    if (!pattern) {
      return {
        valid: false,
        reason: 'Pattern no longer exists in codebase',
        action: 'archive',
      };
    }
    
    // Check if the pattern is still being followed
    const compliance = await this.drift.getPatternCompliance(memory.patternId);
    
    if (compliance.violations > compliance.conforming) {
      return {
        valid: false,
        reason: `Pattern is now violated more than followed (${compliance.violations} violations vs ${compliance.conforming} conforming)`,
        action: 'flag_for_review',
        newConfidence: memory.confidence * 0.5,
      };
    }
    
    // Check if examples in memory still exist
    const examplesValid = await this.validateExamples(memory.examples);
    
    if (examplesValid.invalidCount > examplesValid.validCount) {
      return {
        valid: true,
        action: 'update_examples',
        newExamples: examplesValid.validExamples,
        newConfidence: memory.confidence * 0.8,
      };
    }
    
    return { valid: true, confidence: memory.confidence };
  }
  
  private async validateTribalKnowledge(memory: TribalMemory): Promise<ValidationResult> {
    // Check if the tribal knowledge is still relevant
    
    // 1. Check if referenced files still exist
    if (memory.linkedFiles?.length) {
      const existingFiles = await this.checkFilesExist(memory.linkedFiles);
      if (existingFiles.length === 0) {
        return {
          valid: false,
          reason: 'All referenced files have been deleted',
          action: 'archive',
        };
      }
    }
    
    // 2. Check if the warning is still applicable
    // Use Drift's analysis to see if the condition still exists
    if (memory.severity === 'critical') {
      const stillApplicable = await this.checkConditionExists(memory);
      if (!stillApplicable) {
        return {
          valid: false,
          reason: 'The condition this warning addresses no longer exists',
          action: 'archive',
        };
      }
    }
    
    // 3. Check citation validity (if memory has code citations)
    if (memory.citations?.length) {
      const citationStatus = await this.validateCitations(memory.citations);
      if (citationStatus.driftedCount > 0) {
        return {
          valid: true,
          action: 'update_citations',
          newCitations: citationStatus.validCitations,
          newConfidence: memory.confidence * 0.9,
        };
      }
    }
    
    return { valid: true, confidence: memory.confidence };
  }
}
```

### 15.2 Intent-Aware Memory Weighting

**The Problem:** All memory systems treat retrieval the same regardless of what the user is trying to do.

**The Innovation:** Different intents need different memories. Security audit needs different context than adding a feature.

```typescript
// packages/cortex/src/retrieval/intent-weighting-matrix.ts

/**
 * Intent-aware weighting matrix
 * Each cell represents how important a memory type is for a given intent
 * 
 * This is unique because we understand WHAT the user is trying to do,
 * not just WHAT they're asking about.
 */
const INTENT_WEIGHT_MATRIX: Record<Intent, Record<MemoryType, number>> = {
  add_feature: {
    core: 1.0,              // Always need project context
    tribal: 0.8,            // Warnings about gotchas
    procedural: 0.9,        // How to do things
    semantic: 0.7,          // General knowledge
    episodic: 0.3,          // Recent interactions (less relevant)
    pattern_rationale: 1.0, // Why patterns exist (critical!)
    constraint_override: 0.6,
    decision_context: 0.7,
    code_smell: 0.5,
  },
  
  fix_bug: {
    core: 0.8,
    tribal: 1.0,            // Gotchas are critical for bugs!
    procedural: 0.6,
    semantic: 0.8,
    episodic: 0.7,          // Recent similar bugs
    pattern_rationale: 0.7,
    constraint_override: 0.5,
    decision_context: 0.6,
    code_smell: 1.0,        // Code smells often cause bugs!
  },
  
  security_audit: {
    core: 0.9,
    tribal: 1.0,            // Security warnings are critical!
    procedural: 0.8,        // Security procedures
    semantic: 0.7,
    episodic: 0.4,
    pattern_rationale: 0.9, // Why security patterns exist
    constraint_override: 1.0, // Security overrides are critical!
    decision_context: 0.8,  // Why security decisions were made
    code_smell: 0.9,        // Security smells
  },
  
  refactor: {
    core: 0.8,
    tribal: 0.9,            // Don't break things!
    procedural: 0.7,
    semantic: 0.8,
    episodic: 0.5,
    pattern_rationale: 1.0, // Must understand why patterns exist
    constraint_override: 0.7,
    decision_context: 1.0,  // Why code is structured this way
    code_smell: 0.8,
  },
  
  understand_code: {
    core: 1.0,
    tribal: 0.9,
    procedural: 0.6,
    semantic: 1.0,          // General knowledge is key
    episodic: 0.4,
    pattern_rationale: 1.0, // Understanding WHY
    constraint_override: 0.8,
    decision_context: 1.0,  // Understanding decisions
    code_smell: 0.6,
  },
  
  add_test: {
    core: 0.7,
    tribal: 0.8,            // Testing gotchas
    procedural: 1.0,        // How to write tests here
    semantic: 0.6,
    episodic: 0.5,
    pattern_rationale: 0.8, // Why test patterns exist
    constraint_override: 0.5,
    decision_context: 0.6,
    code_smell: 0.7,
  },
};

class IntentAwareRetriever {
  async retrieve(context: RetrievalContext): Promise<Memory[]> {
    const weights = INTENT_WEIGHT_MATRIX[context.intent];
    
    // Get candidates
    const candidates = await this.gatherCandidates(context);
    
    // Apply intent-specific weighting
    const weighted = candidates.map(memory => ({
      memory,
      score: this.calculateScore(memory, context) * weights[memory.type],
    }));
    
    // Sort by weighted score
    return weighted
      .sort((a, b) => b.score - a.score)
      .map(w => w.memory);
  }
}
```

### 15.3 Automatic Anti-Pattern Detection

**The Problem:** Memory systems store what TO do, but not what NOT to do.

**The Innovation:** Automatically detect and store anti-patterns from corrections.

```typescript
// packages/cortex/src/learning/anti-pattern-detector.ts

class AntiPatternDetector {
  /**
   * Detect anti-patterns from rejected code
   */
  async detectFromRejection(
    rejectedCode: string,
    feedback: string,
    context: GenerationContext
  ): Promise<AntiPattern | null> {
    // 1. Analyze what was wrong
    const analysis = await this.analyzeRejection(rejectedCode, feedback);
    
    if (!analysis.isAntiPattern) {
      return null;  // Just a mistake, not a pattern
    }
    
    // 2. Generalize the anti-pattern
    const generalized = await this.generalize(analysis);
    
    // 3. Find similar occurrences in codebase
    const occurrences = await this.findSimilarOccurrences(generalized);
    
    // 4. Create anti-pattern memory
    return {
      id: generateId(),
      type: 'code_smell',
      name: generalized.name,
      description: generalized.description,
      pattern: generalized.codePattern,  // Regex or AST pattern
      why: analysis.reason,
      instead: analysis.correctApproach,
      severity: this.calculateSeverity(occurrences),
      examples: {
        bad: [rejectedCode.slice(0, 200)],
        good: analysis.correctApproach ? [analysis.correctApproach.slice(0, 200)] : [],
      },
      occurrences: occurrences.length,
      confidence: this.calculateConfidence(analysis, occurrences),
      linkedPatterns: context.patterns.map(p => p.id),
      linkedFiles: [context.target.file],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  
  private async generalize(analysis: RejectionAnalysis): Promise<GeneralizedAntiPattern> {
    // Extract the generalizable pattern from the specific rejection
    
    // Example: "Don't use inline SQL" from a specific SQL injection
    // Example: "Don't mutate state directly" from a specific React bug
    
    const patterns = [
      {
        detector: this.detectInlineSQL,
        name: 'Inline SQL',
        description: 'SQL queries constructed with string concatenation',
      },
      {
        detector: this.detectDirectStateMutation,
        name: 'Direct State Mutation',
        description: 'Mutating state directly instead of using setState/dispatch',
      },
      {
        detector: this.detectMissingErrorHandling,
        name: 'Missing Error Handling',
        description: 'Async operations without try/catch or .catch()',
      },
      {
        detector: this.detectHardcodedSecrets,
        name: 'Hardcoded Secrets',
        description: 'API keys, passwords, or tokens in source code',
      },
      // ... more patterns
    ];
    
    for (const pattern of patterns) {
      if (await pattern.detector(analysis.rejectedCode)) {
        return {
          name: pattern.name,
          description: pattern.description,
          codePattern: await this.extractCodePattern(analysis.rejectedCode, pattern),
        };
      }
    }
    
    // If no known pattern, create a custom one
    return {
      name: `Custom: ${analysis.reason.slice(0, 30)}`,
      description: analysis.reason,
      codePattern: null,  // Can't generalize
    };
  }
}
```

### 15.4 The "Explain Like I'm New" Generator

**The Problem:** Onboarding to a new codebase is painful. Documentation is often outdated.

**The Innovation:** Generate a narrative explanation of the codebase from memories.

```typescript
// packages/cortex/src/narrative/onboarding-generator.ts

class OnboardingNarrativeGenerator {
  /**
   * Generate an onboarding narrative for a new developer
   */
  async generate(options: OnboardingOptions): Promise<OnboardingNarrative> {
    // 1. Get core memory (project identity)
    const core = await this.storage.getCoreMemory();
    
    // 2. Get architectural decisions
    const decisions = await this.storage.search({
      types: ['decision_context'],
      importance: ['high', 'critical'],
      limit: 10,
    });
    
    // 3. Get critical tribal knowledge
    const tribal = await this.storage.search({
      types: ['tribal'],
      severity: ['critical', 'warning'],
      limit: 15,
    });
    
    // 4. Get key patterns
    const patterns = await this.storage.search({
      types: ['pattern_rationale'],
      importance: ['high', 'critical'],
      limit: 10,
    });
    
    // 5. Get procedures
    const procedures = await this.storage.search({
      types: ['procedural'],
      limit: 10,
    });
    
    // 6. Generate narrative
    return this.synthesizeNarrative({
      core,
      decisions,
      tribal,
      patterns,
      procedures,
      options,
    });
  }
  
  private synthesizeNarrative(data: NarrativeData): OnboardingNarrative {
    const sections: NarrativeSection[] = [];
    
    // Section 1: Project Overview
    sections.push({
      title: 'Welcome to the Codebase',
      content: this.generateOverview(data.core),
    });
    
    // Section 2: Architecture
    sections.push({
      title: 'How It\'s Built',
      content: this.generateArchitectureSection(data.decisions, data.patterns),
    });
    
    // Section 3: The "Don't Do This" Section
    sections.push({
      title: 'Things to Watch Out For',
      content: this.generateWarningsSection(data.tribal),
    });
    
    // Section 4: How We Do Things
    sections.push({
      title: 'Common Procedures',
      content: this.generateProceduresSection(data.procedures),
    });
    
    // Section 5: Key Decisions and Why
    sections.push({
      title: 'Why Things Are the Way They Are',
      content: this.generateDecisionsSection(data.decisions),
    });
    
    return {
      sections,
      generatedAt: new Date().toISOString(),
      memoryCount: this.countMemories(data),
      confidence: this.calculateOverallConfidence(data),
    };
  }
  
  private generateOverview(core: CoreMemory): string {
    return `
This is ${core.project.name}. ${core.project.description || ''}

**Tech Stack:** ${core.techStack?.languages?.join(', ') || 'Not specified'}
**Frameworks:** ${core.techStack?.frameworks?.join(', ') || 'Not specified'}

**Key Directories:**
${core.structure?.keyDirectories?.map(d => `- \`${d.path}\`: ${d.purpose}`).join('\n') || 'Not documented'}

**Team Conventions:**
${core.conventions?.naming || 'Follow existing patterns'}
    `.trim();
  }
  
  private generateWarningsSection(tribal: TribalMemory[]): string {
    const critical = tribal.filter(t => t.severity === 'critical');
    const warnings = tribal.filter(t => t.severity === 'warning');
    
    let content = '';
    
    if (critical.length > 0) {
      content += '### 🚨 Critical (Don\'t Ignore These)\n\n';
      content += critical.map(t => `- **${t.topic}**: ${t.knowledge}`).join('\n');
      content += '\n\n';
    }
    
    if (warnings.length > 0) {
      content += '### ⚠️ Warnings\n\n';
      content += warnings.map(t => `- **${t.topic}**: ${t.knowledge}`).join('\n');
    }
    
    return content || 'No critical warnings documented yet.';
  }
}
```

### 15.5 Memory-Guided PR Review

**The Problem:** PR reviews miss context that only exists in people's heads.

**The Innovation:** Automatically surface relevant memories during PR review.

```typescript
// packages/cortex/src/integrations/pr-review.ts

class MemoryGuidedPRReview {
  /**
   * Analyze a PR and surface relevant memories
   */
  async analyzePR(pr: PullRequest): Promise<PRReviewContext> {
    const context: PRReviewContext = {
      relevantPatterns: [],
      tribalWarnings: [],
      constraintViolations: [],
      decisionContext: [],
      suggestions: [],
    };
    
    // Analyze each changed file
    for (const file of pr.changedFiles) {
      // Get memories for this file
      const fileMemories = await this.storage.findByFile(file.path);
      
      // Get patterns that apply to this file
      const patterns = await this.drift.getPatternsForFile(file.path);
      
      // Check for pattern violations in the diff
      for (const pattern of patterns) {
        const violations = await this.checkPatternViolations(file.diff, pattern);
        if (violations.length > 0) {
          // Get the rationale for this pattern
          const rationale = await this.storage.findByPattern(pattern.id);
          
          context.relevantPatterns.push({
            pattern,
            rationale: rationale[0],
            violations,
            suggestion: `This change violates the "${pattern.name}" pattern. ${rationale[0]?.rationale || ''}`,
          });
        }
      }
      
      // Check for tribal knowledge warnings
      const tribal = fileMemories.filter(m => m.type === 'tribal');
      for (const warning of tribal) {
        if (this.warningApplies(file.diff, warning)) {
          context.tribalWarnings.push({
            warning,
            file: file.path,
            reason: `This file has tribal knowledge: "${warning.knowledge}"`,
          });
        }
      }
      
      // Check for constraint violations
      const constraints = await this.drift.getConstraintsForFile(file.path);
      for (const constraint of constraints) {
        const violation = await this.checkConstraintViolation(file.diff, constraint);
        if (violation) {
          // Check for overrides
          const overrides = await this.storage.search({
            types: ['constraint_override'],
            constraints: [constraint.id],
          });
          
          const activeOverride = overrides.find(o => 
            !o.expiresAt || new Date(o.expiresAt) > new Date()
          );
          
          context.constraintViolations.push({
            constraint,
            violation,
            override: activeOverride,
            suggestion: activeOverride
              ? `Constraint "${constraint.description}" is overridden: ${activeOverride.reason}`
              : `This violates constraint: "${constraint.description}"`,
          });
        }
      }
    }
    
    // Get decision context for the areas being changed
    const areas = this.extractAreas(pr.changedFiles);
    for (const area of areas) {
      const decisions = await this.storage.search({
        types: ['decision_context'],
        topics: [area],
        limit: 3,
      });
      
      context.decisionContext.push(...decisions.map(d => ({
        decision: d,
        area,
        relevance: `This PR touches ${area}, which has documented decisions.`,
      })));
    }
    
    return context;
  }
  
  /**
   * Generate a PR review comment with memory context
   */
  generateReviewComment(context: PRReviewContext): string {
    const sections: string[] = [];
    
    if (context.tribalWarnings.length > 0) {
      sections.push('## ⚠️ Tribal Knowledge Warnings\n');
      sections.push(context.tribalWarnings.map(w => 
        `- **${w.file}**: ${w.warning.knowledge}`
      ).join('\n'));
    }
    
    if (context.relevantPatterns.length > 0) {
      sections.push('\n## 📋 Pattern Considerations\n');
      sections.push(context.relevantPatterns.map(p => 
        `- **${p.pattern.name}**: ${p.suggestion}`
      ).join('\n'));
    }
    
    if (context.constraintViolations.length > 0) {
      sections.push('\n## 🚫 Constraint Checks\n');
      sections.push(context.constraintViolations.map(c => 
        c.override
          ? `- ✅ **${c.constraint.description}** (overridden: ${c.override.reason})`
          : `- ❌ **${c.constraint.description}**: ${c.suggestion}`
      ).join('\n'));
    }
    
    if (context.decisionContext.length > 0) {
      sections.push('\n## 📝 Relevant Decisions\n');
      sections.push(context.decisionContext.map(d => 
        `- **${d.area}**: ${d.decision.decisionSummary}`
      ).join('\n'));
    }
    
    return sections.join('\n') || 'No relevant memory context found for this PR.';
  }
}
```

### 15.6 Temporal Memory Queries

**The Problem:** Memory systems only show current state, not how things evolved.

**The Innovation:** Query memories as they existed at any point in time.

```typescript
// packages/cortex/src/temporal/time-travel.ts

class TemporalMemoryQuery {
  /**
   * Query memories as they existed at a specific point in time
   * 
   * Use cases:
   * - "What did we know about auth before the security incident?"
   * - "What patterns existed before the big refactor?"
   * - "What tribal knowledge did we have 6 months ago?"
   */
  async queryAsOf(
    query: MemoryQuery,
    timestamp: string
  ): Promise<Memory[]> {
    // Use bitemporal storage to get memories as of timestamp
    const scopedStorage = this.storage.asOf(timestamp);
    return scopedStorage.search(query);
  }
  
  /**
   * Show how a memory evolved over time
   */
  async getMemoryHistory(memoryId: string): Promise<MemoryHistory> {
    const history: MemoryHistoryEntry[] = [];
    
    // Get all versions of this memory
    const versions = await this.storage.getVersions(memoryId);
    
    for (const version of versions) {
      history.push({
        timestamp: version.recordedAt,
        confidence: version.confidence,
        content: version.content,
        change: this.detectChange(version, versions),
      });
    }
    
    return {
      memoryId,
      currentVersion: versions[versions.length - 1],
      history,
      timeline: this.generateTimeline(history),
    };
  }
  
  /**
   * Compare memory state between two points in time
   */
  async compareTimepoints(
    t1: string,
    t2: string,
    query?: MemoryQuery
  ): Promise<MemoryComparison> {
    const memoriesT1 = await this.queryAsOf(query || {}, t1);
    const memoriesT2 = await this.queryAsOf(query || {}, t2);
    
    const added = memoriesT2.filter(m2 => 
      !memoriesT1.some(m1 => m1.id === m2.id)
    );
    
    const removed = memoriesT1.filter(m1 => 
      !memoriesT2.some(m2 => m2.id === m1.id)
    );
    
    const changed = memoriesT2.filter(m2 => {
      const m1 = memoriesT1.find(m => m.id === m2.id);
      return m1 && this.hasChanged(m1, m2);
    });
    
    return {
      t1,
      t2,
      added,
      removed,
      changed,
      summary: this.generateComparisonSummary(added, removed, changed),
    };
  }
}
```


---

## Part XVI: MCP Tools API Reference

Complete API for all memory-related MCP tools:

### 16.1 Core Memory Tools

```typescript
// drift_memory_status
{
  name: 'drift_memory_status',
  description: 'Get memory system health overview',
  parameters: {},
  returns: {
    counts: {
      total: number,
      byType: Record<MemoryType, number>,
      byConfidence: { high: number, medium: number, low: number, stale: number },
    },
    health: {
      avgConfidence: number,
      staleCount: number,
      pendingConsolidation: number,
      conflictCount: number,
      lastConsolidation: string,
      lastValidation: string,
    },
    recentMemories: MemorySummary[],
    recommendations: string[],
  }
}

// drift_memory_add
{
  name: 'drift_memory_add',
  description: 'Add a new memory to the system',
  parameters: {
    type: MemoryType,           // Required
    content: object,            // Type-specific content
    linkedPatterns?: string[],
    linkedFiles?: string[],
    linkedConstraints?: string[],
    importance?: Importance,
    tags?: string[],
  },
  returns: {
    id: string,
    created: boolean,
    linkedTo: string[],
    inferredCauses: CausalEdge[],  // Auto-inferred causal relationships
  }
}

// drift_memory_search
{
  name: 'drift_memory_search',
  description: 'Search memories with filters',
  parameters: {
    query?: string,              // Semantic search query
    types?: MemoryType[],
    minConfidence?: number,
    maxConfidence?: number,
    importance?: Importance[],
    tags?: string[],
    linkedPatterns?: string[],
    linkedFiles?: string[],
    limit?: number,
    offset?: number,
    orderBy?: 'relevance' | 'confidence' | 'recency' | 'access_count',
  },
  returns: {
    memories: CompressedMemory[],
    total: number,
    tokensUsed: number,
  }
}

// drift_memory_get
{
  name: 'drift_memory_get',
  description: 'Get a specific memory by ID with full details',
  parameters: {
    id: string,
    includeHistory?: boolean,
    includeCausalChain?: boolean,
  },
  returns: {
    memory: Memory,
    history?: MemoryHistoryEntry[],
    causalChain?: CausalChain,
    relatedMemories: MemorySummary[],
  }
}

// drift_memory_update
{
  name: 'drift_memory_update',
  description: 'Update an existing memory',
  parameters: {
    id: string,
    updates: Partial<Memory>,
    reason?: string,  // Why the update is being made
  },
  returns: {
    success: boolean,
    previousVersion: Memory,
    newVersion: Memory,
  }
}

// drift_memory_delete
{
  name: 'drift_memory_delete',
  description: 'Archive a memory (soft delete)',
  parameters: {
    id: string,
    reason: string,
  },
  returns: {
    success: boolean,
    archived: boolean,
  }
}
```

### 16.2 Retrieval Tools

```typescript
// drift_context (Enhanced)
{
  name: 'drift_context',
  description: 'Get curated context for a task - the primary interface',
  parameters: {
    intent: Intent,              // Required
    focus: string,               // Required
    activeFile?: string,
    recentFiles?: string[],
    maxTokens?: number,
    compressionLevel?: 0 | 1 | 2 | 3,
    includeMemories?: boolean,   // Default: true
    includePatterns?: boolean,   // Default: true
    includeWarnings?: boolean,   // Default: true
  },
  returns: {
    // From Drift core
    patterns: PatternContext[],
    constraints: ConstraintContext[],
    files: FileContext[],
    
    // From Cortex (NEW)
    memories: {
      core: CoreMemorySummary,
      tribal: TribalMemory[],
      procedural: ProceduralMemory[],
      patternRationales: PatternRationaleMemory[],
      antiPatterns: CodeSmellMemory[],
    },
    warnings: Warning[],
    
    // Metadata
    tokensUsed: number,
    retrievalTime: number,
    sessionContext: {
      alreadyLoaded: string[],
      newThisCall: string[],
    },
  }
}

// drift_why (The Killer Feature)
{
  name: 'drift_why',
  description: 'Get complete "why" context with causal chains',
  parameters: {
    intent: Intent,
    focus: string,
    depth?: 'summary' | 'detailed' | 'comprehensive',
    maxTokens?: number,
  },
  returns: {
    // Causal narrative (NEW)
    narrative: string,  // Human-readable explanation
    
    // Structured data
    causalChains: CausalChain[],
    patterns: {
      id: string,
      name: string,
      rationale: string,
      businessContext?: string,
      examples: string[],
    }[],
    decisions: {
      id: string,
      summary: string,
      businessContext: string,
      stillValid: boolean,
      madeBy?: string,
      madeAt?: string,
    }[],
    tribal: {
      topic: string,
      knowledge: string,
      severity: string,
      source: string,
    }[],
    warnings: Warning[],
    
    // Confidence
    overallConfidence: number,
    sourcesUsed: number,
  }
}

// drift_memory_for_context
{
  name: 'drift_memory_for_context',
  description: 'Get memories relevant to current context (integrates with drift_context)',
  parameters: {
    intent: Intent,
    focus: string,
    activeFile?: string,
    relevantPatterns?: string[],
    maxTokens?: number,
  },
  returns: {
    core: CoreMemorySummary,
    tribal: TribalMemory[],
    procedural: ProceduralMemory[],
    patternRationales: PatternRationaleMemory[],
    constraintOverrides: ConstraintOverrideMemory[],
    codeSmells: CodeSmellMemory[],
    warnings: Warning[],
    tokensUsed: number,
    memoriesIncluded: number,
    memoriesOmitted: number,
  }
}
```

### 16.3 Learning Tools

```typescript
// drift_memory_learn
{
  name: 'drift_memory_learn',
  description: 'Learn from a correction or feedback',
  parameters: {
    original: string,           // Original generated code
    feedback: string,           // User feedback
    correctedCode?: string,     // Corrected version (if provided)
    context: {
      file: string,
      intent: Intent,
      patterns: string[],
    },
  },
  returns: {
    learned: boolean,
    memoryCreated?: {
      id: string,
      type: MemoryType,
      summary: string,
    },
    category: CorrectionCategory,
    principle: string,
    confidence: number,
  }
}

// drift_memory_feedback
{
  name: 'drift_memory_feedback',
  description: 'Provide feedback on a memory',
  parameters: {
    memoryId: string,
    feedback: 'helpful' | 'not_helpful' | 'wrong' | 'outdated',
    details?: string,
  },
  returns: {
    processed: boolean,
    confidenceAdjustment: number,
    newConfidence: number,
  }
}

// drift_memory_validate
{
  name: 'drift_memory_validate',
  description: 'Validate memories against the codebase',
  parameters: {
    memoryIds?: string[],       // Specific memories, or all if omitted
    types?: MemoryType[],
    autoHeal?: boolean,
  },
  returns: {
    total: number,
    valid: number,
    stale: number,
    healed: number,
    flaggedForReview: number,
    details: ValidationDetail[],
  }
}
```

### 16.4 Consolidation Tools

```typescript
// drift_memory_consolidate
{
  name: 'drift_memory_consolidate',
  description: 'Run memory consolidation (sleep-inspired)',
  parameters: {
    force?: boolean,            // Run even if not enough episodes
    dryRun?: boolean,           // Preview without applying
  },
  returns: {
    episodesProcessed: number,
    memoriesCreated: number,
    memoriesUpdated: number,
    memoriesPruned: number,
    tokensFreed: number,
    duration: number,
    preview?: ConsolidationPreview,  // If dryRun
  }
}

// drift_memory_prune
{
  name: 'drift_memory_prune',
  description: 'Prune low-confidence and stale memories',
  parameters: {
    minConfidence?: number,     // Archive below this (default: 0.2)
    maxAge?: number,            // Days since last access (default: 180)
    dryRun?: boolean,
  },
  returns: {
    pruned: number,
    tokensFreed: number,
    preview?: Memory[],         // If dryRun
  }
}
```

### 16.5 Causal Graph Tools

```typescript
// drift_memory_explain
{
  name: 'drift_memory_explain',
  description: 'Get causal explanation for a memory',
  parameters: {
    memoryId: string,
    direction?: 'origins' | 'effects' | 'both',
    maxDepth?: number,
  },
  returns: {
    memory: Memory,
    causalChain: CausalChain,
    narrative: string,
    confidence: number,
  }
}

// drift_memory_conflicts
{
  name: 'drift_memory_conflicts',
  description: 'List and resolve memory conflicts',
  parameters: {
    action?: 'list' | 'resolve',
    conflictId?: string,        // For resolve action
    resolution?: 'newer_wins' | 'higher_confidence' | 'scope_specific' | 'manual',
    manualWinner?: string,      // Memory ID for manual resolution
  },
  returns: {
    conflicts: MemoryConflict[],
    resolved?: ConflictResolution,
  }
}

// drift_memory_graph
{
  name: 'drift_memory_graph',
  description: 'Query the causal memory graph',
  parameters: {
    action: 'traverse' | 'path' | 'subgraph',
    startNode?: string,
    endNode?: string,           // For path action
    relationTypes?: CausalRelation[],
    maxDepth?: number,
  },
  returns: {
    nodes: GraphNode[],
    edges: CausalEdge[],
    paths?: GraphPath[],        // For path action
  }
}
```

### 16.6 Export/Import Tools

```typescript
// drift_memory_export
{
  name: 'drift_memory_export',
  description: 'Export memories for backup or sharing',
  parameters: {
    format?: 'json' | 'markdown',
    types?: MemoryType[],
    minConfidence?: number,
    includeArchived?: boolean,
  },
  returns: {
    data: string,               // Exported data
    count: number,
    format: string,
  }
}

// drift_memory_import
{
  name: 'drift_memory_import',
  description: 'Import memories from export',
  parameters: {
    data: string,
    format?: 'json' | 'markdown',
    merge?: 'replace' | 'skip' | 'merge',  // How to handle conflicts
  },
  returns: {
    imported: number,
    skipped: number,
    merged: number,
    errors: string[],
  }
}
```

### 16.7 Health & Diagnostics Tools

```typescript
// drift_memory_health
{
  name: 'drift_memory_health',
  description: 'Get comprehensive health report',
  parameters: {},
  returns: {
    overallScore: number,       // 0-100
    metrics: HealthMetrics,
    issues: {
      staleMemories: Memory[],
      lowConfidence: Memory[],
      conflicts: MemoryConflict[],
      noFeedback: Memory[],
    },
    recommendations: string[],
  }
}

// drift_memory_stats
{
  name: 'drift_memory_stats',
  description: 'Get memory system statistics',
  parameters: {
    period?: '7d' | '30d' | '90d' | 'all',
  },
  returns: {
    counts: Record<MemoryType, number>,
    trends: {
      created: number[],
      accessed: number[],
      pruned: number[],
    },
    topMemories: {
      mostAccessed: MemorySummary[],
      mostHelpful: MemorySummary[],
      mostCited: MemorySummary[],
    },
    feedbackStats: {
      helpful: number,
      notHelpful: number,
      wrong: number,
    },
  }
}
```

---

## Part XVII: Data Schemas

### 17.1 Memory Types (Complete)

```typescript
// Base memory interface
interface BaseMemory {
  id: string;
  type: MemoryType;
  summary: string;
  confidence: number;
  importance: Importance;
  accessCount: number;
  lastAccessed?: string;
  transactionTime: TransactionTime;
  validTime: ValidTime;
  linkedPatterns?: string[];
  linkedConstraints?: string[];
  linkedFiles?: string[];
  linkedFunctions?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  archived?: boolean;
  archiveReason?: string;
  supersededBy?: string;
  supersedes?: string;
  feedbackHistory?: FeedbackEntry[];
  usageHistory?: UsageEntry[];
}

// Core Memory - Project identity (singleton)
interface CoreMemory extends BaseMemory {
  type: 'core';
  project: {
    name: string;
    description?: string;
    repository?: string;
    team?: string;
  };
  techStack?: {
    languages: string[];
    frameworks: string[];
    databases: string[];
    infrastructure: string[];
  };
  structure?: {
    keyDirectories: { path: string; purpose: string }[];
    entryPoints: string[];
  };
  conventions?: {
    naming?: string;
    fileOrganization?: string;
    testing?: string;
    documentation?: string;
  };
  contacts?: {
    role: string;
    name: string;
    expertise: string[];
  }[];
}

// Tribal Memory - Institutional knowledge
interface TribalMemory extends BaseMemory {
  type: 'tribal';
  topic: string;
  knowledge: string;
  severity: 'critical' | 'warning' | 'info';
  source: {
    type: 'human' | 'learned' | 'inferred';
    author?: string;
    learnedFrom?: string;
    originalInteraction?: string;
  };
  applicability?: {
    files?: string[];
    patterns?: string[];
    conditions?: string;
  };
  citations?: MemoryCitation[];
}

// Procedural Memory - How to do things
interface ProceduralMemory extends BaseMemory {
  type: 'procedural';
  name: string;
  trigger?: string;
  steps: {
    order: number;
    action: string;
    details?: string;
    codeExample?: string;
  }[];
  checklist?: {
    item: string;
    required: boolean;
  }[];
  prerequisites?: string[];
  outcomes?: string[];
}

// Semantic Memory - Consolidated knowledge
interface SemanticMemory extends BaseMemory {
  type: 'semantic';
  topic: string;
  knowledge: string;
  consolidatedFrom?: {
    episodicMemoryIds: string[];
    consolidationDate: string;
    consolidationMethod: 'automatic' | 'manual';
  };
  supportingEvidence: number;
  contradictingEvidence: number;
  lastReinforced?: string;
}

// Episodic Memory - Specific interactions
interface EpisodicMemory extends BaseMemory {
  type: 'episodic';
  context: {
    intent: Intent;
    focus: string;
    activeFile?: string;
    timestamp: string;
  };
  interaction: {
    userQuery: string;
    agentResponse: string;
    outcome: 'accepted' | 'modified' | 'rejected';
    feedback?: string;
  };
  memoriesUsed: string[];
  consolidationStatus: 'pending' | 'consolidated' | 'pruned';
}

// Pattern Rationale Memory
interface PatternRationaleMemory extends BaseMemory {
  type: 'pattern_rationale';
  patternId: string;
  patternName: string;
  rationale: string;
  businessContext?: string;
  alternatives?: {
    approach: string;
    whyNotChosen: string;
  }[];
  examples?: {
    file: string;
    line: number;
    description: string;
  }[];
}

// Constraint Override Memory
interface ConstraintOverrideMemory extends BaseMemory {
  type: 'constraint_override';
  constraintId: string;
  constraintName: string;
  reason: string;
  approvedBy?: string;
  approvedAt?: string;
  expiresAt?: string;
  scope?: {
    files?: string[];
    functions?: string[];
    conditions?: string;
  };
}

// Decision Context Memory
interface DecisionContextMemory extends BaseMemory {
  type: 'decision_context';
  decisionId: string;
  decisionSummary: string;
  businessContext: string;
  technicalContext?: string;
  alternatives?: {
    option: string;
    pros: string[];
    cons: string[];
    whyNotChosen: string;
  }[];
  stakeholders?: string[];
  stillValid: boolean;
  reviewDate?: string;
}

// Code Smell Memory (Anti-patterns)
interface CodeSmellMemory extends BaseMemory {
  type: 'code_smell';
  name: string;
  description: string;
  pattern?: string;  // Regex or AST pattern
  why: string;
  instead: string;
  severity: 'critical' | 'warning' | 'info';
  examples?: {
    bad: string;
    good: string;
  };
  occurrences?: number;
}

// Union type
type Memory =
  | CoreMemory
  | TribalMemory
  | ProceduralMemory
  | SemanticMemory
  | EpisodicMemory
  | PatternRationaleMemory
  | ConstraintOverrideMemory
  | DecisionContextMemory
  | CodeSmellMemory;
```

### 17.2 Causal Graph Schema

```typescript
interface CausalEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: CausalRelation;
  strength: number;  // 0.0 - 1.0
  evidence: string[];
  createdAt: string;
  validatedAt?: string;
}

type CausalRelation =
  | 'caused'        // A directly led to B
  | 'enabled'       // A made B possible
  | 'prevented'     // A stopped B from happening
  | 'contradicts'   // A conflicts with B
  | 'supersedes'    // A replaces B
  | 'supports'      // A provides evidence for B
  | 'derived_from'  // A was extracted from B
  | 'triggered_by'; // A happened because of event B

interface CausalChain {
  root: string;
  nodes: {
    id: string;
    type: MemoryType;
    summary: string;
    depth: number;
  }[];
  edges: CausalEdge[];
}

interface GraphPath {
  from: string;
  to: string;
  path: string[];
  relations: CausalRelation[];
  totalStrength: number;
}
```

### 17.3 Feedback & Learning Schema

```typescript
interface FeedbackEntry {
  signal: FeedbackSignal;
  timestamp: string;
  adjustment: number;
  context?: string;
}

interface UsageEntry {
  timestamp: string;
  outcome: 'accepted' | 'modified' | 'rejected';
  context: string;
}

interface ExtractedCorrection {
  original: string;
  corrected: string;
  reason: string;
  confidence: number;
  category: CorrectionCategory;
  principle: string;
  scope: string[];
}

type CorrectionCategory =
  | 'pattern_violation'
  | 'tribal_miss'
  | 'constraint_violation'
  | 'style_mismatch'
  | 'architecture_error'
  | 'security_issue'
  | 'performance_issue'
  | 'logic_error'
  | 'preference'
  | 'unknown';
```

---

## Part XVIII: Configuration Reference

### 18.1 Complete Configuration Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "cortex": {
      "type": "object",
      "properties": {
        
        "storage": {
          "type": "object",
          "properties": {
            "type": { "enum": ["sqlite", "postgresql"] },
            "path": { "type": "string" },
            "connectionString": { "type": "string" }
          }
        },
        
        "embeddings": {
          "type": "object",
          "properties": {
            "provider": { 
              "enum": ["voyage-code-3", "jina-code-v2", "nomic-embed-code", "local", "hybrid"] 
            },
            "apiKey": { "type": "string" },
            "fallback": { "type": "string" },
            "cacheEnabled": { "type": "boolean", "default": true },
            "contextualEmbeddings": { "type": "boolean", "default": true }
          }
        },
        
        "retrieval": {
          "type": "object",
          "properties": {
            "defaultLimit": { "type": "number", "default": 10 },
            "maxTokens": { "type": "number", "default": 2000 },
            "reranking": {
              "type": "object",
              "properties": {
                "enabled": { "type": "boolean", "default": true },
                "provider": { "enum": ["cohere-rerank-v4", "zerank-1", "bge-reranker"] },
                "candidateMultiplier": { "type": "number", "default": 5 }
              }
            },
            "sessionTracking": { "type": "boolean", "default": true },
            "predictiveRetrieval": { "type": "boolean", "default": true }
          }
        },
        
        "compression": {
          "type": "object",
          "properties": {
            "defaultLevel": { "type": "number", "enum": [0, 1, 2, 3], "default": 1 },
            "maxLevel": { "type": "number", "enum": [0, 1, 2, 3], "default": 3 },
            "llmLinguaEnabled": { "type": "boolean", "default": false }
          }
        },
        
        "causalGraph": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "default": true },
            "autoInference": { "type": "boolean", "default": true },
            "maxDepth": { "type": "number", "default": 5 },
            "minStrength": { "type": "number", "default": 0.5 }
          }
        },
        
        "learning": {
          "type": "object",
          "properties": {
            "correctionAnalysis": { "type": "boolean", "default": true },
            "antiPatternDetection": { "type": "boolean", "default": true },
            "confidenceCalibration": { "type": "boolean", "default": true },
            "activeValidation": { "type": "boolean", "default": true },
            "validationThreshold": { "type": "number", "default": 0.6 }
          }
        },
        
        "consolidation": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "default": true },
            "schedule": { "type": "string", "default": "0 3 * * *" },
            "minEpisodes": { "type": "number", "default": 5 },
            "maxEpisodeAge": { "type": "number", "default": 7 },
            "pruneAfterConsolidation": { "type": "boolean", "default": true }
          }
        },
        
        "validation": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "default": true },
            "schedule": { "type": "string", "default": "0 4 * * 0" },
            "autoHeal": { "type": "boolean", "default": true },
            "codeGrounded": { "type": "boolean", "default": true }
          }
        },
        
        "decay": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean", "default": true },
            "halfLives": {
              "type": "object",
              "properties": {
                "core": { "type": "number", "default": -1 },
                "tribal": { "type": "number", "default": 365 },
                "procedural": { "type": "number", "default": 180 },
                "semantic": { "type": "number", "default": 90 },
                "episodic": { "type": "number", "default": 7 }
              }
            }
          }
        },
        
        "feedback": {
          "type": "object",
          "properties": {
            "trackOutcomes": { "type": "boolean", "default": true },
            "autoDetectOutcomes": { "type": "boolean", "default": true },
            "contextGapDetection": { "type": "boolean", "default": true }
          }
        }
        
      }
    }
  }
}
```

### 18.2 Example Configurations

**Minimal (Local Development):**
```json
{
  "cortex": {
    "storage": { "type": "sqlite", "path": ".drift/cortex.db" },
    "embeddings": { "provider": "local" }
  }
}
```

**Production (Full Features):**
```json
{
  "cortex": {
    "storage": { "type": "sqlite", "path": ".drift/cortex.db" },
    "embeddings": {
      "provider": "voyage-code-3",
      "apiKey": "${VOYAGE_API_KEY}",
      "fallback": "jina-code-v2",
      "contextualEmbeddings": true
    },
    "retrieval": {
      "reranking": { "enabled": true, "provider": "cohere-rerank-v4" },
      "sessionTracking": true,
      "predictiveRetrieval": true
    },
    "causalGraph": { "enabled": true, "autoInference": true },
    "learning": {
      "correctionAnalysis": true,
      "antiPatternDetection": true,
      "activeValidation": true
    },
    "validation": { "codeGrounded": true }
  }
}
```

---

## Part XIX: Final Summary

### What We Built

Drift Cortex v2 is not just a memory system — it's an **intelligent coding partner** that:

1. **Remembers efficiently** — 15x token reduction through hierarchical compression
2. **Understands code** — voyage-code-3 embeddings, not generic text models
3. **Knows WHY** — Causal graphs trace decisions to their origins
4. **Learns from mistakes** — Extracts principles from corrections, not just stores them
5. **Validates against reality** — Checks memories against actual codebase
6. **Predicts needs** — Pre-loads context before you ask
7. **Explains itself** — Generated code includes traceable provenance
8. **Surfaces conflicts** — Shows contradictions instead of hiding them
9. **Improves over time** — Feedback loops strengthen useful memories

### The Competitive Moat

| Capability | Cortex v2 | Everyone Else |
|------------|-----------|---------------|
| Code-aware embeddings | ✅ voyage-code-3 | ❌ Generic text |
| Causal reasoning | ✅ GraphRAG | ❌ Flat retrieval |
| Pattern detection | ✅ 400+ detectors | ❌ None |
| Self-healing validation | ✅ Code-grounded | ❌ None |
| Intent-aware retrieval | ✅ 6 intents × 9 types | ❌ One-size-fits-all |
| Anti-pattern learning | ✅ Automatic | ❌ Manual |
| Temporal queries | ✅ Bitemporal | ❌ Current only |
| PR review integration | ✅ Memory-guided | ❌ None |

### The Promise

**No more "missing context" complaints.**
**No more bad code.**
**No more crying.**

The AI finally understands your codebase the way you do.

---

*Document Version: 2.0*
*Last Updated: January 2026*
*Status: Ready for Implementation*
