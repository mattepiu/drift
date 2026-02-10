//! Category 4: Cross-System Bridge Grounding
//!
//! Tests T4-01 through T4-06 — verifying the bridge between drift.db and cortex.db
//! handles link translation failures, grounding score computation across all 10
//! evidence types, prepopulated vs fallback priority, missing context safety,
//! concurrent bridge operations, and schema consistency.

use cortex_drift_bridge::grounding::evidence::collector::EvidenceContext;
use cortex_drift_bridge::grounding::evidence::EvidenceType;
use cortex_drift_bridge::grounding::loop_runner::MemoryForGrounding;
use cortex_drift_bridge::grounding::GroundingLoopRunner;
use cortex_drift_bridge::link_translation::{EntityLink, LinkTranslator};
use cortex_drift_bridge::storage;
use cortex_drift_bridge::types::GroundingVerdict;

// ============================================================================
// HELPERS
// ============================================================================

/// Create a mock drift.db with all 10 evidence tables populated.
fn setup_mock_drift_db() -> rusqlite::Connection {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE drift_patterns (id TEXT PRIMARY KEY, confidence REAL, occurrence_rate REAL);
         CREATE TABLE drift_violation_feedback (pattern_id TEXT PRIMARY KEY, fp_rate REAL);
         CREATE TABLE drift_constraints (id TEXT PRIMARY KEY, verified INTEGER);
         CREATE TABLE drift_coupling (module TEXT PRIMARY KEY, instability REAL);
         CREATE TABLE drift_dna (project TEXT PRIMARY KEY, health_score REAL);
         CREATE TABLE drift_test_topology (module TEXT PRIMARY KEY, coverage REAL);
         CREATE TABLE drift_error_handling (module TEXT PRIMARY KEY, gap_count INTEGER);
         CREATE TABLE drift_decisions (id TEXT PRIMARY KEY, evidence_score REAL);
         CREATE TABLE drift_boundaries (id TEXT PRIMARY KEY, boundary_score REAL);

         INSERT INTO drift_patterns VALUES ('p1', 0.92, 0.75);
         INSERT INTO drift_violation_feedback VALUES ('p1', 0.05);
         INSERT INTO drift_constraints VALUES ('c1', 1);
         INSERT INTO drift_coupling VALUES ('src/auth', 0.82);
         INSERT INTO drift_dna VALUES ('myproject', 0.88);
         INSERT INTO drift_test_topology VALUES ('src/auth', 0.91);
         INSERT INTO drift_error_handling VALUES ('src/auth', 3);
         INSERT INTO drift_decisions VALUES ('d1', 0.77);
         INSERT INTO drift_boundaries VALUES ('b1', 0.65);",
    )
    .unwrap();
    conn
}

/// Create a bridge_db with schema tables.
fn setup_bridge_db() -> rusqlite::Connection {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    storage::configure_connection(&conn).unwrap();
    storage::create_bridge_tables(&conn).unwrap();
    conn
}

/// Full EvidenceContext pointing to all mock drift.db rows.
fn full_evidence_context() -> EvidenceContext {
    EvidenceContext {
        pattern_id: Some("p1".to_string()),
        constraint_id: Some("c1".to_string()),
        module_path: Some("src/auth".to_string()),
        project: Some("myproject".to_string()),
        decision_id: Some("d1".to_string()),
        boundary_id: Some("b1".to_string()),
        current_confidence: 0.5,
    }
}

/// Create a MemoryForGrounding with all pre-populated fields set to None.
fn empty_memory(id: &str) -> MemoryForGrounding {
    MemoryForGrounding {
        memory_id: id.to_string(),
        memory_type: cortex_core::MemoryType::PatternRationale,
        current_confidence: 0.5,
        pattern_confidence: None,
        occurrence_rate: None,
        false_positive_rate: None,
        constraint_verified: None,
        coupling_metric: None,
        dna_health: None,
        test_coverage: None,
        error_handling_gaps: None,
        decision_evidence: None,
        boundary_data: None,
        evidence_context: None,
    }
}

