# Memory CLI Reference

The `drift memory` command provides full management of Cortex V2 memories from the command line.

---

## 🚫 Replacing AGENTS.md

Stop maintaining static `AGENTS.md` or `CLAUDE.md` files. They get stale immediately.

**Migrate in 2 minutes:**

```bash
# 1. Initialize
drift memory init

# 2. Add your key knowledge
drift memory add tribal "Always use bcrypt for passwords" --importance critical
drift memory add tribal "Services should not call controllers" --topic Architecture  
drift memory add tribal "All API routes need auth middleware" --topic Security
drift memory add procedural "Deploy: 1) Run tests 2) Build 3) Push to main"

# 3. Delete your AGENTS.md
rm AGENTS.md  # 🎉
```

**Why this is better:**
- Memories decay when unused (stale knowledge fades)
- AI learns from corrections automatically
- Intent-aware retrieval (not a static dump)
- Health monitoring tells you what's outdated

---

## Overview

```bash
drift memory <subcommand> [options]

Options:
  -f, --format <format>   Output format (text, json) (default: "text")
  -v, --verbose           Enable verbose output
```

## Memory Types

| Type | Icon | Description | Half-Life |
|------|------|-------------|-----------|
| `core` | 🏠 | Project identity and preferences | ∞ (never decays) |
| `tribal` | ⚠️ | Institutional knowledge, gotchas, warnings | 365 days |
| `procedural` | 📋 | How-to knowledge, step-by-step procedures | 180 days |
| `semantic` | 💡 | Consolidated knowledge from episodic memories | 90 days |
| `episodic` | 💭 | Interaction records, raw material for consolidation | 7 days |
| `pattern_rationale` | 🎯 | Why patterns exist in the codebase | 180 days |
| `constraint_override` | ✅ | Approved exceptions to constraints | 90 days |
| `decision_context` | 📝 | Human context for architectural decisions | 180 days |
| `code_smell` | 🚫 | Patterns to avoid, anti-patterns | 90 days |

---

## Commands

### `drift memory init`

Initialize the memory system for a project.

```bash
drift memory init
```

Creates:
- `.drift/memory/` directory
- `cortex.db` SQLite database
- Required tables and indexes

**Example:**
```bash
$ drift memory init

🧠 Initializing Memory System
══════════════════════════════════════════════════════════════

✓ Memory system initialized

Database: .drift/memory/cortex.db

────────────────────────────────────────────────────────────────
📌 Next Steps:
  • drift memory add tribal "..."   Add tribal knowledge
  • drift memory status             View memory statistics
  • drift memory import <file>      Import memories from file
```

---

### `drift memory status`

Show memory system status and health overview.

```bash
drift memory status
```

**Example:**
```bash
$ drift memory status

🧠 Memory System Status
══════════════════════════════════════════════════════════════

📊 Overview
──────────────────────────────────────────────────────────────
  Total Memories:      47
  Avg Confidence:      85%
  Low Confidence:      3
  Recently Accessed:   12 (last 7 days)
  Pending Consolidation: 5

📋 By Type
──────────────────────────────────────────────────────────────
  ⚠️ tribal               15 (365d half-life)
  📋 procedural           8 (180d half-life)
  💡 semantic             12 (90d half-life)
  🎯 pattern_rationale    7 (180d half-life)
  🚫 code_smell           5 (90d half-life)

💚 Health
──────────────────────────────────────────────────────────────
  Score: 85/100 (healthy)
```

---

### `drift memory add`

Add a new memory to the system.

```bash
drift memory add <type> <content> [options]

Options:
  -t, --topic <topic>         Topic or name for the memory
  -s, --severity <severity>   Severity level (info, warning, critical)
  -i, --importance <level>    Importance (low, normal, high, critical)
  --tags <tags>               Comma-separated tags
  --file <file>               Link to a file
  --pattern <pattern>         Link to a pattern ID
```

**Examples:**

```bash
# Add tribal knowledge
drift memory add tribal "Always use bcrypt for password hashing, never MD5" \
  --topic "Security" \
  --severity critical \
  --importance high

# Add a procedural memory
drift memory add procedural "To deploy: 1) Run tests 2) Build 3) Push to main" \
  --topic "Deployment Process"

# Add a code smell
drift memory add code_smell "Avoid using any type in TypeScript" \
  --topic "TypeScript" \
  --severity warning

# Add with file link
drift memory add tribal "This file handles all auth logic" \
  --file src/auth/index.ts
```

---

### `drift memory list`

List memories with optional filters.

```bash
drift memory list [options]

Options:
  -t, --type <type>           Filter by memory type
  -i, --importance <level>    Filter by importance
  -l, --limit <number>        Maximum results (default: 20)
  --min-confidence <number>   Minimum confidence threshold
```

**Examples:**

