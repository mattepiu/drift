---
inclusion: always
---

# Drift MCP Server - Frontier-Grade Optimization Guide

This steering file implements frontier-lab best practices for large MCP servers. Drift has 50+ tools - following these patterns achieves 85-98% token reduction and significantly improved accuracy.

## Critical First Principles

### 1. NEVER Load All Tools Upfront
Anthropic's research shows tool definitions can consume 50,000-150,000 tokens before work begins. Drift's `drift_capabilities` alone is 7,000+ tokens. Instead:
- Start with `drift_status` (~200 tokens) for health check
- Use `drift_context` to get curated, task-specific context
- Only call `drift_capabilities` if truly lost on which tool to use

### 2. Use Orchestration Tools as Meta-Tools
`drift_context` is a **meta-tool** - it retrieves and synthesizes from multiple sources:
- Relevant patterns with examples
- Files you'll likely need to modify
- Guidance on approach
- Warnings about potential issues

**One `drift_context` call replaces 3-5 discovery calls.**

### 3. Progressive Disclosure Pattern
Load tool knowledge incrementally:
```
Level 1: drift_status (health overview, ~200 tokens)
Level 2: drift_context (curated context for task, ~1000-3000 tokens)
Level 3: drift_code_examples (only if need more examples)
Level 4: drift_pattern_get (only for specific pattern deep-dive)
```

## Quick Reference: Tool Selection Decision Tree

| Intent | First Tool | Then If Needed |
|--------|-----------|----------------|
| Starting any task | `drift_context` | `drift_code_examples` |
| Quick status check | `drift_status` | - |
| Find patterns | `drift_patterns_list` (with filters!) | `drift_pattern_get` |
| Write new code | `drift_context` | `drift_validate_change` |
| Understand code | `drift_explain` | `drift_callers` |
| Who calls X? | `drift_callers` | NOT `drift_impact_analysis` |
| Security review | `drift_security_summary` | `drift_reachability` |
| Before starting work | `drift_why` | (memory context) |

## Token-Efficient Patterns (Anthropic Best Practices)

### Pattern 1: Surgical Lookups (Lowest Token Cost)
For quick Q&A, use single-purpose tools:

| Question | Tool | Example |
|----------|------|---------|
| Who calls this function? | `drift_callers` | `function: "handleSubmit"` |
| What's the function signature? | `drift_signature` | `symbol: "createUser"` |
| What type is this? | `drift_type` | `type: "UserDTO"` |
| How do I import X? | `drift_imports` | `symbols: ["useState"], targetFile: "src/App.tsx"` |
| What changed recently? | `drift_recent` | `area: "src/api/"` |
| Is this package installed? | `drift_dependencies` | `search: "lodash"` |

### Pattern 2: Filter Aggressively
Always use filters to reduce response size:

```typescript
// BAD: Returns everything
drift_patterns_list

// GOOD: Returns only what you need
drift_patterns_list categories=["api","auth"] status="approved" minConfidence=0.8 limit=10
```

### Pattern 3: Pagination for Large Results
Start small, request more only if needed:

```typescript
// First call
drift_patterns_list limit=10

// Only if you need more
drift_patterns_list limit=10 cursor="<cursor_from_previous>"
```

### Pattern 4: Check Token Estimates
Every response includes `meta.tokenEstimate`. Use it to gauge if you're being efficient:
- < 500 tokens: Surgical lookup ✓
- 500-2000 tokens: Normal operation ✓
- 2000-5000 tokens: Consider if necessary
- > 5000 tokens: Probably doing something wrong

## Tool Layers (Ordered by Token Efficiency)

### Layer 1: Orchestration (Start Here) - Medium tokens, HIGH value
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `drift_context` | Curated context for any task | ALWAYS start here for code generation |
| `drift_package_context` | Monorepo package-specific | Working in specific package |