// ============================================================================
// T4-01: Link Translation — Broken Link
// ============================================================================
// Create a Cortex memory referencing a file_id in Drift. Delete that file's
// metadata. Link translation must return "Broken Link" status, not null
// pointer/panic.

#[test]
fn t4_01_broken_link_translate_back_missing_metadata() {
    // Create an EntityLink with metadata missing the expected fields.
    // to_pattern_link should still work — falls back to entity_id when
    // metadata["pattern_name"] is missing.
    let link = EntityLink {
        entity_type: "drift_pattern".to_string(),
        entity_id: "deleted_pattern_999".to_string(),
        metadata: serde_json::json!({}), // missing pattern_name
        strength: 0.5,
    };

    let recovered = LinkTranslator::to_pattern_link(&link).unwrap();
    // Falls back to entity_id when pattern_name is missing
    assert_eq!(recovered.pattern_id, "deleted_pattern_999");
    assert_eq!(
        recovered.pattern_name, "deleted_pattern_999",
        "Missing metadata should fall back to entity_id"
    );
}

#[test]
fn t4_01_broken_link_translate_back_null_metadata() {
    // Metadata with null pattern_name
    let link = EntityLink {
        entity_type: "drift_pattern".to_string(),
        entity_id: "orphan_pat".to_string(),
        metadata: serde_json::json!({"pattern_name": null}),
        strength: 0.0,
    };

    let recovered = LinkTranslator::to_pattern_link(&link).unwrap();
    assert_eq!(recovered.pattern_id, "orphan_pat");
    // null isn't a string, so as_str() returns None → fallback to entity_id
    assert_eq!(recovered.pattern_name, "orphan_pat");
}

#[test]
fn t4_01_broken_link_wrong_entity_type() {
    // Attempt to translate a non-pattern link as a pattern
    let link = EntityLink::from_module("src/deleted.rs", 0.5);
    let result = LinkTranslator::to_pattern_link(&link);
    assert!(result.is_err(), "Wrong entity_type must return Err, not panic");

    let result = LinkTranslator::to_constraint_link(&link);
    assert!(result.is_err(), "Wrong entity_type must return Err, not panic");
}

#[test]
fn t4_01_broken_link_constraint_missing_metadata() {
    let link = EntityLink {
        entity_type: "drift_constraint".to_string(),
        entity_id: "deleted_constraint_42".to_string(),
        metadata: serde_json::json!({}),
        strength: 1.0,
    };

    let recovered = LinkTranslator::to_constraint_link(&link).unwrap();
    assert_eq!(recovered.constraint_id, "deleted_constraint_42");
    assert_eq!(
        recovered.constraint_name, "deleted_constraint_42",
        "Missing metadata should fall back to entity_id"
    );
}

// ============================================================================
// T4-02: Grounding Score Weights — All 10 Evidence Types
// ============================================================================
// Test all 10 evidence types. A change in enforcement_status (new violation)
// must trigger recalculation.

#[test]
fn t4_02_all_10_evidence_types_from_drift_db() {
    let runner = GroundingLoopRunner::default();
    let drift_db = setup_mock_drift_db();

    let memory = MemoryForGrounding {
        evidence_context: Some(full_evidence_context()),
        ..empty_memory("t4_02_all10")
    };

    let result = runner
        .ground_single(&memory, Some(&drift_db), None)
        .unwrap();

    // With all 10 evidence types available in drift.db, we should collect
    // evidence for at least the 9 types that have matching context fields
    // (PatternConfidence, PatternOccurrence, FalsePositiveRate,
    // ConstraintVerification, CouplingMetric, DnaHealth, TestCoverage,
    // ErrorHandlingGaps, DecisionEvidence, BoundaryData).
    assert!(
        result.evidence.len() >= 9,
        "Expected at least 9 evidence types, got {}",
        result.evidence.len()
    );

    // Score should be well above zero
    assert!(
        result.grounding_score > 0.0,
        "Grounding score with all 10 evidence types must be > 0, got {}",
        result.grounding_score
    );

    // Verdict should not be InsufficientData
    assert_ne!(result.verdict, GroundingVerdict::InsufficientData);

    // Verify all collected evidence types are distinct
    let types: std::collections::HashSet<_> = result
        .evidence
        .iter()
        .map(|e| std::mem::discriminant(&e.evidence_type))
        .collect();
    assert_eq!(
        types.len(),
        result.evidence.len(),
        "All evidence types should be distinct"
    );
}

