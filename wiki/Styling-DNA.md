lets # Styling DNA

Drift's Styling DNA feature analyzes how your codebase implements patterns for both frontend styling (variants, responsive design, theming, spacing, animations) and backend conventions (API responses, error handling, logging, configuration).

## Overview

Styling DNA creates a "genetic profile" of your codebase's patterns. This helps AI agents generate code that matches your existing conventions exactly.

```
┌─────────────────────────────────────────────────────────────────┐
│                      STYLING DNA PROFILE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FRONTEND GENES                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Variants   │  │  Responsive  │  │   Theming    │           │
│  │              │  │              │  │              │           │
│  │ How you      │  │ Breakpoints  │  │ Dark mode    │           │
│  │ handle       │  │ and media    │  │ CSS vars     │           │
│  │ size/color   │  │ queries      │  │ tokens       │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Spacing    │  │  Animation   │  │    State     │           │
│  │              │  │              │  │              │           │
│  │ Margin/pad   │  │ Transitions  │  │ Hover/focus  │           │
│  │ scale        │  │ keyframes    │  │ active       │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  BACKEND GENES                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ API Response │  │ Error Format │  │   Logging    │           │
│  │              │  │              │  │              │           │
│  │ Envelope vs  │  │ Problem      │  │ Structured   │           │
│  │ direct       │  │ details      │  │ JSON         │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Ten Genes

Styling DNA analyzes ten "genes" that define your codebase's patterns - six for frontend and four for backend:

### Frontend Genes

#### 1. Variant Handling

How you implement component variants (size, color, state).

| Pattern | Description | Example |
|---------|-------------|---------|
| **Props-based** | Variants via props | `<Button size="lg" variant="primary">` |
| **Class-based** | Utility classes | `className="btn btn-lg btn-primary"` |
| **CVA** | Class Variance Authority | `const button = cva("btn", { variants: {...} })` |
| **Styled-components** | CSS-in-JS variants | `${props => props.size === 'lg' && css`...`}` |

#### 2. Responsive Approach

How you handle different screen sizes.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Mobile-first** | Start small, add breakpoints | `@media (min-width: 768px)` |
| **Desktop-first** | Start large, subtract | `@media (max-width: 768px)` |
| **Container queries** | Component-based | `@container (min-width: 400px)` |
| **Tailwind responsive** | Utility prefixes | `md:flex lg:grid` |

#### 3. State Styling

How you style interactive states.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Pseudo-classes** | CSS selectors | `:hover`, `:focus`, `:active` |
| **Data attributes** | State via data-* | `[data-state="active"]` |
| **ARIA attributes** | Accessibility-first | `[aria-selected="true"]` |
| **Class toggling** | JavaScript-driven | `classList.add('is-active')` |

#### 4. Theming

How you implement themes and dark mode.

| Pattern | Description | Example |
|---------|-------------|---------|
| **CSS Variables** | Custom properties | `var(--color-primary)` |
| **Class-based** | Theme class on root | `.dark .bg-white { ... }` |
| **Media query** | System preference | `@media (prefers-color-scheme: dark)` |
| **Context/Provider** | React context | `<ThemeProvider theme={darkTheme}>` |

#### 5. Spacing Philosophy

How you handle margins, padding, and gaps.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Scale-based** | Consistent scale | `4px, 8px, 16px, 24px, 32px` |
| **Tailwind spacing** | Utility classes | `p-4 m-2 gap-6` |
| **Design tokens** | Named tokens | `--spacing-sm`, `--spacing-md` |
| **Arbitrary** | Ad-hoc values | `margin: 13px` |

#### 6. Animation Approach

How you implement animations and transitions.

| Pattern | Description | Example |
|---------|-------------|---------|
| **CSS Transitions** | Property transitions | `transition: all 0.2s ease` |
| **Keyframes** | Complex animations | `@keyframes fadeIn { ... }` |
| **Framer Motion** | React animation lib | `<motion.div animate={{...}}>` |
| **CSS-in-JS** | Styled animations | `animation: ${fadeIn} 0.3s` |

### Backend Genes

#### 7. API Response Format

How you structure API responses.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Envelope** | Wrapped response | `{ data: {...}, meta: {...} }` |
| **Direct** | Raw data | `{ id: 1, name: "..." }` |
| **JSON:API** | JSON:API spec | `{ data: {...}, included: [...] }` |
| **HAL** | Hypermedia links | `{ _links: {...}, _embedded: {...} }` |

#### 8. Error Response Format

How you structure error responses.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Problem Details** | RFC 7807 | `{ type, title, status, detail }` |
| **Custom envelope** | App-specific | `{ error: { code, message } }` |
| **Simple** | Basic error | `{ message: "..." }` |

#### 9. Logging Format

How you structure log output.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Structured JSON** | JSON logs | `{ level, message, timestamp, context }` |
| **Text** | Plain text | `[INFO] 2024-01-01 Message` |
| **Pino/Winston** | Library-specific | Library default format |

#### 10. Config Pattern

How you manage configuration.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Environment** | Env vars | `process.env.DATABASE_URL` |
| **Config object** | Centralized | `config.database.url` |
| **Dotenv** | .env files | `dotenv.config()` |

---

## CLI Commands

### Scan for Styling Patterns

```bash
drift dna scan
```

Analyzes your codebase for frontend and backend styling/code patterns.

**Options:**
- `-p, --paths <paths...>` — Specific frontend component paths to scan
- `-b, --backend-paths <paths...>` — Specific backend paths to scan
- `-m, --mode <mode>` — Analysis mode: `frontend`, `backend`, or `all` (default: `all`)
- `--force` — Force rescan even if cache is valid
- `--verbose` — Enable verbose output
- `--playbook` — Generate playbook after scan
- `-f, --format <format>` — Output format: `summary`, `json`, or `ai-context` (default: `summary`)

### View DNA Profile

```bash
drift dna status
```

Shows your complete styling DNA profile with confidence scores.

**Options:**
- `-d, --detailed` — Show detailed gene breakdown
- `--json` — Output as JSON

**Example Output:**

```
🧬 Drift DNA - Status

