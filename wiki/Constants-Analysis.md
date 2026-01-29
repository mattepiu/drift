# Constants Analysis

Drift analyzes constants, enums, and exported values in your codebase to find hardcoded secrets, magic numbers, and inconsistencies.

## Overview

Constants analysis helps you:

- **Find hardcoded secrets** — API keys, passwords in code
- **Detect magic numbers** — Unexplained numeric values
- **Find dead constants** — Unused exported values
- **Spot inconsistencies** — Same constant with different values

---

## Quick Start

```bash
# Show overview
drift constants

# List all constants
drift constants list

# Find hardcoded secrets
drift constants secrets

# Find constants with inconsistent values
drift constants inconsistent

# Find potentially unused constants
drift constants dead
```

---

## Constants Overview

```bash
drift constants
```

**Output:**
```
Constants Analysis
═════════════════════════════════════════════════════════════════

Total Constants: 234

By Category:
  config:       45 (19%)
  api:          38 (16%)
  status:       32 (14%)
  error:        28 (12%)
  feature_flag: 24 (10%)
  limit:        18 (8%)
  regex:        15 (6%)
  path:         12 (5%)
  env:          10 (4%)
  security:     8 (3%)
  uncategorized: 4 (2%)

Issues Found:
  🔴 Potential secrets:     3
  🟡 Magic numbers:         12
  🟡 Inconsistent values:   2
  ⚪ Unused constants:      8

Run 'drift constants secrets' to see potential secrets.
```

---

## Finding Hardcoded Secrets

```bash
drift constants secrets
```

**Output:**
```
🔴 Potential Hardcoded Secrets
═════════════════════════════════════════════════════════════════

⚠️  These constants may contain sensitive data that should be
    moved to environment variables or a secrets manager.

CRITICAL:
  src/config/api.ts:15
    const API_KEY = 'sk_live_EXAMPLE_KEY_REPLACE_ME';
    Reason: Matches API key pattern
    Suggestion: Use process.env.API_KEY

  src/services/stripe.ts:8
    const STRIPE_KEY = 'sk_test_EXAMPLE_KEY_REPLACE_ME';
    Reason: Stripe secret key format
    Suggestion: Use process.env.STRIPE_SECRET_KEY

HIGH:
  src/auth/jwt.ts:12
    const JWT_SECRET = 'my-super-secret-key-123';
    Reason: Contains 'secret' in name
    Suggestion: Use process.env.JWT_SECRET

  src/db/config.ts:5
    const DB_PASSWORD = 'admin123';
    Reason: Contains 'password' in name
    Suggestion: Use process.env.DB_PASSWORD

Found 3 critical and 1 high severity issues.
```

### Filter by Severity

```bash
# Only critical
drift constants secrets --severity critical

# High and above
drift constants secrets --severity high
```

---

## Finding Magic Numbers

> **Note:** Magic number detection is done through the `drift constants list` command with search filters. Look for numeric constants that should be named.

```bash
drift constants list --search "MAX_"
```

To find unexplained numeric literals, look for constants that should be named:

**Example patterns to look for:**
```typescript
// Bad - magic number
const results = items.slice(0, 50);

// Good - named constant
const DEFAULT_PAGE_SIZE = 50;
const results = items.slice(0, DEFAULT_PAGE_SIZE);
```

---

## Finding Dead Constants

```bash
drift constants dead
```

**Output:**
```
💀 Unused Constants
═════════════════════════════════════════════════════════════════

These exported constants are never imported anywhere in the codebase.
Consider removing them to reduce dead code.

src/constants/errors.ts:
  export const LEGACY_ERROR_CODE = 'E001';  // Never imported
  export const OLD_STATUS = 'deprecated';    // Never imported

src/config/features.ts:
  export const FEATURE_OLD_UI = false;       // Never imported
  export const ENABLE_LEGACY_API = false;    // Never imported

src/utils/constants.ts:
  export const UNUSED_REGEX = /old-pattern/; // Never imported
  export const TEMP_VALUE = 'remove-me';     // Never imported

Found 8 unused constants.
Potential dead code: ~45 lines
```

---

## Finding Inconsistencies

```bash
drift constants inconsistent
```

**Output:**
```
⚠️  Inconsistent Constants
═════════════════════════════════════════════════════════════════

These constants have the same name but different values in
different files. This may indicate a bug or copy-paste error.

MAX_RETRIES:
  src/api/client.ts:5      → 3
  src/jobs/processor.ts:12 → 5
  src/webhooks/sender.ts:8 → 10

DEFAULT_TIMEOUT:
  src/http/client.ts:3     → 5000
  src/grpc/client.ts:7     → 30000

Found 2 inconsistent constants.
```

---

## Listing Constants

### List All Constants

```bash
drift constants list
```

