# CIBench v2 - Benchmark Protocol

## Overview

This benchmark measures codebase intelligence by asking an AI agent to answer specific questions about a codebase. The same questions are asked twice:

1. **WITH Drift** - Agent has access to drift_* MCP tools
2. **WITHOUT Drift** - Agent can only use file reading and grep

## Recording Instructions

### Setup

1. Open two separate Kiro sessions (or clear context between runs)
2. Have the benchmark tasks ready: `drift/packages/cibench/corpus/demo-backend/.cibench/benchmark-tasks.json`
3. Record both sessions

### Run 1: WITH Drift (Full Tooling)

Start a new chat and paste:

```
You are taking a codebase intelligence benchmark. You have access to Drift MCP tools.

The codebase is at: drift/demo/backend

Answer each question as accurately as possible. Use drift_* tools to help you.

TASK 1: List all authentication middleware functions in this codebase.

TASK 2: What is the standard response format used in this API? Show an example.

TASK 3: Which API routes are missing authentication that should have it? List the security vulnerabilities.

TASK 4: Which routes use non-standard response formats (not using sendSuccess/sendPaginated/sendCreated)?

TASK 5: Describe the error handling architecture. What error classes exist and how are they used?

TASK 6: What is the layered architecture of this codebase? Describe the separation of concerns.

TASK 7: If I change the authMiddleware function signature, which files would be affected?

TASK 8: I want to add a new route POST /api/users/:id/avatar. What patterns should I follow? Show me an example of a similar route.

Answer each task clearly and cite your sources.
```

### Run 2: WITHOUT Drift (Baseline)

Start a fresh chat and paste:

```
You are taking a codebase intelligence benchmark. You can ONLY use:
- listDirectory
- readFile / readMultipleFiles  
- grepSearch

DO NOT use any drift_* tools. This simulates working without specialized codebase intelligence.

The codebase is at: drift/demo/backend

Answer each question as accurately as possible using only basic file operations.

TASK 1: List all authentication middleware functions in this codebase.

TASK 2: What is the standard response format used in this API? Show an example.

TASK 3: Which API routes are missing authentication that should have it? List the security vulnerabilities.

TASK 4: Which routes use non-standard response formats (not using sendSuccess/sendPaginated/sendCreated)?

TASK 5: Describe the error handling architecture. What error classes exist and how are they used?

TASK 6: What is the layered architecture of this codebase? Describe the separation of concerns.

TASK 7: If I change the authMiddleware function signature, which files would be affected?

TASK 8: I want to add a new route POST /api/users/:id/avatar. What patterns should I follow? Show me an example of a similar route.

Answer each task clearly and cite your sources.
```

## Scoring Rubric

For each task, score 0-2 points:

| Score | Criteria |
|-------|----------|
| 2 | Full credit - Complete, accurate answer with all expected elements |
| 1 | Partial credit - Partially correct or missing key elements |
| 0 | No credit - Incorrect, incomplete, or unable to answer |

### Task-Specific Scoring

**T1: Auth Middleware (Easy)**
- 2 pts: Both `authMiddleware` and `adminMiddleware` identified with correct file
- 1 pt: Only one identified, or wrong file
- 0 pts: Neither identified

**T2: Response Format (Medium)**
- 2 pts: Identifies `{ success: true, data: ... }` format AND helper functions
- 1 pt: Identifies format OR helpers but not both
- 0 pts: Cannot identify response pattern

**T3: Missing Auth - Security (Hard)**
- 2 pts: Identifies all 5 missing auth routes (4 in legacy.ts, 1 in admin.ts)
- 1 pt: Identifies 2-4 routes
- 0 pts: Identifies 0-1 or many false positives

**T4: Non-Standard Responses (Medium)**
- 2 pts: Identifies 6+ violations with correct reasoning
- 1 pt: Identifies 3-5 violations
- 0 pts: Identifies 0-2 violations

**T5: Error Architecture (Medium)**
- 2 pts: Identifies hierarchy (ApiError → derived), all classes, and central handler
- 1 pt: Identifies classes but misses central handler pattern
- 0 pts: Cannot describe error handling

**T6: Layered Architecture (Hard)**
- 2 pts: Identifies all 4 layers (Routes, Middleware, Services, Utils) with responsibilities
- 1 pt: Identifies 2-3 layers correctly
- 0 pts: Cannot describe architecture

**T7: Impact Analysis (Hard)**
- 2 pts: Lists all 5 affected files AND notes legacy.ts is NOT affected (the insight)
- 1 pt: Lists most files but misses the legacy.ts insight
- 0 pts: Cannot trace usage

**T8: Code Generation Context (Medium)**
- 2 pts: Lists patterns (auth, response helpers, error types) AND provides example
- 1 pt: Lists some patterns OR provides example
- 0 pts: Cannot identify patterns

## Expected Results

| Task | Drift Expected | Baseline Expected |
|------|----------------|-------------------|
| T1 | 2 (instant via drift_middleware) | 2 (grep can find this) |
| T2 | 2 (drift_patterns_list) | 1-2 (grep can find helpers) |
| T3 | 2 (drift detects outliers) | 0-1 (grep can't find MISSING code) |
| T4 | 2 (drift detects violations) | 1 (grep finds res.send but not WHY it's wrong) |
| T5 | 2 (drift_errors + drift_explain) | 1-2 (can read files) |
| T6 | 2 (drift understands structure) | 1 (can see folders) |
| T7 | 2 (drift_callers / drift_impact) | 1 (grep can find imports) |
| T8 | 2 (drift_similar + drift_context) | 1 (can read example files) |
| **Total** | **16/16** | **8-11/16** |

## Key Differentiators

The benchmark is designed to highlight where specialized tooling matters:

1. **T3 (Missing Auth)** - Grep cannot find code that DOESN'T exist. Drift understands what SHOULD be there.

2. **T4 (Non-Standard Responses)** - Grep finds `res.send()` but doesn't know it's a violation. Drift understands the pattern.

3. **T7 (Impact Analysis)** - Drift can trace call graphs. Grep can only find text matches.

4. **T8 (Code Gen Context)** - Drift provides curated context. Baseline must read many files.

## Recording Tips

1. Time both runs - Drift should be significantly faster
2. Count tool calls - Drift uses fewer, more targeted calls
3. Note confidence - Drift answers are more definitive
4. Highlight T3 - This is the "killer demo" task where baseline fails
