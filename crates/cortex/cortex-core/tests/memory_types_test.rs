use chrono::Utc;
use cortex_core::memory::*;
use cortex_core::memory::types::*;

#[test]
fn memory_type_has_23_variants() {
    assert_eq!(MemoryType::COUNT, 23);
    assert_eq!(MemoryType::ALL.len(), 23);
}

#[test]
fn all_23_types_have_half_lives() {
    for mt in MemoryType::ALL {
        // half_life_days returns Option<u64>; None means infinite (only Core)
        let hl = half_life_days(mt);
        match mt {
            MemoryType::Core => assert!(hl.is_none(), "Core should have infinite half-life"),
            _ => assert!(hl.is_some(), "{:?} should have a finite half-life", mt),
        }
    }
}

#[test]
fn half_lives_match_spec() {
    assert_eq!(half_life_days(MemoryType::Core), None);
    assert_eq!(half_life_days(MemoryType::Tribal), Some(365));
    assert_eq!(half_life_days(MemoryType::Procedural), Some(180));
    assert_eq!(half_life_days(MemoryType::Semantic), Some(90));
    assert_eq!(half_life_days(MemoryType::Episodic), Some(7));
    assert_eq!(half_life_days(MemoryType::Decision), Some(180));
    assert_eq!(half_life_days(MemoryType::Insight), Some(90));
    assert_eq!(half_life_days(MemoryType::Reference), Some(60));
    assert_eq!(half_life_days(MemoryType::Preference), Some(120));
    assert_eq!(half_life_days(MemoryType::PatternRationale), Some(180));
    assert_eq!(half_life_days(MemoryType::ConstraintOverride), Some(90));
    assert_eq!(half_life_days(MemoryType::DecisionContext), Some(180));
    assert_eq!(half_life_days(MemoryType::CodeSmell), Some(90));
    assert_eq!(half_life_days(MemoryType::AgentSpawn), Some(365));
    assert_eq!(half_life_days(MemoryType::Entity), Some(180));
    assert_eq!(half_life_days(MemoryType::Goal), Some(90));
    assert_eq!(half_life_days(MemoryType::Feedback), Some(120));
    assert_eq!(half_life_days(MemoryType::Workflow), Some(180));
    assert_eq!(half_life_days(MemoryType::Conversation), Some(30));
    assert_eq!(half_life_days(MemoryType::Incident), Some(365));
    assert_eq!(half_life_days(MemoryType::Meeting), Some(60));
    assert_eq!(half_life_days(MemoryType::Skill), Some(180));
    assert_eq!(half_life_days(MemoryType::Environment), Some(90));
}

#[test]
fn relationship_type_has_13_variants() {
    assert_eq!(RelationshipType::COUNT, 13);
    assert_eq!(RelationshipType::ALL.len(), 13);
}

#[test]
fn importance_ordering_critical_gt_high_gt_normal_gt_low() {
    assert!(Importance::Critical > Importance::High);
    assert!(Importance::High > Importance::Normal);
    assert!(Importance::Normal > Importance::Low);
}

#[test]
fn importance_weights_match_spec() {
    assert_eq!(Importance::Low.weight(), 0.8);
    assert_eq!(Importance::Normal.weight(), 1.0);
    assert_eq!(Importance::High.weight(), 1.5);
    assert_eq!(Importance::Critical.weight(), 2.0);
}

#[test]
fn confidence_clamping_works() {
    let c = Confidence::new(1.5);
    assert_eq!(c.value(), 1.0);

    let c = Confidence::new(-0.5);
    assert_eq!(c.value(), 0.0);

    let c = Confidence::new(0.75);
    assert_eq!(c.value(), 0.75);
}

#[test]
fn confidence_arithmetic() {
    let a = Confidence::new(0.6);
    let b = Confidence::new(0.5);

    // Addition clamps
    let sum = a + b;
    assert_eq!(sum.value(), 1.0);

    // Subtraction clamps
    let diff = b - a;
    assert_eq!(diff.value(), 0.0);

    // Multiplication
    let product = a * 0.5;
    assert_eq!(product.value(), 0.3);
}

#[test]
fn confidence_thresholds() {
    assert!(Confidence::new(0.9).is_high());
    assert!(!Confidence::new(0.5).is_high());
    assert!(Confidence::new(0.1).is_archival());
    assert!(!Confidence::new(0.5).is_archival());
}

#[test]
fn content_hash_is_deterministic() {
    let content = TypedContent::Core(CoreContent {
        project_name: "test".into(),
        description: "desc".into(),
        metadata: serde_json::json!({}),
    });
    let hash1 = BaseMemory::compute_content_hash(&content);
    let hash2 = BaseMemory::compute_content_hash(&content);
    assert_eq!(hash1, hash2, "same content must produce same hash");
}

#[test]
fn content_hash_differs_for_different_content() {
    let c1 = TypedContent::Core(CoreContent {
        project_name: "a".into(),
        description: "desc".into(),
        metadata: serde_json::json!({}),
    });
    let c2 = TypedContent::Core(CoreContent {
        project_name: "b".into(),
        description: "desc".into(),
        metadata: serde_json::json!({}),
    });
    assert_ne!(
        BaseMemory::compute_content_hash(&c1),
        BaseMemory::compute_content_hash(&c2)
    );
}

#[test]
fn base_memory_serde_roundtrip() {
    let content = TypedContent::Tribal(TribalContent {
        knowledge: "Always use prepared statements".into(),
        severity: "high".into(),
        warnings: vec!["SQL injection risk".into()],
        consequences: vec!["Data breach".into()],
    });
    let now = Utc::now();
    let memory = BaseMemory {
        id: "test-id".into(),
        memory_type: MemoryType::Tribal,
        content: content.clone(),
        summary: "Use prepared statements".into(),
        transaction_time: now,
        valid_time: now,
        valid_until: None,
        confidence: Confidence::new(0.95),
        importance: Importance::High,
        last_accessed: now,
        access_count: 5,
        linked_patterns: vec![PatternLink {
            pattern_id: "p1".into(),
            pattern_name: "sql-safety".into(),
        }],
        linked_constraints: vec![],
        linked_files: vec![FileLink {
            file_path: "src/db.rs".into(),
            line_start: Some(10),
            line_end: Some(20),
            content_hash: Some("abc".into()),
        }],
        linked_functions: vec![],
        tags: vec!["security".into(), "database".into()],
        archived: false,
        superseded_by: None,
        supersedes: None,
        content_hash: BaseMemory::compute_content_hash(&content),
    };

    let json = serde_json::to_string(&memory).unwrap();
    let deserialized: BaseMemory = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.id, memory.id);
    assert_eq!(deserialized.memory_type, memory.memory_type);
    assert_eq!(deserialized.content, memory.content);
    assert_eq!(deserialized.summary, memory.summary);
    assert_eq!(deserialized.confidence.value(), memory.confidence.value());
    assert_eq!(deserialized.importance, memory.importance);
    assert_eq!(deserialized.access_count, memory.access_count);
    assert_eq!(deserialized.tags, memory.tags);
    assert_eq!(deserialized.archived, memory.archived);
    assert_eq!(deserialized.content_hash, memory.content_hash);
}

#[test]
fn memory_type_category_labels() {
    assert_eq!(MemoryType::Core.category(), "domain_agnostic");
    assert_eq!(MemoryType::PatternRationale.category(), "code_specific");
    assert_eq!(MemoryType::AgentSpawn.category(), "universal");
}
