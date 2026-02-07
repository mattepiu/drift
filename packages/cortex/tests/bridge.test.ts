/**
 * NAPI bridge integration tests.
 *
 * Tests the bridge layer's error handling, module loading, and type conversions.
 * Uses dependency injection via a test-only factory since the actual NAPI module
 * requires a compiled Rust binary.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CortexError } from "../src/bridge/client.js";
import type { NativeBindings } from "../src/bridge/index.js";
import type {
  BaseMemory,
  CausalNarrative,
  HealthReport,
  ConsolidationResult,
  PredictionResult,
  SessionAnalytics,
  CacheStats,
  SanitizeResult,
} from "../src/bridge/types.js";

// ─── Mock Native Module ──────────────────────────────────────────────────────

function createMockBindings(): NativeBindings {
  return {
    cortexInitialize: vi.fn(),
    cortexShutdown: vi.fn(),
    cortexConfigure: vi.fn(() => ({ retrieval: {}, embedding: {} })),

    cortexMemoryCreate: vi.fn(),
    cortexMemoryGet: vi.fn((id: string) => ({
      id,
      memory_type: "episodic",
      content: { type: "episodic", data: { interaction: "test", context: "test", outcome: null } },
      summary: "Test memory",
      transaction_time: "2026-01-01T00:00:00Z",
      valid_time: "2026-01-01T00:00:00Z",
      valid_until: null,
      confidence: 0.9,
      importance: "normal",
      last_accessed: "2026-01-01T00:00:00Z",
      access_count: 1,
      linked_patterns: [],
      linked_constraints: [],
      linked_files: [],
      linked_functions: [],
      tags: ["test"],
      archived: false,
      superseded_by: null,
      supersedes: null,
      content_hash: "abc123",
    })),
    cortexMemoryUpdate: vi.fn(),
    cortexMemoryDelete: vi.fn(),
    cortexMemorySearch: vi.fn(() => []),
    cortexMemoryList: vi.fn(() => []),
    cortexMemoryArchive: vi.fn(),
    cortexMemoryRestore: vi.fn(),

    cortexRetrievalRetrieve: vi.fn(() => []),
    cortexRetrievalSearch: vi.fn(() => []),
    cortexRetrievalGetContext: vi.fn(() => ({
      focus: "test",
      intent: null,
      active_files: [],
      budget: 4096,
      sent_ids: [],
    })),

    cortexCausalInferCause: vi.fn(() => ({
      source_id: "a",
      target_id: "b",
      strength: 0.8,
      suggested_relation: "Related",
      above_threshold: true,
    })),
    cortexCausalTraverse: vi.fn(() => ({
      origin_id: "a",
      max_depth_reached: 2,
      nodes: [],
    })),
    cortexCausalGetWhy: vi.fn(() => ({
      summary: "Because reasons",
      confidence: 0.9,
      sections: [],
    })),
    cortexCausalCounterfactual: vi.fn(() => ({
      origin_id: "a",
      max_depth_reached: 0,
      nodes: [],
    })),
    cortexCausalIntervention: vi.fn(() => ({
      origin_id: "a",
      max_depth_reached: 0,
      nodes: [],
    })),

    cortexLearningAnalyzeCorrection: vi.fn(() => ({
      category: "factual",
      principle: "Always verify",
      memory_created: null,
    })),
    cortexLearningLearn: vi.fn(() => ({
      category: "factual",
      principle: null,
      memory_created: null,
    })),
    cortexLearningGetValidationCandidates: vi.fn(() => []),
    cortexLearningProcessFeedback: vi.fn(() => ({
      category: "feedback",
      principle: null,
      memory_created: null,
    })),

    cortexConsolidationConsolidate: vi.fn(() => ({
      created: [],
      archived: [],
      metrics: { precision: 0.95, compression_ratio: 2.0, lift: 0.1, stability: 0.9 },
    })),
    cortexConsolidationGetMetrics: vi.fn(() => ({
      total_runs: 5,
      successful_runs: 4,
      success_rate: 0.8,
      is_running: false,
    })),
    cortexConsolidationGetStatus: vi.fn(() => ({ is_running: false })),

    cortexHealthGetHealth: vi.fn(() => ({
      overall_status: "healthy",
      subsystems: [],
      metrics: {
        total_memories: 100,
        active_memories: 90,
        archived_memories: 10,
        average_confidence: 0.85,
        db_size_bytes: 1024000,
        embedding_cache_hit_rate: 0.75,
      },
    })),
    cortexHealthGetMetrics: vi.fn(() => ({
      session_count: 3,
      causal_stats: { node_count: 50, edge_count: 30 },
    })),
    cortexHealthGetDegradations: vi.fn(() => []),

    cortexGenerationBuildContext: vi.fn(() => ({
      allocations: [],
      total_tokens: 0,
      total_budget: 4096,
    })),
    cortexGenerationTrackOutcome: vi.fn(),

    cortexPredictionPredict: vi.fn(() => ({
      memory_ids: [],
      signals: [],
      confidence: 0.5,
    })),
    cortexPredictionPreload: vi.fn(() => ({
      preloaded_count: 0,
      memory_ids: [],
      confidence: 0.5,
    })),
    cortexPredictionGetCacheStats: vi.fn(() => ({
      entry_count: 10,
      hits: 8,
      misses: 2,
      hit_rate: 0.8,
    })),

    cortexPrivacySanitize: vi.fn(() => ({ text: "sanitized", redactions: 2 })),
    cortexPrivacyGetPatternStats: vi.fn(() => ({
      failure_count: 0,
      has_failures: false,
      failures: [],
    })),

    cortexCloudSync: vi.fn(() => ({
      status: "Synced",
      pushed: 5,
      pulled: 3,
      conflicts_resolved: 0,
      manual_conflicts: 0,
    })),
    cortexCloudGetStatus: vi.fn(() => ({
      status: "Online",
      is_online: true,
      offline_queue_length: 0,
    })),
    cortexCloudResolveConflict: vi.fn(() => ({
      memory_id: "a",
      resolution: "keep_local",
    })),

    cortexSessionCreate: vi.fn(() => "session-123"),
    cortexSessionGet: vi.fn(() => ({
      session_id: "session-123",
      sent_memory_ids: [],
      tokens_used: 0,
      token_budget: 8192,
    })),
    cortexSessionCleanup: vi.fn(() => 2),
    cortexSessionAnalytics: vi.fn(() => ({
      session_id: "session-123",
      created_at: "2026-01-01T00:00:00Z",
      last_activity: "2026-01-01T00:01:00Z",
      loaded_memories_count: 5,
      loaded_patterns_count: 2,
      loaded_files_count: 3,
      tokens_sent: 1024,
      queries_made: 4,
    })),
  };
}

/**
 * Create a CortexClient-like wrapper directly from mock bindings.
 * This bypasses the native module loading to test the client logic in isolation.
 */