Summary
──────────────────────────────────────────────────
  Health Score:      85/100
  Genetic Diversity: 0.25
  Framework:         React
  Components:        47
  Files:             156
  Last Updated:      1/27/2026, 10:30:00 AM

Genes
──────────────────────────────────────────────────
  ● Variant Handling        props-based              92%
  ● Responsive Approach     mobile-first             88%
  ● State Styling           pseudo-classes           95%
  ● Theming                 css-variables            90%
  ● Spacing Philosophy      tailwind-scale           85%
  ● Animation Approach      css-transitions          78%

Mutations: 3
  High: 0  Medium: 2  Low: 1
```

### View Specific Gene

```bash
drift dna gene <gene-id>
```

Shows detailed analysis for a specific gene.

**Options:**
- `-e, --examples` — Show code examples
- `-f, --files` — List files for each allele

**Example:**

```bash
drift dna gene variant-handling --examples
```

### Find Style Inconsistencies

```bash
drift dna mutations
```

Finds places where styling deviates from established patterns.

**Options:**
- `-g, --gene <gene>` — Filter by gene
- `-i, --impact <level>` — Filter by impact: `low`, `medium`, or `high`
- `-s, --suggest` — Show resolution suggestions
- `--json` — Output as JSON

**Example Output:**

```
🧬 Mutations (3)

High Impact (1)
──────────────────────────────────────────────────
  src/components/Card.tsx:45
    Gene: variant-handling
    Found: inline-styles → Expected: props-based
    Code: style={{ padding: '13px' }}...
    💡 Use variant prop pattern like Button.tsx

Medium Impact (2)
──────────────────────────────────────────────────
  src/pages/Dashboard.tsx:123
    Gene: spacing-philosophy
    Found: arbitrary-value → Expected: tailwind-scale
    Code: margin: 13px...