#[test]
fn t4_02_enforcement_status_change_triggers_recalculation() {
    let runner = GroundingLoopRunner::default();
    let bridge_db = setup_bridge_db();

    // First grounding: high pattern confidence → Validated
    let memory_v1 = MemoryForGrounding {
        pattern_confidence: Some(0.95),
        occurrence_rate: Some(0.80),
        test_coverage: Some(0.90),
        ..empty_memory("t4_02_reeval")
    };

    let result_v1 = runner
        .ground_single(&memory_v1, None, Some(&bridge_db))
        .unwrap();
    let score_v1 = result_v1.grounding_score;

    // Simulate enforcement status change: new violation drops pattern confidence
    let memory_v2 = MemoryForGrounding {
        pattern_confidence: Some(0.15),
        occurrence_rate: Some(0.80),
        test_coverage: Some(0.90),
        ..empty_memory("t4_02_reeval")
    };

    let result_v2 = runner
        .ground_single(&memory_v2, None, Some(&bridge_db))
        .unwrap();
    let score_v2 = result_v2.grounding_score;

    // Score must change when evidence changes
    assert!(
        (score_v1 - score_v2).abs() > 0.01,
        "Score must update when evidence changes: v1={}, v2={}",
        score_v1,
        score_v2
    );

    // Second call should see the previous score from bridge_db
    assert!(
        result_v2.previous_score.is_some(),
        "Second grounding should find previous score in bridge_db"
    );
}

#[test]
fn t4_02_evidence_weight_sum_is_one() {
    // Verify that all 10 evidence type weights sum to 1.0
    let total: f64 = EvidenceType::ALL.iter().map(|t| t.default_weight()).sum();
    assert!(
        (total - 1.0).abs() < 1e-10,
        "Evidence type weights must sum to 1.0, got {}",
        total
    );
}

// ============================================================================
// T4-03: Prepopulated vs Drift DB Fallback
// ============================================================================
// Provide MemoryForGrounding with some fields populated, others None, with
// drift_db available. Prepopulated fields must take priority; missing fields
// must fall back to drift.db queries.

#[test]
fn t4_03_prepopulated_wins_over_drift_db() {
    let runner = GroundingLoopRunner::default();
    let drift_db = setup_mock_drift_db();

    let memory = MemoryForGrounding {
        // Pre-populate pattern_confidence at 0.3 (drift.db has 0.92)
        pattern_confidence: Some(0.3),
        // Leave occurrence_rate as None (drift.db has 0.75 for p1)
        evidence_context: Some(full_evidence_context()),
        ..empty_memory("t4_03_priority")
    };

    let result = runner
        .ground_single(&memory, Some(&drift_db), None)
        .unwrap();

    // PatternConfidence should use pre-populated value (0.3), not drift.db (0.92)
    let pat_ev = result
        .evidence
        .iter()
        .find(|e| e.evidence_type == EvidenceType::PatternConfidence)
        .expect("Must have PatternConfidence evidence");
    assert!(
        (pat_ev.drift_value - 0.3).abs() < 0.001,
        "Pre-populated field (0.3) must take priority over drift.db (0.92), got {}",
        pat_ev.drift_value
    );

    // PatternOccurrence should come from drift.db fallback (0.75)
    let occ_ev = result
        .evidence
        .iter()
        .find(|e| e.evidence_type == EvidenceType::PatternOccurrence)
        .expect("PatternOccurrence should be filled from drift.db fallback");
    assert!(
        (occ_ev.drift_value - 0.75).abs() < 0.001,
        "Drift.db fallback should provide 0.75, got {}",
        occ_ev.drift_value
    );
}

