# Drift Audit System Design

## Overview

The Audit System provides automated pattern validation, deduplication detection, cross-reference verification, and agent-assisted approval workflows. It reduces friction for users by intelligently recommending which patterns to approve while maintaining human oversight.

## Problem Statement

After running `drift scan`, users face several challenges:

1. **Manual Review Burden**: Hundreds of discovered patterns across 15 categories require manual review
2. **No Quality Signals**: Users can't easily distinguish high-confidence patterns from questionable ones
3. **Duplicate Detection**: Different detectors may find overlapping patterns
4. **Cross-Validation Gap**: No verification that patterns align with call graph and constraint data
5. **Agent Integration**: No streamlined way to leverage AI assistants for pattern review

## Goals

1. **Reduce Time-to-Value**: Auto-approve high-confidence patterns (≥90%) with user consent
2. **Surface Quality Issues**: Detect duplicates, false positives, and inconsistencies
3. **Enable Agent Assistance**: Provide clear workflow for AI-assisted pattern review
4. **Track Quality Over Time**: Compare audits to detect degradation
5. **Integrate with CI**: Fail builds when pattern quality drops below threshold

## Non-Goals

- Replacing human judgment for edge cases
- Auto-approving patterns without user consent
- Modifying the existing pattern detection logic

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  drift scan          │  drift audit         │  drift approve    │
│  (post-scan prompt)  │  (audit commands)    │  (--auto flag)    │
└──────────┬───────────┴──────────┬───────────┴────────┬──────────┘
           │                      │                    │
           ▼                      ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Core Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  AuditEngine         │  AuditStore          │  PatternService   │
│  - runAudit()        │  - saveAudit()       │  - approveMany()  │
│  - detectDuplicates()│  - loadAudit()       │  - getByConfidence│
│  - crossValidate()   │  - compareSnapshots()│                   │
│  - recommend()       │  - getDegradation()  │                   │
└──────────┬───────────┴──────────┬───────────┴───────────────────┘
           │                      │
           ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Storage Layer                               │
├─────────────────────────────────────────────────────────────────┤
│  .drift/audit/                                                   │
│  ├── latest.json           # Current audit state                 │
│  ├── snapshots/            # Historical audits                   │
│  │   └── YYYY-MM-DD.json                                        │
│  └── degradation.json      # Quality trends                      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
drift scan
    │
    ▼
Patterns discovered → .drift/patterns/discovered/
    │
    ▼
Post-scan prompt: "Would you like agent assistance?"
    │
    ├─► Yes → Show agent command
    │
    └─► No → Show manual options
    
drift audit
    │
    ▼
Load patterns, call graph, constraints
    │
    ▼
Run audit checks:
  1. Deduplication detection
  2. Cross-validation (patterns ↔ call graph)
  3. Confidence analysis
  4. Consistency checks
    │
    ▼
Generate recommendations:
  - auto-approve (≥90% confidence)
  - review (70-89% confidence)
  - likely-false-positive (<70% or flagged)
    │
    ▼
Save to .drift/audit/latest.json
    │
    ▼
Compare to previous audit → degradation.json
```

## Detailed Design

### 1. Audit Engine (`core/src/audit/`)

#### Types

```typescript
// audit/types.ts

export interface AuditResult {
  version: string;
  generatedAt: string;
  scanHash: string;
  
  summary: AuditSummary;
  patterns: PatternAuditResult[];
  duplicates: DuplicateGroup[];
  crossValidation: CrossValidationResult;
  degradation?: DegradationResult;
}

export interface AuditSummary {
  totalPatterns: number;
  autoApproveEligible: number;
  flaggedForReview: number;
  likelyFalsePositives: number;
  duplicateCandidates: number;
  healthScore: number;  // 0-100
}

export interface PatternAuditResult {
  id: string;
  name: string;
  category: PatternCategory;
  confidence: number;
  recommendation: 'auto-approve' | 'review' | 'likely-false-positive';
  reasons: string[];
  crossValidation?: {
    inCallGraph: boolean;
    matchesConstraints: boolean;
    hasTestCoverage: boolean;
  };
}

export interface DuplicateGroup {
  patterns: string[];  // Pattern IDs
  similarity: number;  // 0-1
  reason: string;
  recommendation: 'merge' | 'keep-both' | 'review';
}

export interface CrossValidationResult {
  patternsMatchingCallGraph: number;
  patternsNotInCallGraph: number;
  callGraphEntriesWithoutPatterns: number;
  constraintAlignment: number;  // 0-1
  issues: CrossValidationIssue[];
}

