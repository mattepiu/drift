# CIBench Results: competitive-intelligence-api

## Run Metadata

| Metric | Baseline (No Drift) | With Drift |
|--------|---------------------|------------|
| **Time** | 2m 17s | ~1m 30s (estimated) |
| **Credits Used** | 6.95 | 4.93 |
| **Tool Calls** | ~15 | ~12 |

## Task Scoring

| Task | Baseline Score | Drift Score | Winner | Notes |
|------|----------------|-------------|--------|-------|
| **T1** Auth Middleware | 2/2 | 2/2 | Tie | Both found all auth dependencies |
| **T2** Response Format | 2/2 | 2/2 | Tie | Both identified patterns + outliers |
| **T3** Missing Auth | 2/2 | 2/2 | Tie | Both found security vulnerabilities |
| **T4** Data Access | 1/2 | 2/2 | **Drift** | Drift found N+1 patterns (258 locations) |
| **T5** Error Handling | 2/2 | 2/2 | Tie | Both described architecture |
| **T6** Architecture | 2/2 | 2/2 | Tie | Both mapped layers correctly |
| **T7** Impact Analysis | 1/2 | 2/2 | **Drift** | Drift: 232 callers, 804 sensitive paths |
| **T8** Code Gen | 2/2 | 2/2 | Tie | Both provided good templates |
| **TOTAL** | **14/16** | **16/16** | **Drift** | |

## Detailed Analysis

### T4: Data Access Patterns - Drift Advantage

**Baseline found:**
- 5 services with direct database access
- Manual grep for `supabase.table()`
- No quantification of pattern violations

**Drift found:**
- 78 data-access patterns
- 100+ repository pattern locations
- 100+ query access locations
- **258 N+1 query patterns** (baseline missed entirely)
- Proper layering analysis

**Verdict:** Drift's pattern detection found significantly more issues, including the N+1 query anti-pattern that baseline completely missed.

### T7: Impact Analysis - Drift Advantage

**Baseline found:**
- ~40 files that import auth.py
- Manual grep + tracing
- No quantification of risk

**Drift found:**
- 232 direct callers
- 17 transitive callers
- 201 affected entry points
- **804 sensitive data paths**
- Risk score: 100/100 (CRITICAL)
- Max depth: 4

**Verdict:** Drift provided quantified impact analysis with sensitive data path tracing that baseline couldn't replicate.

## Qualitative Differences

### Where Drift Excelled

1. **Quantification**: Drift provided exact counts (232 callers, 258 N+1 patterns, 804 sensitive paths) vs baseline's approximations (~40 files)

2. **Pattern Detection**: Drift found N+1 query patterns that baseline completely missed

3. **Risk Assessment**: Drift provided risk scores and severity levels

4. **Sensitive Data Tracking**: Drift traced 804 sensitive data paths through the call graph

5. **Efficiency**: 29% fewer credits used (4.93 vs 6.95)

### Where Baseline Was Sufficient

1. **Auth Middleware Discovery**: grep found all auth dependencies
2. **Response Format Analysis**: Manual reading identified patterns
3. **Architecture Mapping**: Directory structure + reading was adequate
4. **Code Generation Templates**: Both found appropriate examples

## Key Insight

For a codebase of this size (70+ services, 25+ routes), Drift's pre-indexed analysis provides:

1. **Completeness**: Finds patterns that manual grep misses (N+1 queries)
2. **Quantification**: Exact counts vs approximations
3. **Depth**: Sensitive data path tracing through call graph
4. **Efficiency**: Fewer tool calls, less time, lower cost

The gap would widen further with larger codebases where manual grep becomes increasingly impractical.

## Recommendations

1. **For small codebases (<50 files)**: Baseline tools may be sufficient
2. **For medium codebases (50-500 files)**: Drift provides meaningful advantages
3. **For large codebases (500+ files)**: Drift is essential for complete analysis
4. **For security audits**: Drift's sensitive data path tracing is critical