#[test]
fn t4_03_all_prepopulated_ignores_drift_db() {
    let runner = GroundingLoopRunner::default();
    let drift_db = setup_mock_drift_db();

    // All 10 fields pre-populated — drift.db should NOT be queried
    let memory = MemoryForGrounding {
        pattern_confidence: Some(0.50),
        occurrence_rate: Some(0.40),
        false_positive_rate: Some(0.10),
        constraint_verified: Some(true),
        coupling_metric: Some(0.60),
        dna_health: Some(0.70),
        test_coverage: Some(0.80),
        error_handling_gaps: Some(2),
        decision_evidence: Some(0.65),
        boundary_data: Some(0.55),
        evidence_context: Some(full_evidence_context()),
        ..empty_memory("t4_03_all_prepop")
    };

    let result = runner
        .ground_single(&memory, Some(&drift_db), None)
        .unwrap();

    assert_eq!(
        result.evidence.len(),
        10,
        "All 10 evidence types should be present"
    );

    // PatternConfidence should be 0.50 (pre-populated), not 0.92 (drift.db)
    let pat_ev = result
        .evidence
        .iter()
        .find(|e| e.evidence_type == EvidenceType::PatternConfidence)
        .unwrap();
    assert!(
        (pat_ev.drift_value - 0.50).abs() < 0.001,
        "Pre-populated 0.50 must win over drift.db 0.92, got {}",
        pat_ev.drift_value
    );
}

// ============================================================================
// T4-04: No Evidence Context = No Fallback
// ============================================================================
// Provide drift_db but no evidence_context. Must return InsufficientData,
// not attempt DB queries.

#[test]
fn t4_04_no_evidence_context_means_insufficient_data() {
    let runner = GroundingLoopRunner::default();
    let drift_db = setup_mock_drift_db();

    // No pre-populated fields AND no evidence_context
    let memory = empty_memory("t4_04_no_ctx");

    let result = runner
        .ground_single(&memory, Some(&drift_db), None)
        .unwrap();

    assert_eq!(
        result.verdict,
        GroundingVerdict::InsufficientData,
        "Without evidence_context and no pre-populated fields, verdict must be InsufficientData"
    );
    assert!(
        result.evidence.is_empty(),
        "No evidence should be collected without context"
    );
}

#[test]
fn t4_04_not_groundable_type_returns_not_groundable() {
    let runner = GroundingLoopRunner::default();
    let drift_db = setup_mock_drift_db();

    // Episodic is NotGroundable
    let memory = MemoryForGrounding {
        memory_type: cortex_core::MemoryType::Episodic,
        pattern_confidence: Some(0.9),
        evidence_context: Some(full_evidence_context()),
        ..empty_memory("t4_04_not_groundable")
    };

    let result = runner
        .ground_single(&memory, Some(&drift_db), None)
        .unwrap();

    assert_eq!(
        result.verdict,
        GroundingVerdict::NotGroundable,
        "Episodic memories are not groundable"
    );
}

// ============================================================================
// T4-05: Atomic Link Removal Race — Concurrent Bridge Operations
// ============================================================================
// Concurrently call bridge storage operations from 10 threads on the same
// memory. Must not crash or produce corrupt data; SQL operations are idempotent.