### Layer 2: Discovery (Quick Status) - LOW tokens
| Tool | Purpose | Token Cost |
|------|---------|------------|
| `drift_status` | Health snapshot | ~200 |
| `drift_projects` | Project management | ~300 |

### Layer 3: Surgical (Precision Lookups) - LOW tokens
| Tool | Purpose | Token Cost |
|------|---------|------------|
| `drift_signature` | Function/class signature | ~100-300 |
| `drift_callers` | Who calls this function | ~200-500 |
| `drift_imports` | Resolve import statements | ~100-200 |
| `drift_type` | Expand type definitions | ~200-500 |
| `drift_prevalidate` | Validate code before writing | ~300-800 |
| `drift_similar` | Find similar code | ~500-1500 |
| `drift_recent` | Recent changes in area | ~300-600 |
| `drift_dependencies` | Check installed packages | ~200-400 |

### Layer 4: Exploration (Browse/Filter) - MEDIUM tokens
| Tool | Purpose | Token Cost |
|------|---------|------------|
| `drift_patterns_list` | List patterns (use filters!) | ~500-1500 |
| `drift_files_list` | List files with patterns | ~500-1500 |
| `drift_security_summary` | Security posture overview | ~800-2000 |
| `drift_contracts_list` | API contracts | ~500-1500 |

### Layer 5: Detail (Deep Inspection) - HIGH tokens
| Tool | Purpose | Token Cost |
|------|---------|------------|
| `drift_pattern_get` | Full pattern details | ~1000-3000 |
| `drift_file_patterns` | All patterns in file | ~1000-2500 |
| `drift_code_examples` | Real code snippets | ~2000-5000 |
| `drift_impact_analysis` | Change blast radius | ~1000-3000 |
| `drift_explain` | Comprehensive explanation | ~2000-5000 |

### Layer 6: Analysis - MEDIUM-HIGH tokens
| Tool | Purpose | Token Cost |
|------|---------|------------|
| `drift_test_topology` | Test coverage analysis | ~1000-2500 |
| `drift_coupling` | Module dependencies | ~1000-2500 |
| `drift_error_handling` | Error handling gaps | ~800-2000 |
| `drift_quality_gate` | Quality checks | ~1500-4000 |

### Layer 7: Memory (Cortex V2) - LOW-MEDIUM tokens
| Tool | Purpose | Token Cost |
|------|---------|------------|
| `drift_memory_status` | Memory system health | ~100-200 |
| `drift_why` | Context from memories | ~500-1500 |
| `drift_memory_search` | Search memories | ~300-800 |
| `drift_memory_add` | Store knowledge | ~100-200 |
| `drift_memory_learn` | Learn from corrections | ~100-200 |

## Workflow Examples (Optimized)

### Adding a Feature (5-tool max)
```
1. drift_why focus="<feature area>"           # Check for relevant memories
2. drift_context intent="add_feature" focus="<feature>"  # Get patterns + files
3. [Write code following patterns]
4. drift_prevalidate code="..." targetFile="..."  # Quick validation
5. drift_validate_change file="..." content="..."  # Final check
```

### Fixing a Bug (4-tool max)
```
1. drift_context intent="fix_bug" focus="<area>"
2. drift_callers function="<buggy_function>"  # Understand usage
3. [Fix the issue]
4. drift_validate_change
```

### Security Review (3-tool sequence)
```
1. drift_security_summary
2. drift_reachability target="<sensitive_data>" direction="inverse"
3. drift_error_handling action="gaps" minSeverity="high"
```

### Understanding Unfamiliar Code (2-tool max)
```
1. drift_explain target="<file_or_function>" depth="comprehensive"
2. drift_callers function="<key_function>" (only if needed)
```

## Common Mistakes to Avoid

### ❌ DON'T: Call drift_capabilities repeatedly
It's 7,000+ tokens. Call it ONCE if truly lost, then use the decision tree above.