```bash
# List all memories
drift memory list

# List tribal knowledge only
drift memory list --type tribal

# List high-importance memories
drift memory list --importance high

# List with minimum confidence
drift memory list --min-confidence 0.8
```

---

### `drift memory show`

Show detailed information about a specific memory.

```bash
drift memory show <id>
```

**Example:**
```bash
$ drift memory show mem_abc123

⚠️ TRIBAL
══════════════════════════════════════════════════════════════

Details
──────────────────────────────────────────────────────────────
  ID:          mem_abc123_def456
  Type:        tribal
  Confidence:  95%
  Importance:  high
  Created:     1/15/2026, 2:30:00 PM
  Updated:     1/20/2026, 10:15:00 AM
  Accessed:    12 times

Summary
──────────────────────────────────────────────────────────────
  Always use bcrypt for password hashing

Knowledge
──────────────────────────────────────────────────────────────
  Topic:    Security
  Severity: critical
  Always use bcrypt for password hashing, never MD5 or SHA1.
  This was mandated after the 2024 security audit.

Tags
──────────────────────────────────────────────────────────────
  security, passwords, hashing

📉 Decay
──────────────────────────────────────────────────────────────
  Current Confidence: 95%
  Effective Confidence: 92%
  Age Factor: 98%
  Usage Factor: 105%
```

---

### `drift memory search`

Search memories by query.

```bash
drift memory search <query> [options]

Options:
  -t, --type <type>     Filter by memory type
  -l, --limit <number>  Maximum results (default: 20)
```

**Examples:**

```bash
# Search for authentication-related memories
drift memory search "authentication"

# Search within tribal knowledge
drift memory search "password" --type tribal
```

---

### `drift memory update`

Update an existing memory.

```bash
drift memory update <id> [options]

Options:
  -c, --confidence <number>   New confidence value (0-1)
  -i, --importance <level>    New importance level
  --tags <tags>               New comma-separated tags
  --summary <summary>         New summary
```

**Example:**
```bash
drift memory update mem_abc123 \
  --confidence 0.9 \
  --importance critical \
  --tags "security,critical,passwords"
```

---

### `drift memory delete`

Delete a memory (soft delete).

```bash
drift memory delete <id>
```

**Example:**
```bash
drift memory delete mem_abc123
```

---

### `drift memory learn`

Learn from a correction. Creates new memories based on the feedback.

```bash
drift memory learn [options]

Options:
  -o, --original <text>   Original code or response (required)
  -f, --feedback <text>   Feedback or correction (required)
  -c, --code <code>       Corrected code
  --file <file>           Related file
```

**Example:**
```bash
drift memory learn \
  --original "Use MD5 for hashing passwords" \
  --feedback "MD5 is insecure. Use bcrypt instead." \
  --code "const hash = await bcrypt.hash(password, 10);" \
  --file src/auth/password.ts
```

**Output:**
```
✓ Learned from correction

📝 Memories Created:
  mem_xyz789_abc123

💡 Extracted Principles:
  • Use bcrypt for password hashing instead of MD5

Category: security
```

---

### `drift memory feedback`

Provide feedback on a memory to adjust its confidence.

```bash
drift memory feedback <id> <action> [options]

Actions:
  confirm    Increase confidence (+10%)
  reject     Decrease confidence (-30%)
  modify     Slight decrease (-10%)

Options:
  -d, --details <text>   Additional details
```

**Examples:**

```bash
# Confirm a memory is accurate
drift memory feedback mem_abc123 confirm

# Reject an outdated memory
drift memory feedback mem_abc123 reject --details "This pattern is outdated"

# Mark as needing modification
drift memory feedback mem_abc123 modify
```

---

### `drift memory validate`

Validate memories and optionally heal issues.

```bash
drift memory validate [options]

Options:
  -s, --scope <scope>         Scope: all, stale, recent, high_importance
  --auto-heal                 Automatically heal minor issues (default: true)
  --remove-invalid            Remove memories that cannot be healed
  --min-confidence <number>   Minimum confidence to keep (default: 0.2)
```

**Example:**
```bash
$ drift memory validate --scope all

🔍 Validation Results
══════════════════════════════════════════════════════════════

📊 Summary
──────────────────────────────────────────────────────────────
  Total Validated: 47
  Valid:           42
  Stale:           3
  Healed:          2
  Duration:        156ms

🔧 Healing Stats
──────────────────────────────────────────────────────────────
  Summaries Fixed:     1
  Confidence Adjusted: 1
```

---

### `drift memory consolidate`

Consolidate episodic memories into semantic knowledge.

```bash
drift memory consolidate [options]

Options:
  --dry-run   Preview without making changes
```

**Example:**
```bash
$ drift memory consolidate

✓ Consolidation Complete
══════════════════════════════════════════════════════════════

📊 Results
──────────────────────────────────────────────────────────────
  Episodes Processed: 15
  Memories Created:   3
  Memories Updated:   2
  Memories Pruned:    8
  Tokens Freed:       2400
  Duration:           234ms
```

