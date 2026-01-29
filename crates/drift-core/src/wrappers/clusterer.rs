//! Wrapper clustering
//!
//! Groups similar wrappers together based on what they wrap
//! and their characteristics.

use std::collections::HashMap;
use super::types::*;

/// Clusters similar wrappers together
pub struct WrapperClusterer;

impl WrapperClusterer {
    pub fn new() -> Self {
        Self
    }

    /// Cluster wrappers by their wrapped primitives and categories
    pub fn cluster(&self, wrappers: &[WrapperInfo]) -> Vec<WrapperCluster> {
        // Group by (category, wrapped_primitive)
        let mut groups: HashMap<(WrapperCategory, String), Vec<WrapperInfo>> = HashMap::new();
        
        for wrapper in wrappers {
            for wrapped in &wrapper.wraps {
                let key = (wrapper.category, wrapped.clone());
                groups.entry(key).or_default().push(wrapper.clone());
            }
        }
        
        // Convert to clusters
        let mut clusters: Vec<WrapperCluster> = groups.into_iter()
            .filter(|(_, group)| group.len() >= 1) // Include single wrappers too
            .map(|((category, primitive), group)| {
                let total_usage: usize = group.iter().map(|w| w.usage_count).sum();
                let avg_confidence: f32 = group.iter().map(|w| w.confidence).sum::<f32>() / group.len() as f32;
                
                let id = format!("{:?}_{}", category, primitive.replace('.', "_"));
                
                WrapperCluster {
                    id,
                    category,
                    wrapped_primitive: primitive,
                    wrappers: group,
                    confidence: avg_confidence,
                    total_usage,
                }
            })
            .collect();
        
        // Sort by total usage (most used first)
        clusters.sort_by(|a, b| b.total_usage.cmp(&a.total_usage));
        
        clusters
    }

    /// Calculate cluster confidence based on consistency
    pub fn calculate_cluster_confidence(&self, cluster: &WrapperCluster) -> f32 {
        if cluster.wrappers.is_empty() {
            return 0.0;
        }
        
        let mut confidence = cluster.confidence;
        
        // Higher confidence if multiple wrappers (pattern is established)
        if cluster.wrappers.len() >= 3 {
            confidence += 0.1;
        }
        
        // Higher confidence if high usage
        if cluster.total_usage >= 10 {
            confidence += 0.1;
        }
        
        // Higher confidence if all wrappers are exported (intentional API)
        let all_exported = cluster.wrappers.iter().all(|w| w.is_exported);
        if all_exported {
            confidence += 0.05;
        }
        
        confidence.clamp(0.0, 1.0)
    }
}

impl Default for WrapperClusterer {
    fn default() -> Self {
        Self::new()
    }
}