export interface CrossValidationIssue {
  type: 'orphan-pattern' | 'missing-pattern' | 'constraint-mismatch';
  patternId?: string;
  callGraphEntry?: string;
  constraintId?: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface DegradationResult {
  previousAuditDate: string;
  healthScoreDelta: number;
  confidenceDelta: number;
  newIssues: string[];
  resolvedIssues: string[];
  trend: 'improving' | 'stable' | 'declining';
}
```

#### Engine Implementation

```typescript
// audit/audit-engine.ts

export interface AuditEngineConfig {
  rootDir: string;
  autoApproveThreshold?: number;  // Default: 0.90
  reviewThreshold?: number;       // Default: 0.70
  duplicateSimilarityThreshold?: number;  // Default: 0.85
}

export class AuditEngine {
  constructor(config: AuditEngineConfig);
  
  /**
   * Run a full audit on discovered patterns
   */
  async runAudit(options?: AuditOptions): Promise<AuditResult>;
  
  /**
   * Detect duplicate patterns
   */
  async detectDuplicates(patterns: Pattern[]): Promise<DuplicateGroup[]>;
  
  /**
   * Cross-validate patterns against call graph and constraints
   */
  async crossValidate(patterns: Pattern[]): Promise<CrossValidationResult>;
  
  /**
   * Generate recommendations for each pattern
   */
  generateRecommendations(
    patterns: Pattern[],
    crossValidation: CrossValidationResult
  ): PatternAuditResult[];
  
  /**
   * Calculate health score
   */
  calculateHealthScore(
    patterns: Pattern[],
    crossValidation: CrossValidationResult,
    duplicates: DuplicateGroup[]
  ): number;
}
```

#### Health Score Formula

```
healthScore = (
  avgConfidence * 0.30 +           // Pattern confidence
  approvalRatio * 0.20 +           // Approved / Total
  (1 - outlierRatio) * 0.20 +      // Locations / (Locations + Outliers)
  crossValidationRate * 0.15 +     // Patterns matching call graph
  (1 - duplicateRatio) * 0.15      // Non-duplicate patterns
) * 100
```

### 2. Audit Store (`core/src/audit/`)

```typescript
// audit/audit-store.ts

export class AuditStore {
  constructor(config: { rootDir: string });
  
  /**
   * Save audit result
   */
  async saveAudit(result: AuditResult): Promise<void>;
  
  /**
   * Load latest audit
   */
  async loadLatest(): Promise<AuditResult | null>;
  
  /**
   * Load audit from specific date
   */
  async loadSnapshot(date: string): Promise<AuditResult | null>;
  
  /**
   * Compare two audits for degradation
   */
  compareAudits(current: AuditResult, previous: AuditResult): DegradationResult;
  
  /**
   * Get degradation trends
   */
  async getDegradationTrends(): Promise<DegradationTrend[]>;
  