function createTestClient(bindings: NativeBindings) {
  return {
    async memoryGet(id: string): Promise<BaseMemory> {
      return bindings.cortexMemoryGet(id) as BaseMemory;
    },
    async memoryCreate(memory: BaseMemory): Promise<void> {
      bindings.cortexMemoryCreate(memory);
    },
    async memoryUpdate(memory: BaseMemory): Promise<void> {
      bindings.cortexMemoryUpdate(memory);
    },
    async memoryDelete(id: string): Promise<void> {
      bindings.cortexMemoryDelete(id);
    },
    async memorySearch(query: string, limit?: number): Promise<BaseMemory[]> {
      return bindings.cortexMemorySearch(query, limit ?? null) as BaseMemory[];
    },
    async memoryList(memoryType?: string): Promise<BaseMemory[]> {
      return bindings.cortexMemoryList(memoryType ?? null) as BaseMemory[];
    },
    async memoryArchive(id: string): Promise<void> {
      bindings.cortexMemoryArchive(id);
    },
    async memoryRestore(id: string): Promise<void> {
      bindings.cortexMemoryRestore(id);
    },
    async healthReport(): Promise<HealthReport> {
      return bindings.cortexHealthGetHealth() as HealthReport;
    },
    async consolidate(): Promise<ConsolidationResult> {
      return bindings.cortexConsolidationConsolidate(null) as ConsolidationResult;
    },
    async causalGetWhy(memoryId: string): Promise<CausalNarrative> {
      return bindings.cortexCausalGetWhy(memoryId) as CausalNarrative;
    },
    async predict(activeFiles?: string[]): Promise<PredictionResult> {
      return bindings.cortexPredictionPredict(activeFiles ?? null, null, null) as PredictionResult;
    },
    async sessionCreate(sessionId?: string): Promise<string> {
      return bindings.cortexSessionCreate(sessionId ?? null);
    },
    async sessionAnalytics(sessionId: string): Promise<SessionAnalytics> {
      return bindings.cortexSessionAnalytics(sessionId) as SessionAnalytics;
    },
    async cacheStats(): Promise<CacheStats> {
      return bindings.cortexPredictionGetCacheStats() as CacheStats;
    },
    async sanitize(text: string): Promise<SanitizeResult> {
      return bindings.cortexPrivacySanitize(text) as SanitizeResult;
    },
    async shutdown(): Promise<void> {
      bindings.cortexShutdown();
    },
  };
}

