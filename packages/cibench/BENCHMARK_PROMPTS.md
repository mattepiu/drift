# CIBench Benchmark Prompts

Copy-paste these prompts into fresh chat sessions for recording.

---

## PROMPT 1: WITH DRIFT

```
I'm running a codebase intelligence benchmark. You have access to Drift MCP tools (drift_status, drift_patterns_list, drift_middleware, drift_callers, drift_context, drift_python, etc).

The codebase is: drift/test-repos/competitive-intelligence-api (a Python/FastAPI competitive intelligence platform)

Answer these 8 tasks. Use Drift tools to help you find accurate answers quickly.

---

TASK 1 (Pattern Detection - Easy):
List all authentication and authorization middleware/dependencies in this codebase. Include file locations.

---

TASK 2 (Pattern Detection - Medium):
What is the standard response format used in this API? How are errors handled consistently?

---

TASK 3 (Outlier Detection - Hard):
Which API routes are MISSING authentication that should have it? This is a security audit - find the vulnerabilities.

---

TASK 4 (Outlier Detection - Medium):
Which services access the database directly vs through proper service layers? Find any data access pattern violations.

---

TASK 5 (Architecture - Medium):
Describe the error handling architecture. What error classes exist and how does centralized error handling work?

---

TASK 6 (Architecture - Hard):
What is the layered architecture of this codebase? Describe each layer (routes, services, database, middleware) and its responsibility.

---

TASK 7 (Impact Analysis - Hard):
If I modify the auth middleware (api/middleware/auth.py), which files would need to be updated? What's the blast radius?

---

TASK 8 (Code Generation - Medium):
I want to add a new route: POST /api/invoices/{invoice_id}/approve
What patterns should I follow? Show me an example of a similar existing route I should use as a template.

---

Answer each task with specific file locations and line numbers where relevant.
```

---

## PROMPT 2: WITHOUT DRIFT (BASELINE)

```
I'm running a codebase intelligence benchmark. You can ONLY use these tools:
- listDirectory (explore file structure)
- readFile / readMultipleFiles (read code)
- grepSearch (search for text patterns)

DO NOT use any drift_* tools. This tests what's possible with basic file operations only.

The codebase is: drift/test-repos/competitive-intelligence-api (a Python/FastAPI competitive intelligence platform)

Answer these 8 tasks using only the allowed tools.

---

TASK 1 (Pattern Detection - Easy):
List all authentication and authorization middleware/dependencies in this codebase. Include file locations.

---

TASK 2 (Pattern Detection - Medium):
What is the standard response format used in this API? How are errors handled consistently?

---

TASK 3 (Outlier Detection - Hard):
Which API routes are MISSING authentication that should have it? This is a security audit - find the vulnerabilities.

---

TASK 4 (Outlier Detection - Medium):
Which services access the database directly vs through proper service layers? Find any data access pattern violations.

---

TASK 5 (Architecture - Medium):
Describe the error handling architecture. What error classes exist and how does centralized error handling work?

---

TASK 6 (Architecture - Hard):
What is the layered architecture of this codebase? Describe each layer (routes, services, database, middleware) and its responsibility.

---

TASK 7 (Impact Analysis - Hard):
If I modify the auth middleware (api/middleware/auth.py), which files would need to be updated? What's the blast radius?

---

TASK 8 (Code Generation - Medium):
I want to add a new route: POST /api/invoices/{invoice_id}/approve
What patterns should I follow? Show me an example of a similar existing route I should use as a template.

---

Answer each task with specific file locations and line numbers where relevant.
```

---

## SCORING SHEET

After both runs, score each task:

| Task | Drift Score (0-2) | Baseline Score (0-2) | Notes |
|------|-------------------|----------------------|-------|
| T1 | | | Auth middleware/dependencies |
| T2 | | | Response format & error handling |
| T3 | | | **KEY**: Missing auth detection |
| T4 | | | Data access pattern violations |
| T5 | | | Error architecture |
| T6 | | | Layered architecture |
| T7 | | | Impact analysis |
| T8 | | | Code gen context |
| **TOTAL** | **/16** | **/16** | |

### Scoring Guide:
- **2 points**: Complete, accurate answer with all expected elements
- **1 point**: Partially correct or missing key elements  
- **0 points**: Incorrect, incomplete, or unable to answer

### Key Metrics to Track:
- Total time for each run
- Number of tool calls
- T3 and T4 specifically (this is where baseline should struggle with a larger codebase)

### Why This Codebase?
The competitive-intelligence-api is a real-world Python/FastAPI application with:
- 70+ services
- 25+ route files
- Multiple middleware layers
- Complex data access patterns
- Mixed authentication patterns

This makes it much harder to manually audit than the small demo-backend.