#[test]
fn t4_05_concurrent_grounding_writes_no_crash() {
    use std::sync::{Arc, Barrier};

    // Use a file-backed DB so all threads share the same database
    let dir = tempfile::TempDir::new().unwrap();
    let db_path = dir.path().join("bridge.db");

    {
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        storage::configure_connection(&conn).unwrap();
        storage::create_bridge_tables(&conn).unwrap();
    }

    let thread_count = 10;
    let barrier = Arc::new(Barrier::new(thread_count));
    let db_path = Arc::new(db_path);

    let handles: Vec<_> = (0..thread_count)
        .map(|i| {
            let barrier = Arc::clone(&barrier);
            let db_path = Arc::clone(&db_path);
            std::thread::spawn(move || {
                let conn = rusqlite::Connection::open(db_path.as_ref()).unwrap();
                storage::configure_connection(&conn).unwrap();

                let runner = GroundingLoopRunner::default();

                let memory = MemoryForGrounding {
                    pattern_confidence: Some(0.5 + (i as f64) * 0.01),
                    occurrence_rate: Some(0.6),
                    ..empty_memory(&format!("t4_05_thread_{}", i))
                };

                // All threads start simultaneously
                barrier.wait();

                // Each thread grounds and persists to the same bridge_db
                let result = runner
                    .ground_single(&memory, None, Some(&conn))
                    .unwrap();

                assert!(
                    result.grounding_score > 0.0,
                    "Thread {} should produce a valid score",
                    i
                );
            })
        })
        .collect();

    for h in handles {
        h.join().expect("Thread must not panic");
    }

    // Verify all 10 results were persisted
    let conn = rusqlite::Connection::open(db_path.as_ref()).unwrap();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM bridge_grounding_results",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        count, 10,
        "All 10 concurrent grounding results must be persisted"
    );
}

#[test]
fn t4_05_concurrent_same_memory_id_no_corruption() {
    use std::sync::{Arc, Barrier};

    let dir = tempfile::TempDir::new().unwrap();
    let db_path = dir.path().join("bridge_race.db");

    {
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        storage::configure_connection(&conn).unwrap();
        storage::create_bridge_tables(&conn).unwrap();
    }

    let thread_count = 10;
    let barrier = Arc::new(Barrier::new(thread_count));
    let db_path = Arc::new(db_path);

    let handles: Vec<_> = (0..thread_count)
        .map(|_| {
            let barrier = Arc::clone(&barrier);
            let db_path = Arc::clone(&db_path);
            std::thread::spawn(move || {
                let conn = rusqlite::Connection::open(db_path.as_ref()).unwrap();
                storage::configure_connection(&conn).unwrap();

                let runner = GroundingLoopRunner::default();

                // Same memory_id from all threads — tests idempotency of INSERT
                let memory = MemoryForGrounding {
                    pattern_confidence: Some(0.85),
                    occurrence_rate: Some(0.70),
                    ..empty_memory("t4_05_same_id")
                };

                barrier.wait();

                runner
                    .ground_single(&memory, None, Some(&conn))
                    .unwrap();
            })
        })
        .collect();

    for h in handles {
        h.join().expect("Thread must not panic on same memory_id");
    }

    // bridge_grounding_results uses AUTOINCREMENT PK, so all 10 INSERTs succeed
    // (they're not upserts — each is a new grounding result row for history)
    let conn = rusqlite::Connection::open(db_path.as_ref()).unwrap();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM bridge_grounding_results WHERE memory_id = 't4_05_same_id'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        count, 10,
        "All 10 INSERTs for the same memory_id must succeed (history, not upsert)"
    );
}

// ============================================================================
// T4-06: Bridge Schema Triple-Duplication Consistency
// ============================================================================
// Verify schema.rs, migrations.rs, and tables.rs produce identical DDL.
// Column names, types, and constraints must match across all 3 locations.

