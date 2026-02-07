//! Category → MemoryType mapping.
//!
//! Maps correction categories to the appropriate memory type for storage:
//! - pattern_violation → PatternRationale
//! - tribal_miss → Tribal
//! - constraint_violation → ConstraintOverride
//! - style_preference → Preference
//! - naming_convention → Preference
//! - architecture_mismatch → Decision
//! - security_issue → Tribal (critical importance)
//! - performance_issue → CodeSmell
//! - api_misuse → Reference
//! - other → Insight

use cortex_core::memory::{Importance, MemoryType};

use super::categorizer::CorrectionCategory;

/// Mapping result: memory type + importance override.
#[derive(Debug, Clone, Copy)]
pub struct CategoryMapping {
    pub memory_type: MemoryType,
    pub importance: Importance,
}

/// Map a correction category to a memory type and importance.
pub fn map_category(category: CorrectionCategory) -> CategoryMapping {
    match category {
        CorrectionCategory::PatternViolation => CategoryMapping {
            memory_type: MemoryType::PatternRationale,
            importance: Importance::High,
        },
        CorrectionCategory::TribalMiss => CategoryMapping {
            memory_type: MemoryType::Tribal,
            importance: Importance::High,
        },
        CorrectionCategory::ConstraintViolation => CategoryMapping {
            memory_type: MemoryType::ConstraintOverride,
            importance: Importance::High,
        },
        CorrectionCategory::StylePreference => CategoryMapping {
            memory_type: MemoryType::Preference,
            importance: Importance::Normal,
        },
        CorrectionCategory::NamingConvention => CategoryMapping {
            memory_type: MemoryType::Preference,
            importance: Importance::Normal,
        },
        CorrectionCategory::ArchitectureMismatch => CategoryMapping {
            memory_type: MemoryType::Decision,
            importance: Importance::High,
        },
        CorrectionCategory::SecurityIssue => CategoryMapping {
            memory_type: MemoryType::Tribal,
            importance: Importance::Critical,
        },
        CorrectionCategory::PerformanceIssue => CategoryMapping {
            memory_type: MemoryType::CodeSmell,
            importance: Importance::Normal,
        },
        CorrectionCategory::ApiMisuse => CategoryMapping {
            memory_type: MemoryType::Reference,
            importance: Importance::Normal,
        },
        CorrectionCategory::Other => CategoryMapping {
            memory_type: MemoryType::Insight,
            importance: Importance::Normal,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn security_maps_to_tribal_critical() {
        let mapping = map_category(CorrectionCategory::SecurityIssue);
        assert_eq!(mapping.memory_type, MemoryType::Tribal);
        assert_eq!(mapping.importance, Importance::Critical);
    }

    #[test]
    fn pattern_violation_maps_to_pattern_rationale() {
        let mapping = map_category(CorrectionCategory::PatternViolation);
        assert_eq!(mapping.memory_type, MemoryType::PatternRationale);
        assert_eq!(mapping.importance, Importance::High);
    }

    #[test]
    fn performance_maps_to_code_smell() {
        let mapping = map_category(CorrectionCategory::PerformanceIssue);
        assert_eq!(mapping.memory_type, MemoryType::CodeSmell);
    }

    #[test]
    fn other_maps_to_insight() {
        let mapping = map_category(CorrectionCategory::Other);
        assert_eq!(mapping.memory_type, MemoryType::Insight);
    }

    #[test]
    fn all_categories_have_mappings() {
        for cat in CorrectionCategory::ALL {
            let mapping = map_category(cat);
            // Just verify it doesn't panic.
            let _ = mapping.memory_type;
        }
    }
}
