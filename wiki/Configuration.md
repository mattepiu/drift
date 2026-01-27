# Configuration

Customize Drift for your project.

## Configuration File

Drift stores configuration in `.drift/config.json`:

```json
{
  "version": "2.0.0",
  "project": {
    "name": "my-project",
    "language": "typescript"
  },
  "scan": {
    "include": ["src/**/*"],
    "exclude": ["**/*.test.ts", "**/__tests__/**"],
    "timeout": 300000
  },
  "patterns": {
    "minConfidence": 0.7
  },
  "learning": {
    "autoApproveThreshold": 0.95,
    "minOccurrences": 3
  },
  "callgraph": {
    "maxDepth": 10,
    "includeTests": false
  }
}
```

---

## Configuration Options

### Project Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `project.name` | string | folder name | Project identifier |
| `project.language` | string | auto-detect | Primary language |

### Scan Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scan.include` | array | `["**/*"]` | Glob patterns to include |
| `scan.exclude` | array | `[]` | Glob patterns to exclude |
| `scan.timeout` | number | `300000` | Scan timeout in ms |
| `scan.incremental` | boolean | `true` | Enable incremental scanning |
| `scan.parallel` | number | CPU cores | Parallel workers |

### Pattern Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `patterns.minConfidence` | number | `0.5` | Minimum confidence to report |
| `patterns.autoApprove` | boolean | `false` | Auto-approve high-confidence patterns |
| `patterns.categories` | array | all | Categories to detect |

### Learning Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `learning.autoApproveThreshold` | number | `0.95` | Auto-approve patterns above this confidence (0-1) |
| `learning.minOccurrences` | number | `3` | Minimum occurrences before pattern is detected |

**Note:** `learning.autoApproveThreshold` is the recommended way to auto-approve patterns. Set to `1.0` to disable auto-approval, or lower (e.g., `0.8`) to be more permissive. The older `patterns.autoApprove: true` enables auto-approval at the `minConfidence` threshold.

### Call Graph Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `callgraph.maxDepth` | number | `10` | Max traversal depth |
| `callgraph.includeTests` | boolean | `false` | Include test files |
| `callgraph.includeNodeModules` | boolean | `false` | Include dependencies |

### Boundary Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `boundaries.enabled` | boolean | `true` | Enable boundary scanning |
| `boundaries.sensitiveFields` | array | built-in | Additional sensitive field names |
| `boundaries.rules` | object | `{}` | Custom boundary rules |

---

## .driftignore

Exclude files from scanning (same syntax as `.gitignore`):

```gitignore
# Dependencies
node_modules/
vendor/
.venv/

# Build output
dist/
build/
out/

# Test files (optional)
*.test.ts
*.spec.ts
__tests__/

# Generated files
*.generated.ts
*.d.ts

# IDE
.idea/
.vscode/

# Git
.git/
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DRIFT_CONFIG` | Path to config file |
| `DRIFT_CACHE_DIR` | Cache directory |
| `DRIFT_LOG_LEVEL` | Log level: debug, info, warn, error |
| `DRIFT_NO_COLOR` | Disable colored output |
| `DRIFT_PARALLEL` | Number of parallel workers |

---

## Per-Project Configuration

### Multiple Projects

Register multiple projects:

```bash
drift projects add ~/code/backend --name backend
drift projects add ~/code/frontend --name frontend
```

Each project has its own `.drift/` directory and configuration.

### Switching Projects

```bash
drift projects switch backend
drift status  # Shows backend status
```

---

## CI Configuration

### GitHub Actions

```yaml
- name: Drift Check
  run: |
    npm install -g driftdetect
    drift init --yes
    drift scan
    drift check --ci --fail-on warning --format github
```

### GitLab CI

```yaml
drift:
  script:
    - npm install -g driftdetect
    - drift init --yes
    - drift scan
    - drift check --ci --fail-on warning --format gitlab
```

### Pre-commit Hook

```bash
# .husky/pre-commit
drift check --staged --fail-on error
```

---

## MCP Server Configuration

### Rate Limiting

```json
{
  "mcp": {
    "rateLimit": {
      "global": 100,
      "expensive": 10
    }
  }
}
```

### Caching

```json
{
  "mcp": {
    "cache": {
      "enabled": true,
      "ttl": 300000,
      "maxSize": 100
    }
  }
}
```

---

## Sensitive Data Configuration

### Custom Sensitive Fields

```json
{
  "boundaries": {
    "sensitiveFields": [
      "ssn",
      "social_security",
      "tax_id",
      "bank_account"
    ]
  }
}
```

### Sensitivity Categories

```json
{
  "boundaries": {
    "categories": {
      "pii": ["email", "phone", "address"],
      "financial": ["credit_card", "bank_account"],
      "health": ["diagnosis", "prescription"],
      "credentials": ["password", "api_key", "token"]
    }
  }
}
```

---

## Resetting Configuration

```bash
# Reset to defaults
rm -rf .drift
drift init

# Keep patterns, reset config
rm .drift/config.json
drift init --keep-patterns
```