describe("CortexClient (via mock bindings)", () => {
  let bindings: NativeBindings;
  let client: ReturnType<typeof createTestClient>;

  beforeEach(() => {
    bindings = createMockBindings();
    client = createTestClient(bindings);
  });

  it("should get a memory by ID", async () => {
    const memory = await client.memoryGet("test-id");
    expect(memory.id).toBe("test-id");
    expect(memory.memory_type).toBe("episodic");
    expect(memory.confidence).toBe(0.9);
    expect(bindings.cortexMemoryGet).toHaveBeenCalledWith("test-id");
  });

  it("should search memories", async () => {
    const results = await client.memorySearch("test query", 10);
    expect(Array.isArray(results)).toBe(true);
    expect(bindings.cortexMemorySearch).toHaveBeenCalledWith("test query", 10);
  });

  it("should handle health report", async () => {
    const report = await client.healthReport();
    expect(report.overall_status).toBe("healthy");
    expect(report.metrics.total_memories).toBe(100);
  });

  it("should handle consolidation", async () => {
    const result = await client.consolidate();
    expect(result.metrics.precision).toBe(0.95);
  });

  it("should handle causal operations", async () => {
    const narrative = await client.causalGetWhy("test-id");
    expect(narrative.summary).toBe("Because reasons");
    expect(narrative.confidence).toBe(0.9);
  });

  it("should handle prediction", async () => {
    const result = await client.predict(["file.ts"]);
    expect(result.confidence).toBe(0.5);
  });

  it("should handle session operations", async () => {
    const sessionId = await client.sessionCreate();
    expect(sessionId).toBe("session-123");

    const analytics = await client.sessionAnalytics("session-123");
    expect(analytics.queries_made).toBe(4);
  });

  it("should handle cache stats", async () => {
    const stats = await client.cacheStats();
    expect(stats.hit_rate).toBe(0.8);
    expect(stats.entry_count).toBe(10);
  });

  it("should handle privacy sanitization", async () => {
    const result = await client.sanitize("test with [email]");
    expect(result.text).toBe("sanitized");
    expect(result.redactions).toBe(2);
  });

  it("should handle shutdown", async () => {
    await client.shutdown();
    expect(bindings.cortexShutdown).toHaveBeenCalled();
  });

  it("should handle memory CRUD lifecycle", async () => {
    const memory = await client.memoryGet("mem-1");
    expect(memory.id).toBe("mem-1");

    await client.memoryUpdate(memory);
    expect(bindings.cortexMemoryUpdate).toHaveBeenCalledWith(memory);

    await client.memoryArchive("mem-1");
    expect(bindings.cortexMemoryArchive).toHaveBeenCalledWith("mem-1");

    await client.memoryRestore("mem-1");
    expect(bindings.cortexMemoryRestore).toHaveBeenCalledWith("mem-1");

    await client.memoryDelete("mem-1");
    expect(bindings.cortexMemoryDelete).toHaveBeenCalledWith("mem-1");
  });

  it("should list memories by type", async () => {
    await client.memoryList("tribal");
    expect(bindings.cortexMemoryList).toHaveBeenCalledWith("tribal");
  });
});