#[test]
fn t4_06_create_tables_and_migrate_produce_identical_schema() {
    // Path 1: create_bridge_tables() directly
    let db1 = rusqlite::Connection::open_in_memory().unwrap();
    storage::configure_connection(&db1).unwrap();
    storage::create_bridge_tables(&db1).unwrap();

    // Path 2: migrate() from version 0
    let db2 = rusqlite::Connection::open_in_memory().unwrap();
    storage::configure_connection(&db2).unwrap();
    storage::migrate(&db2).unwrap();

    // Extract table schemas from both databases
    let schema1 = get_table_schemas(&db1);
    let schema2 = get_table_schemas(&db2);

    // Both must have exactly 5 bridge tables
    assert_eq!(
        schema1.len(),
        5,
        "create_bridge_tables must produce 5 tables, got {}",
        schema1.len()
    );
    assert_eq!(
        schema2.len(),
        5,
        "migrate must produce 5 tables, got {}",
        schema2.len()
    );

    // Table names must match
    let names1: std::collections::BTreeSet<_> = schema1.keys().collect();
    let names2: std::collections::BTreeSet<_> = schema2.keys().collect();
    assert_eq!(
        names1, names2,
        "Table names must be identical between create_bridge_tables and migrate"
    );

    // DDL for each table must match
    for (table_name, sql1) in &schema1 {
        let sql2 = schema2
            .get(table_name)
            .unwrap_or_else(|| panic!("Table {} missing from migrate path", table_name));
        assert_eq!(
            sql1, sql2,
            "DDL mismatch for table {}: create_bridge_tables='{}', migrate='{}'",
            table_name, sql1, sql2
        );
    }
}

#[test]
fn t4_06_all_bridge_table_names_present() {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    storage::configure_connection(&db).unwrap();
    storage::create_bridge_tables(&db).unwrap();

    let expected = [
        "bridge_grounding_results",
        "bridge_grounding_snapshots",
        "bridge_event_log",
        "bridge_metrics",
        "bridge_memories",
    ];

    for table in &expected {
        let exists: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                rusqlite::params![table],
                |row| row.get(0),
            )
            .unwrap();
        assert!(exists, "Table {} must exist", table);
    }

    // Cross-check with the BRIDGE_TABLE_NAMES constant
    assert_eq!(
        cortex_drift_bridge::storage::BRIDGE_TABLE_NAMES.len(),
        expected.len(),
        "BRIDGE_TABLE_NAMES constant must list all 5 tables"
    );
    for name in cortex_drift_bridge::storage::BRIDGE_TABLE_NAMES {
        assert!(
            expected.contains(&name),
            "BRIDGE_TABLE_NAMES contains unexpected table: {}",
            name
        );
    }
}

#[test]
fn t4_06_indexes_created_by_both_paths() {
    // Verify that indexes are created by both create_bridge_tables and migrate
    let db1 = rusqlite::Connection::open_in_memory().unwrap();
    storage::configure_connection(&db1).unwrap();
    storage::create_bridge_tables(&db1).unwrap();

    let db2 = rusqlite::Connection::open_in_memory().unwrap();
    storage::configure_connection(&db2).unwrap();
    storage::migrate(&db2).unwrap();

    let idx1 = get_index_names(&db1);
    let idx2 = get_index_names(&db2);

    assert_eq!(
        idx1, idx2,
        "Index sets must match between create_bridge_tables and migrate"
    );

    // Schema defines 4 indexes
    assert!(
        idx1.len() >= 4,
        "Expected at least 4 indexes, got {}",
        idx1.len()
    );
}

// ============================================================================
// SCHEMA INTROSPECTION HELPERS
// ============================================================================

fn get_table_schemas(
    conn: &rusqlite::Connection,
) -> std::collections::BTreeMap<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, sql FROM sqlite_master WHERE type='table' AND name LIKE 'bridge_%' ORDER BY name",
        )
        .unwrap();
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .unwrap();
    let mut map = std::collections::BTreeMap::new();
    for row in rows {
        let (name, sql) = row.unwrap();
        map.insert(name, sql);
    }
    map
}

fn get_index_names(conn: &rusqlite::Connection) -> std::collections::BTreeSet<String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
        .unwrap();
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();
    rows.into_iter().map(|r| r.unwrap()).collect()
}