---

### `drift memory warnings`

Show active warnings from tribal knowledge and code smells.

```bash
drift memory warnings [options]

Options:
  --focus <focus>       Filter by focus area
  --severity <level>    Filter by severity (all, critical, warning)
```

**Example:**
```bash
$ drift memory warnings

⚠️  Active Warnings
══════════════════════════════════════════════════════════════

🚨 [CRITICAL] Security
   Always use bcrypt for password hashing, never MD5
   Confidence: 95%

⚠️ [WARNING] TypeScript
   Avoid using 'any' type - use proper typing
   Confidence: 88%

ℹ️ [INFO] Performance
   Consider pagination for lists over 100 items
   Confidence: 75%

Total: 3 warnings
```

---

### `drift memory why`

Get context for a task - patterns, decisions, tribal knowledge.

```bash
drift memory why <focus> [options]

Options:
  -i, --intent <intent>     Intent: add_feature, fix_bug, refactor, 
                            security_audit, understand_code, add_test
  --max-tokens <number>     Maximum tokens to use (default: 2000)
```

**Example:**
```bash
$ drift memory why "authentication"

🔍 Context for "authentication"
══════════════════════════════════════════════════════════════

Intent: understand_code | Tokens: 1847/2000 | Time: 45ms

⚠️ TRIBAL
────────────────────────────────────────────────────────────────
  mem_abc1... JWT tokens must be validated on every request
    Relevance: 92%
  mem_def2... Use bcrypt for password hashing
    Relevance: 88%

🎯 PATTERN_RATIONALE
────────────────────────────────────────────────────────────────
  mem_ghi3... Auth middleware pattern exists for stateless API
    Relevance: 85%
```

---

### `drift memory export`

Export memories to a JSON file.

```bash
drift memory export <output> [options]

Options:
  -t, --type <type>           Filter by memory type
  --min-confidence <number>   Minimum confidence threshold
  --include-archived          Include archived memories
```

**Example:**
```bash
# Export all memories
drift memory export memories.json

# Export only tribal knowledge
drift memory export tribal.json --type tribal

# Export high-confidence memories
drift memory export confident.json --min-confidence 0.8
```

---

### `drift memory import`

Import memories from a JSON file.

```bash
drift memory import <input> [options]

Options:
  --overwrite   Overwrite existing memories with same ID
```

**Example:**
```bash
# Import memories
drift memory import memories.json

# Import and overwrite existing
drift memory import memories.json --overwrite
```

---

### `drift memory health`

Get a comprehensive health report for the memory system.

```bash
drift memory health
```

**Example:**
```bash
$ drift memory health

🏥 Memory Health Report
══════════════════════════════════════════════════════════════

📊 Overall Health
──────────────────────────────────────────────────────────────
  Score: 85/100 (healthy)

📈 Statistics
──────────────────────────────────────────────────────────────
  Total Memories:      47
  Avg Confidence:      85%
  Low Confidence:      3
  Recently Accessed:   12

⚠️  Issues
──────────────────────────────────────────────────────────────
  ● 3 memories have low confidence
    → Review and validate these memories

💡 Recommendations
──────────────────────────────────────────────────────────────
  • Run `drift memory validate` to clean up low-confidence memories
  • Use `drift memory feedback` to confirm accurate memories
```

---

## JSON Output

All commands support `--format json` for programmatic use:

```bash
drift memory status --format json
```

```json
{
  "total": 47,
  "byType": {
    "tribal": 15,
    "procedural": 8,
    "semantic": 12,
    "pattern_rationale": 7,
    "code_smell": 5
  },
  "avgConfidence": 0.85,
  "lowConfidenceCount": 3,
  "recentlyAccessed": 12,
  "pendingConsolidation": 5,
  "healthScore": 85
}
```

---

## Typical Workflows

### Onboarding New Team Members
```bash
# Show what the team knows
drift memory list --type tribal --importance high

# Show active warnings
drift memory warnings

# Get context for a feature area
drift memory why "authentication"
```

### After Code Review
```bash
# Learn from reviewer feedback
drift memory learn \
  --original "Used string concatenation for SQL" \
  --feedback "Use parameterized queries to prevent SQL injection"

# Add tribal knowledge
drift memory add tribal "Always use parameterized queries" \
  --topic "Security" \
  --severity critical
```

### Regular Maintenance
```bash
# Check health
drift memory health

# Validate and heal
drift memory validate --scope stale --auto-heal

# Consolidate episodic memories
drift memory consolidate

# Export backup
drift memory export backup-$(date +%Y%m%d).json
```

---

## Related Documentation

- [Cortex V2 Overview](Cortex-V2-Overview)
- [Cortex Learning System](Cortex-Learning-System)
- [Cortex Token Efficiency](Cortex-Token-Efficiency)
- [MCP Tools Reference](MCP-Tools-Reference)