```

### Generate Style Playbook

```bash
drift dna playbook
```

Generates a comprehensive style guide based on detected patterns.

**Options:**
- `-o, --output <path>` — Output path (default: `STYLING-PLAYBOOK.md`)
- `-e, --examples` — Include code examples
- `--force` — Overwrite existing file
- `--stdout` — Output to stdout instead of file

### Export DNA Profile

```bash
drift dna export
```

Exports the DNA profile for AI context or integration.

**Options:**
- `-f, --format <format>` — Export format: `ai-context`, `json`, `playbook`, or `summary` (default: `ai-context`)
- `-g, --genes <genes...>` — Specific genes to export
- `-m, --mutations` — Include mutations
- `-c, --compact` — Compact output
- `-l, --level <level>` — AI context level 1-4 (default: `3`)

---

## MCP Tool

### drift_dna_profile

Get the complete styling DNA profile via MCP.

```typescript
drift_dna_profile({
  gene?: "variant-handling" | "responsive-approach" | "state-styling" | 
         "theming" | "spacing-philosophy" | "animation-approach"
})
```

**Parameters:**
- `gene` — (optional) Specific gene to query. If omitted, returns the complete profile.

**Response:**

```json
{
  "profile": {
    "variantHandling": {
      "pattern": "props-based",
      "confidence": 0.92,
      "examples": ["Button.tsx:12", "Card.tsx:8"],
      "details": {
        "commonProps": ["size", "variant", "color"],
        "componentCount": 47
      }
    },
    "responsiveApproach": {
      "pattern": "mobile-first",
      "confidence": 0.88,
      "breakpoints": ["640px", "768px", "1024px", "1280px"]
    }
    // ... other genes
  },
  "overallConfidence": 0.88,
  "recommendations": [
    "Consider standardizing animation durations",
    "3 components use inconsistent spacing"
  ]
}
```

---

## Styling Detectors

Drift includes styling-specific detectors that feed into the DNA analysis:

| Detector | Description |
|----------|-------------|
| `class-naming` | BEM, utility-first, or custom naming |
| `design-tokens` | Color, spacing, typography tokens |
| `responsive` | Breakpoint and media query patterns |
| `spacing-scale` | Consistent spacing usage |
| `typography` | Font family, size, weight patterns |
| `color-usage` | Color palette consistency |
| `z-index-scale` | Layering and stacking context |
| `tailwind-patterns` | Tailwind CSS utility usage |

These detectors analyze your code and contribute to the overall DNA profile.

---

## Integration with AI Agents

When AI agents request context for UI work, Drift includes styling DNA:

```typescript
// AI requests context for creating a button
drift_context({
  intent: "add_feature",
  focus: "button component"
})

// Response includes styling DNA
{
  "patterns": [...],
  "stylingDNA": {
    "variantHandling": "props-based",
    "responsiveApproach": "mobile-first",
    "theming": "css-variables",
    "spacing": "tailwind-scale"
  },
  "examples": [
    {
      "file": "src/components/Button.tsx",
      "code": "export const Button = ({ size = 'md', variant = 'primary' }) => ..."
    }
  ]
}
```

This ensures generated UI code matches your existing patterns.

---

## Configuration

### .drift/config.json

```json
{
  "dna": {
    "enabled": true,
    "genes": {
      "variant-handling": { "enabled": true },
      "responsive-approach": { "enabled": true },
      "state-styling": { "enabled": true },
      "theming": { "enabled": true },
      "spacing-philosophy": { "enabled": true },
      "animation-approach": { "enabled": true }
    },
    "excludePaths": [
      "**/node_modules/**",
      "**/vendor/**"
    ]
  }
}
```

---

## Use Cases

### 1. Onboarding New Developers

```bash
# Generate style guide for new team members
drift dna playbook --output STYLE_GUIDE.md
```

### 2. Code Review

```bash
# Check PR for style consistency
drift dna mutations --staged
```

### 3. Design System Migration

```bash
# Identify components not following new patterns
drift dna mutations --verbose
```

### 4. AI-Assisted Development

The DNA profile is automatically included in AI context, ensuring generated code matches your styling approach.

---

## Next Steps

- [Pattern Categories](Pattern-Categories) — All 15 pattern categories
- [Detectors Deep Dive](Detectors-Deep-Dive) — 400+ detectors explained
- [Configuration](Configuration) — Project configuration options