**Output:**
```
Constants
═════════════════════════════════════════════════════════════════

src/constants/api.ts:
  API_VERSION        = 'v1'              api
  BASE_URL           = '/api'            api
  DEFAULT_TIMEOUT    = 5000              config

src/constants/errors.ts:
  ERROR_NOT_FOUND    = 'NOT_FOUND'       error
  ERROR_UNAUTHORIZED = 'UNAUTHORIZED'    error
  ERROR_VALIDATION   = 'VALIDATION'      error

src/constants/limits.ts:
  MAX_FILE_SIZE      = 10485760          limit
  MAX_UPLOAD_COUNT   = 10                limit
  MAX_NAME_LENGTH    = 255               limit
```

### Filter by Category

```bash
drift constants list --category api
drift constants list --category error
drift constants list --category limit
```

### Filter by File

```bash
drift constants list --file src/constants/
```

### Search by Name

```bash
drift constants list --search "MAX_"
```

---

## Constant Details

```bash
drift constants get MAX_FILE_SIZE
```

**Output:**
```
Constant: MAX_FILE_SIZE
═════════════════════════════════════════════════════════════════

Value:    10485760 (10 MB)
Type:     number
Category: limit
Exported: Yes
File:     src/constants/limits.ts:5

Definition:
  export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

Usages (7):
  src/upload/validator.ts:23
    if (file.size > MAX_FILE_SIZE) { ... }
    
  src/api/upload.ts:45
    const maxSize = MAX_FILE_SIZE;
    
  src/components/FileUpload.tsx:12
    maxSize={MAX_FILE_SIZE}
    
  ... and 4 more usages
```

---

## Constant Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `config` | Configuration values | TIMEOUT, PORT |
| `api` | API-related | VERSION, BASE_URL |
| `status` | Status codes | SUCCESS, PENDING |
| `error` | Error codes | NOT_FOUND, INVALID |
| `feature_flag` | Feature toggles | ENABLE_*, FEATURE_* |
| `limit` | Limits and bounds | MAX_*, MIN_* |
| `regex` | Regular expressions | EMAIL_REGEX |
| `path` | File/URL paths | API_PATH |
| `env` | Environment names | PRODUCTION, STAGING |
| `security` | Security-related | SALT_ROUNDS |

---

## Exporting Constants

```bash
# Export to JSON
drift constants export constants.json

# Export to CSV
drift constants export constants.csv --format csv

# Export filtered by category
drift constants export api-constants.json --category api

# Export filtered by language
drift constants export ts-constants.json --language typescript
```

---

## MCP Integration

### `drift_constants` Tool

```typescript
drift_constants({
  action: "status" | "list" | "get" | "usages" | "magic" | "dead" | "secrets" | "inconsistent",
  category?: string,      // Filter by category for list action
  language?: string,      // Filter by language for list action
  file?: string,          // Filter by file path for list action
  search?: string,        // Search constant names for list action
  exported?: boolean,     // Filter by exported status for list action
  id?: string,            // Constant ID for get/usages actions
  name?: string,          // Constant name for get/usages actions
  constantId?: string,    // Constant ID for usages action
  severity?: string,      // Minimum severity for secrets action
  limit?: number,         // Max results (default: 20, max: 50)
  cursor?: string         // Pagination cursor
})
```

**Actions:**
- `status` — Overview of constants
- `list` — List all constants with filtering
- `get` — Constant details by ID or name
- `usages` — Find where a constant is used
- `magic` — Find magic numbers
- `dead` — Find unused constants
- `secrets` — Find hardcoded secrets
- `inconsistent` — Find value mismatches

---

## CI Integration

### Fail on Hardcoded Secrets

```bash
drift constants secrets --format json
```

Use in CI to detect hardcoded secrets and fail the build if critical issues are found.

### GitHub Actions

```yaml
- name: Check for hardcoded secrets
  run: |
    result=$(drift constants secrets --format json)
    critical=$(echo "$result" | jq '.bySeverity.critical // 0')
    if [ "$critical" -gt 0 ]; then
      echo "Critical hardcoded secrets found!"
      exit 1
    fi
```

---

## Best Practices

### 1. Centralize Constants

Keep constants in dedicated files:

```
src/
├── constants/
│   ├── api.ts
│   ├── errors.ts
│   ├── limits.ts
│   └── index.ts
```

### 2. Name Magic Numbers

```typescript
// Bad
if (retries > 3) { ... }

// Good
const MAX_RETRIES = 3;
if (retries > MAX_RETRIES) { ... }
```

### 3. Use Environment Variables for Secrets

```typescript
// Bad
const API_KEY = 'sk_live_abc123';

// Good
const API_KEY = process.env.API_KEY;
```

### 4. Document Constants

```typescript
/** Maximum file size for uploads (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
```

### 5. Clean Up Dead Constants

Regularly run `drift constants dead` and remove unused values.

---

## Troubleshooting

### Constants not detected

1. Check file is being scanned
2. Ensure constants are exported
3. Check language is supported

### False positive secrets

Add exceptions in `.drift/config.json`:

```json
{
  "constants": {
    "secretExceptions": [
      "TEST_API_KEY",
      "MOCK_SECRET"
    ]
  }
}
```

---

## Next Steps

- [Environment Variables](Environment-Variables) — Env var analysis
- [Security Analysis](Security-Analysis) — Sensitive data tracking
- [Quality Gates](Quality-Gates) — Enforce in CI