  /**
   * Cleanup old snapshots (keep last N)
   */
  async cleanupSnapshots(keepCount?: number): Promise<void>;
}
```

### 3. CLI Commands

#### Enhanced `drift scan` (Post-Scan Prompt)

```typescript
// After scan completes successfully:

async function promptAgentAssistance(auditSummary: AuditSummary): Promise<void> {
  console.log();
  console.log(chalk.bold('📊 Scan Complete'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`  Patterns discovered: ${chalk.cyan(auditSummary.totalPatterns)}`);
  console.log(`  Auto-approve eligible: ${chalk.green(auditSummary.autoApproveEligible)} (≥90% confidence)`);
  console.log(`  Needs review: ${chalk.yellow(auditSummary.flaggedForReview)}`);
  console.log();
  
  const { useAgent } = await prompts({
    type: 'confirm',
    name: 'useAgent',
    message: 'Would you like an agent to help review and approve patterns?',
    initial: true,
  });
  
  if (useAgent) {
    console.log();
    console.log(chalk.bold('🤖 Agent Assistance'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('Copy this to your AI assistant:');
    console.log();
    console.log(chalk.cyan('┌─────────────────────────────────────────────────────────────┐'));
    console.log(chalk.cyan('│') + ' Run `drift audit --review` and approve high-confidence     ' + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' patterns that match codebase conventions. Flag any that    ' + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' look like false positives or duplicates.                   ' + chalk.cyan('│'));
    console.log(chalk.cyan('└─────────────────────────────────────────────────────────────┘'));
    console.log();
  } else {
    console.log();
    console.log(chalk.bold('📋 Manual Options'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`  ${chalk.cyan('drift approve --auto')}     Auto-approve ≥90% confidence patterns`);
    console.log(`  ${chalk.cyan('drift audit --interactive')} Interactive review mode`);
    console.log(`  ${chalk.cyan('drift audit --review')}     Generate review report`);
    console.log();
  }
}
```

#### New `drift audit` Command

```bash
drift audit [options]

Options:
  --review              Generate review report (for agent or human)
  --interactive         Interactive TUI for manual review
  --compare <date>      Compare to previous audit
  --ci                  CI mode - exit 1 if health below threshold
  --threshold <number>  Health score threshold for CI (default: 85)
  --format <format>     Output format: text, json, markdown
  --export <file>       Export audit to file

Subcommands:
  drift audit status    Show current audit status
  drift audit trends    Show quality trends over time
  drift audit fix       Apply recommended fixes (merge duplicates, etc.)
```

#### Enhanced `drift approve --auto`

```typescript
// approve.ts additions

interface ApproveOptions {
  // ... existing options
  auto?: boolean;           // Auto-approve ≥90% confidence
  threshold?: number;       // Custom threshold (default: 0.90)
  dryRun?: boolean;         // Show what would be approved
  categories?: string[];    // Limit to specific categories
}

async function autoApproveAction(options: ApproveOptions): Promise<void> {
  const threshold = options.threshold ?? 0.90;
  
  // Load discovered patterns
  const patterns = await service.listByStatus('discovered');
  
  // Filter by confidence
  const eligible = patterns.filter(p => p.confidence >= threshold);
  
  if (options.dryRun) {
    console.log(chalk.bold('Dry Run - Would approve:'));
    for (const p of eligible) {
      console.log(`  ${p.name} (${(p.confidence * 100).toFixed(0)}%)`);
    }
    return;
  }
  
  // Approve all eligible
  let approved = 0;
  for (const p of eligible) {
    await service.approve(p.id);
    approved++;
  }
  
  console.log(chalk.green(`✓ Auto-approved ${approved} patterns (≥${threshold * 100}% confidence)`));
}
```

### 4. Storage Format

#### `.drift/audit/latest.json`

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-28T15:30:00Z",
  "scanHash": "abc123def456",
  
  "summary": {
    "totalPatterns": 127,
    "autoApproveEligible": 89,
    "flaggedForReview": 28,
    "likelyFalsePositives": 10,
    "duplicateCandidates": 5,
    "healthScore": 87
  },
  
  "patterns": [
    {
      "id": "pattern-abc123",
      "name": "Express Route Handler",
      "category": "api",
      "confidence": 0.94,
      "recommendation": "auto-approve",
      "reasons": [
        "High confidence (94%)",
        "12 consistent locations",
        "Matches call graph entry points",
        "Aligns with auth constraint"
      ],
      "crossValidation": {
        "inCallGraph": true,
        "matchesConstraints": true,
        "hasTestCoverage": true
      }
    },
    {
      "id": "pattern-xyz789",
      "name": "Generic Try-Catch",
      "category": "errors",
      "confidence": 0.68,
      "recommendation": "likely-false-positive",
      "reasons": [
        "Below threshold (68%)",
        "High outlier ratio (12/18)",
        "No matching error handling constraint"
      ]
    }
  ],
  
  "duplicates": [
    {
      "patterns": ["pattern-abc", "pattern-def"],
      "similarity": 0.92,
      "reason": "Same file locations, different detector names",
      "recommendation": "merge"
    }
  ],
  
  "crossValidation": {
    "patternsMatchingCallGraph": 98,
    "patternsNotInCallGraph": 29,
    "callGraphEntriesWithoutPatterns": 15,
    "constraintAlignment": 0.85,
    "issues": [
      {
        "type": "orphan-pattern",
        "patternId": "pattern-orphan",
        "message": "Pattern has no matching call graph entry",
        "severity": "warning"
      }
    ]
  }
}
```

#### `.drift/audit/degradation.json`

```json
{
  "history": [
    {
      "date": "2026-01-28",
      "healthScore": 87,
      "avgConfidence": 0.84,
      "totalPatterns": 127,
      "approvedCount": 89
    },
    {
      "date": "2026-01-21",
      "healthScore": 91,
      "avgConfidence": 0.88,
      "totalPatterns": 115,
      "approvedCount": 82
    }
  ],
  
  "trends": {
    "healthTrend": "slight-decline",
    "confidenceTrend": "stable",
    "patternGrowth": "healthy"
  },
  
  "alerts": [
    {
      "type": "health-drop",
      "message": "Health score dropped 4 points since last week",
      "severity": "warning",
      "date": "2026-01-28"
    }
  ]
}
```

### 5. MCP Integration

#### New `drift_audit` Tool

```typescript
// mcp/src/tools/analysis/audit.ts

export const driftAuditTool = {
  name: 'drift_audit',
  description: 'Run audit on discovered patterns. Returns recommendations for approval, duplicates, and quality issues.',
  
  parameters: {
    action: {
      type: 'string',
      enum: ['status', 'run', 'approve-recommended'],
      description: 'Action to perform',
    },
    threshold: {
      type: 'number',
      description: 'Confidence threshold for auto-approve (default: 0.90)',
    },
  },
  
  async execute({ action, threshold }) {
    switch (action) {
      case 'status':
        return await getAuditStatus();
      case 'run':
        return await runAudit({ threshold });
      case 'approve-recommended':
        return await approveRecommended({ threshold });
    }
  },
};
```

### 6. CI Integration

#### GitHub Actions Example

```yaml
name: Drift Quality Gate

on: [push, pull_request]

jobs:
  drift-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install Drift
        run: npm install -g driftdetect
      
      - name: Run Drift Scan
        run: drift scan --incremental
      
      - name: Run Drift Audit
        run: drift audit --ci --threshold 85
        
      - name: Upload Audit Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: drift-audit
          path: .drift/audit/latest.json
```

## Implementation Plan

### Phase 1: Core Audit Engine ✅ COMPLETE

1. ✅ Created `core/src/audit/` module structure
2. ✅ Implemented `AuditEngine` class
   - `runAudit()` - main audit logic
   - `detectDuplicates()` - similarity detection
   - `crossValidate()` - pattern ↔ call graph validation
   - `generateRecommendations()` - recommendation logic
   - `calculateHealthScore()` - health formula
3. ✅ Implemented `AuditStore` class
   - Save/load audit results
   - Snapshot management
   - Degradation comparison
4. ✅ Added types and exports to `core/src/index.ts`

### Phase 2: CLI Integration ✅ COMPLETE

1. ✅ Created `cli/src/commands/audit.ts`
   - `drift audit` - run audit
   - `drift audit status` - show status
   - `drift audit trends` - show quality trends
   - `drift audit --review` - generate review report
   - `drift audit --ci` - CI mode with exit codes
   - `drift audit --export` - export to file
2. ✅ Enhanced `cli/src/commands/scan.ts`
   - Added post-scan prompt for agent assistance
   - Shows auto-approve eligible count
   - Displays agent instruction box
3. ✅ Enhanced `cli/src/commands/approve.ts`
   - Added `--auto` flag
   - Added `--threshold` option
   - Added `--dry-run` option

### Phase 3: MCP & CI Integration ✅ COMPLETE

1. ✅ Added `drift_audit` MCP tool
   - `handleAudit()` handler in `mcp/src/tools/analysis/audit.ts`
   - Tool definition with actions: status, run, approve-recommended, trends
   - Registered in `enterprise-server.ts`
   - Exported from `mcp/src/tools/analysis/index.ts`
2. ⬜ Update `drift_status` to include audit summary (future enhancement)
3. ✅ CI mode implemented with `--ci` flag and exit codes
4. ✅ CI examples in documentation

### Phase 4: Documentation & Testing (IN PROGRESS)

1. ✅ Added wiki page for Audit System (`wiki/Audit-System.md`)
2. ✅ Added to wiki sidebar
3. ⬜ Add unit tests for AuditEngine
4. ⬜ Add integration tests for CLI commands
5. ⬜ Update README with audit workflow

## Future Enhancements

### Unified AST Pass (Separate PR)

Refactor scanning to parse AST once per file and pass to all extractors:

```typescript
for (const file of files) {
  const ast = parseAST(file);
  
  // Run all extractors on same AST
  const patterns = patternDetectors.extract(ast, file);
  const functions = callGraphExtractor.extract(ast, file);
  const dataAccess = boundaryExtractor.extract(ast, file);
  
  // Stream write all results
  await Promise.all([
    patternStore.write(patterns),
    callGraphStore.writeShard(functions),
    boundaryStore.write(dataAccess),
  ]);
}
```

This is a larger refactor that improves performance but doesn't change user-facing behavior.

### Cloud Sync

Future integration with cloud dashboard for:
- Team-wide audit visibility
- Historical trend analysis
- Cross-project pattern sharing

## Open Questions

1. **Snapshot Retention**: How many audit snapshots to keep? Proposal: 30 days
2. **Duplicate Merging**: Should `drift audit fix` auto-merge duplicates or just recommend?
3. **Interactive Mode**: Full TUI or simple prompts? Start with prompts, add TUI later.

## References

- [History Store](../packages/core/src/store/history-store.ts) - Existing snapshot/trend infrastructure
- [Quality Gates](../packages/core/src/quality-gates/) - Existing gate system
- [Constraints](../packages/core/src/constraints/) - Constraint extraction/verification
- [Pattern Service](../packages/core/src/patterns/service.ts) - Pattern operations API
