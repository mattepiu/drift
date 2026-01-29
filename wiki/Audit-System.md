# Audit System

The Audit System automates pattern validation, deduplication detection, and approval workflows. It reduces manual review burden by intelligently recommending which patterns to approve while maintaining human oversight.

## Quick Start

```bash
# Run a scan first
drift scan

# Run audit to analyze patterns
drift audit

# Auto-approve high-confidence patterns (≥90%)
drift approve --auto

# Or use MCP tool
drift_audit action="run"
```

## CLI Commands

### `drift audit`

Run a full audit on discovered patterns.

```bash
drift audit [options]

Options:
  --review              Generate review report for agent or human
  --ci                  CI mode - exit 1 if health below threshold
  --threshold <number>  Health score threshold for CI (default: 85)
  --export <file>       Export audit to file
```

### `drift audit status`

Show current audit status and health score.

```bash
drift audit status
```

Output:
```
📊 Audit Status
───────────────────────────────────────────────
  Health Score: 87/100 ✅
  Total Patterns: 127
  Auto-approve eligible: 89 (≥90% confidence)
  Needs review: 28
  Likely false positives: 10
  Duplicate candidates: 5
  Last audit: 2 hours ago
```

### `drift audit trends`

Show quality trends over time.

```bash
drift audit trends
```

### `drift approve --auto`

Auto-approve patterns meeting the confidence threshold.

```bash
drift approve --auto [options]

Options:
  --threshold <number>  Confidence threshold (default: 0.90)
  --dry-run             Show what would be approved without approving
  --categories <list>   Limit to specific categories
```

## MCP Tool

### `drift_audit`

```typescript
// Check audit status
drift_audit action="status"

// Run full audit
drift_audit action="run"

// Auto-approve recommended patterns
drift_audit action="approve-recommended" threshold=0.90

// View quality trends
drift_audit action="trends"
```

### Actions

| Action | Description |
|--------|-------------|
| `status` | Show current audit status (health score, eligible patterns) |
| `run` | Run a full audit on discovered patterns |
| `approve-recommended` | Auto-approve patterns with ≥90% confidence |
| `trends` | Show quality trends over time |

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `action` | string | required | Action to perform |
| `threshold` | number | 0.90 | Confidence threshold for auto-approve |
| `compareToPrevious` | boolean | true | Compare to previous audit for degradation detection |
| `categories` | string[] | all | Categories to audit |

## Health Score

The health score (0-100) is calculated from:

| Factor | Weight | Description |
|--------|--------|-------------|
| Average Confidence | 30% | Mean confidence across all patterns |
| Approval Ratio | 20% | Approved patterns / Total patterns |
| Compliance Rate | 20% | Locations / (Locations + Outliers) |
| Cross-Validation | 15% | Patterns matching call graph |
| Duplicate-Free | 15% | Non-duplicate patterns |

### Score Interpretation

- **85-100**: Excellent - patterns are well-validated
- **70-84**: Good - some patterns need review
- **50-69**: Fair - significant review needed
- **0-49**: Poor - many issues detected

## Recommendations

The audit generates recommendations for each pattern:

| Recommendation | Confidence | Action |
|----------------|------------|--------|
| `auto-approve` | ≥90% | Safe to approve automatically |
| `review` | 70-89% | Needs human review |
| `likely-false-positive` | <70% | Probably not a real pattern |

## Duplicate Detection

The audit detects duplicate patterns that may have been found by different detectors:

```json
{
  "duplicates": [
    {
      "patterns": ["pattern-abc", "pattern-def"],
      "similarity": 0.92,
      "reason": "Same file locations, different detector names",
      "recommendation": "merge"
    }
  ]
}
```

## Cross-Validation

Patterns are validated against:

1. **Call Graph**: Does the pattern appear in the call graph?
2. **Constraints**: Does it align with architectural constraints?
3. **Test Coverage**: Is the pattern covered by tests?

## CI Integration

### GitHub Actions

```yaml
name: Drift Quality Gate

on: [push, pull_request]

jobs:
  drift-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Drift
        run: npm install -g driftdetect
      
      - name: Run Drift Scan
        run: drift scan --incremental
      
      - name: Run Drift Audit
        run: drift audit --ci --threshold 85
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Health score meets threshold |
| 1 | Health score below threshold |

## Storage

Audit data is stored in `.drift/audit/`:

```
.drift/audit/
├── latest.json           # Current audit state
├── snapshots/            # Historical audits
│   └── YYYY-MM-DD.json
└── degradation.json      # Quality trends
```

## Agent-Assisted Workflow

After running `drift scan`, you'll see a prompt:

```
📊 Scan Complete
──────────────────────────────────────────────────
  Patterns discovered: 127
  Auto-approve eligible: 89 (≥90% confidence)
  Needs review: 28

? Would you like an agent to help review and approve patterns? (Y/n)
```

If you select yes, you'll get instructions to copy to your AI assistant:

```
┌─────────────────────────────────────────────────────────────┐
│ Run `drift audit --review` and approve high-confidence     │
│ patterns that match codebase conventions. Flag any that    │
│ look like false positives or duplicates.                   │
└─────────────────────────────────────────────────────────────┘
```

## Related Tools

- [[drift_patterns_list]] - List all patterns
- [[drift_quality_gate]] - Run quality gates on changes
- [[drift_constraints]] - Manage architectural constraints
- [[drift_status]] - Get codebase health overview