### ❌ DON'T: Use drift_impact_analysis for "who calls X"
Use `drift_callers` instead - it's 5x faster and lower tokens.

### ❌ DON'T: Skip drift_context and go straight to drift_code_examples
You need pattern context first. `drift_context` provides the IDs you need.

### ❌ DON'T: Guess file paths
Use `drift_files_list` with a path pattern to find them.

### ❌ DON'T: Request unlimited results
Always use `limit` parameter. Start with 10, increase only if needed.

### ❌ DON'T: Ignore the memory system
`drift_why` can save you from repeating past mistakes. Use it.

## Project Switching

When working across multiple projects:
```
1. drift_projects action="list"              # See available projects
2. drift_projects action="switch" project="<name>"  # Switch (cache auto-invalidates)
3. drift_status                              # Verify new project context
```

## Memory System Best Practices

The Cortex memory system stores institutional knowledge that persists across sessions:

### When to Use Memory
- **Before starting work**: `drift_why focus="<task_area>"` - get relevant context
- **After learning something**: `drift_memory_add` - store for future
- **After a correction**: `drift_memory_learn` - teach the system

### Memory Types
- **Tribal knowledge**: "Always use bcrypt with 10 salt rounds"
- **Procedures**: "Deploy: 1. Run tests 2. Build 3. Push"
- **Corrections**: AI learns from mistakes
- **Patterns**: Codebase-specific conventions

## Response Size Management

If responses are too large:
1. Add/tighten `limit` parameter
2. Add category/status/confidence filters
3. Use `cursor` for pagination
4. Check `meta.tokenEstimate` - aim for < 2000 tokens per call

## Natural Language Memory Triggers

When users say things like:
- "Remember that..." / "Remember this..."
- "Store this for later..."
- "Don't forget that we..."
- "Always do X when Y..."
- "We handle X by doing Y..."
- "Our convention is..."
- "Make a note that..."

**Automatically call `drift_memory_add`** with:
- `content`: What they want remembered
- `type`: "tribal_knowledge" (conventions), "procedure" (how-to), or "pattern" (code patterns)
- `tags`: Relevant keywords like ["auth", "database", "api"]

Example:
```
User: "Remember that we always use bcrypt with 12 salt rounds for passwords"

→ drift_memory_add content="Always use bcrypt with 12 salt rounds for passwords" type="tribal_knowledge" tags=["auth", "security", "passwords"]
```

When users say:
- "What do you know about X?"
- "What did I tell you about X?"
- "How do we handle X?"

**Automatically call `drift_why`** or `drift_memory_search` to retrieve relevant memories.

## Error Recovery

If a tool fails, check `error.recovery.suggestion`:

| Error | Solution |
|-------|----------|
| Project not initialized | Run `drift setup` |
| No patterns found | Run `drift scan` |
| Call graph missing | Run `drift callgraph build` |
| Memory not initialized | Run `drift memory init` |

## Advanced: Dynamic Tool Loading Pattern

For complex multi-step workflows, use this pattern to minimize token usage:

```
1. drift_status                    # Lightweight health check
2. drift_why focus="<task>"        # Memory context (if relevant)
3. drift_context intent="..." focus="..."  # Load only needed context
4. [Execute task with surgical tools as needed]
5. drift_validate_change           # Verify result
```

This achieves the "progressive disclosure" pattern recommended by Anthropic's research - loading tool knowledge incrementally rather than all upfront.

## Token Budget Guidelines

For a typical coding task, aim for:
- **Total tool calls**: 3-6
- **Total tokens from tools**: < 10,000
- **Largest single response**: < 5,000 tokens

If you're exceeding these, you're probably:
- Not using filters
- Calling heavy tools unnecessarily
- Not leveraging orchestration tools

---

*This guide implements patterns from Anthropic's "Advanced Tool Use" (2025) and "Code Execution with MCP" research, adapted for Drift's 50+ tool architecture.*
