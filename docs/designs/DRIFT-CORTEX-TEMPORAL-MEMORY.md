# Drift Cortex: Temporal Memory Architecture

> A Bitemporal, Event-Sourced, Self-Consolidating Memory System for Code Intelligence

## The Problem With Current Memory Systems

Every AI memory system treats memory as a **static store**:
- Add memory → Store it → Retrieve it later

This ignores fundamental truths about how knowledge actually works:

1. **Knowledge evolves** - What was true yesterday may not be true today
2. **Knowledge conflicts** - New information may contradict old information
3. **Knowledge decays** - Unused knowledge becomes less relevant
4. **Knowledge consolidates** - Repeated patterns become stronger
5. **Knowledge has provenance** - We need to know WHEN we learned something AND when it was true

**No existing AI memory system handles these dynamics.** They all suffer from:
- Stale memories that mislead
- Conflicting memories with no resolution
- Memory bloat from never forgetting
- No distinction between "when learned" and "when valid"

---

## The Novel Architecture: Bitemporal Event-Sourced Memory

### Core Insight: Two Timelines

Every memory has TWO temporal dimensions:

1. **Transaction Time (TT)**: When we LEARNED this (immutable)
2. **Valid Time (VT)**: When this was/is TRUE (can be updated)

```
Example: "We use JWT tokens for auth"

Transaction Time: 2024-03-15 (when we learned this)
Valid Time: 2024-01-01 → ∞ (when this has been true)

Later, we learn: "We migrated to OAuth in September"

Transaction Time: 2024-10-01 (when we learned about the migration)
Valid Time: 2024-09-15 → ∞ (when OAuth became true)

The JWT memory is NOT deleted. Its valid time is CLOSED:
Valid Time: 2024-01-01 → 2024-09-14

Now we can answer:
- "What auth do we use?" → OAuth (current valid time)
- "What auth did we use in March?" → JWT (valid time includes March)
- "When did we learn about OAuth?" → October (transaction time)
- "What did we THINK we used in August, as of September?" → JWT
```

This is **bitemporal modeling** - and NO AI memory system does this.

---

## Architecture Overview