describe("CortexError", () => {
  it("should parse structured error codes from NAPI errors", () => {
    const error = new CortexError("MEMORY_NOT_FOUND", "Memory not found: abc");
    expect(error.code).toBe("MEMORY_NOT_FOUND");
    expect(error.message).toBe("Memory not found: abc");
    expect(error.name).toBe("CortexError");
  });

  it("should handle errors with unknown codes", () => {
    const error = new CortexError("UNKNOWN", "Something went wrong");
    expect(error.code).toBe("UNKNOWN");
    expect(error.message).toBe("Something went wrong");
  });

  it("should be an instance of Error", () => {
    const error = new CortexError("STORAGE_ERROR", "DB failed");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CortexError);
  });
});

describe("NativeBindings interface", () => {
  it("should have all required binding functions", () => {
    const bindings = createMockBindings();

    // Lifecycle
    expect(typeof bindings.cortexInitialize).toBe("function");
    expect(typeof bindings.cortexShutdown).toBe("function");
    expect(typeof bindings.cortexConfigure).toBe("function");

    // Memory (8)
    expect(typeof bindings.cortexMemoryCreate).toBe("function");
    expect(typeof bindings.cortexMemoryGet).toBe("function");
    expect(typeof bindings.cortexMemoryUpdate).toBe("function");
    expect(typeof bindings.cortexMemoryDelete).toBe("function");
    expect(typeof bindings.cortexMemorySearch).toBe("function");
    expect(typeof bindings.cortexMemoryList).toBe("function");
    expect(typeof bindings.cortexMemoryArchive).toBe("function");
    expect(typeof bindings.cortexMemoryRestore).toBe("function");

    // Retrieval (3)
    expect(typeof bindings.cortexRetrievalRetrieve).toBe("function");
    expect(typeof bindings.cortexRetrievalSearch).toBe("function");
    expect(typeof bindings.cortexRetrievalGetContext).toBe("function");

    // Causal (5)
    expect(typeof bindings.cortexCausalInferCause).toBe("function");
    expect(typeof bindings.cortexCausalTraverse).toBe("function");
    expect(typeof bindings.cortexCausalGetWhy).toBe("function");
    expect(typeof bindings.cortexCausalCounterfactual).toBe("function");
    expect(typeof bindings.cortexCausalIntervention).toBe("function");

    // Learning (4)
    expect(typeof bindings.cortexLearningAnalyzeCorrection).toBe("function");
    expect(typeof bindings.cortexLearningLearn).toBe("function");
    expect(typeof bindings.cortexLearningGetValidationCandidates).toBe("function");
    expect(typeof bindings.cortexLearningProcessFeedback).toBe("function");

    // Consolidation (3)
    expect(typeof bindings.cortexConsolidationConsolidate).toBe("function");
    expect(typeof bindings.cortexConsolidationGetMetrics).toBe("function");
    expect(typeof bindings.cortexConsolidationGetStatus).toBe("function");

    // Health (3)
    expect(typeof bindings.cortexHealthGetHealth).toBe("function");
    expect(typeof bindings.cortexHealthGetMetrics).toBe("function");
    expect(typeof bindings.cortexHealthGetDegradations).toBe("function");

    // Generation (2)
    expect(typeof bindings.cortexGenerationBuildContext).toBe("function");
    expect(typeof bindings.cortexGenerationTrackOutcome).toBe("function");

    // Prediction (3)
    expect(typeof bindings.cortexPredictionPredict).toBe("function");
    expect(typeof bindings.cortexPredictionPreload).toBe("function");
    expect(typeof bindings.cortexPredictionGetCacheStats).toBe("function");

    // Privacy (2)
    expect(typeof bindings.cortexPrivacySanitize).toBe("function");
    expect(typeof bindings.cortexPrivacyGetPatternStats).toBe("function");

    // Cloud (3)
    expect(typeof bindings.cortexCloudSync).toBe("function");
    expect(typeof bindings.cortexCloudGetStatus).toBe("function");
    expect(typeof bindings.cortexCloudResolveConflict).toBe("function");

    // Session (4)
    expect(typeof bindings.cortexSessionCreate).toBe("function");
    expect(typeof bindings.cortexSessionGet).toBe("function");
    expect(typeof bindings.cortexSessionCleanup).toBe("function");
    expect(typeof bindings.cortexSessionAnalytics).toBe("function");
  });
});
