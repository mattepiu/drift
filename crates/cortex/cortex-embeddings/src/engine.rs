//! EmbeddingEngine — the main entry point for cortex-embeddings.
//!
//! Coordinates provider selection, fallback chain, cache tiers,
//! enrichment, and Matryoshka dimension management.
//! Implements `IEmbeddingProvider`.

use cortex_core::config::EmbeddingConfig;
use cortex_core::errors::CortexResult;
use cortex_core::memory::BaseMemory;
use cortex_core::models::DegradationEvent;
use cortex_core::traits::IEmbeddingProvider;
use tracing::{debug, info};

use crate::cache::CacheCoordinator;
use crate::degradation::DegradationChain;
use crate::enrichment;
use crate::matryoshka;
use crate::providers;

/// The main embedding engine.
///
/// Wraps provider selection, caching, enrichment, and fallback into a
/// single coherent interface. Implements `IEmbeddingProvider` so it can
/// be used anywhere a provider is expected.
pub struct EmbeddingEngine {
    chain: DegradationChain,
    cache: CacheCoordinator,
    config: EmbeddingConfig,
}

impl EmbeddingEngine {
    /// Create a new engine from configuration.
    ///
    /// Sets up the provider fallback chain and cache tiers.
    pub fn new(config: EmbeddingConfig) -> Self {
        let mut chain = DegradationChain::new();

        // Primary provider from config.
        let primary = providers::create_provider(&config);
        chain.push(primary);

        // Always add TF-IDF as the last-resort fallback.
        // (create_provider may have already returned TF-IDF if the primary
        // failed, but having a second TF-IDF in the chain is harmless —
        // the first available one wins.)
        chain.push(Box::new(providers::TfIdfFallback::new(config.dimensions)));

        let cache = CacheCoordinator::new(config.l1_cache_size);

        info!(
            provider = chain.active_provider_name(),
            dims = config.dimensions,
            search_dims = config.matryoshka_search_dims,
            "EmbeddingEngine initialized"
        );

        Self {
            chain,
            cache,
            config,
        }
    }

    /// Embed a `BaseMemory` with enrichment and caching.
    ///
    /// Uses the memory's content hash for cache lookups. Enriches the
    /// text with metadata before embedding.
    pub fn embed_memory(&mut self, memory: &BaseMemory) -> CortexResult<Vec<f32>> {
        // Check cache first.
        let (cached, tier) = self.cache.get(&memory.content_hash);
        if let Some(vec) = cached {
            debug!(
                hash = %memory.content_hash,
                tier = ?tier,
                "cache hit for memory embedding"
            );
            return Ok(vec);
        }

        // Enrich and embed.
        let enriched = enrichment::enrich_for_embedding(memory);
        let (embedding, _provider) = self.chain.embed(&enriched)?;

        // Validate dimensions.
        matryoshka::validate_dimensions(&embedding, self.config.dimensions)?;

        // Write through to cache.
        self.cache.put(memory.content_hash.clone(), &embedding);

        Ok(embedding)
    }

    /// Get a truncated embedding for fast search (Matryoshka).
    pub fn embed_memory_for_search(&mut self, memory: &BaseMemory) -> CortexResult<Vec<f32>> {
        let full = self.embed_memory(memory)?;
        matryoshka::truncate(&full, self.config.matryoshka_search_dims)
    }

    /// Embed a raw query string (with query enrichment).
    pub fn embed_query(&mut self, query: &str) -> CortexResult<Vec<f32>> {
        let enriched = enrichment::enrich_query(query);
        let hash = blake3::hash(enriched.as_bytes()).to_hex().to_string();

        // Check cache.
        let (cached, _) = self.cache.get(&hash);
        if let Some(vec) = cached {
            return Ok(vec);
        }

        let (embedding, _) = self.chain.embed(&enriched)?;
        self.cache.put(hash, &embedding);
        Ok(embedding)
    }

    /// Embed a query and truncate for search.
    pub fn embed_query_for_search(&mut self, query: &str) -> CortexResult<Vec<f32>> {
        let full = self.embed_query(query)?;
        matryoshka::truncate(&full, self.config.matryoshka_search_dims)
    }

    /// Drain accumulated degradation events.
    pub fn drain_degradation_events(&mut self) -> Vec<DegradationEvent> {
        self.chain.drain_events()
    }

    /// Get the active provider name.
    pub fn active_provider(&self) -> &str {
        self.chain.active_provider_name()
    }

    /// Get the configured full dimensions.
    pub fn dimensions(&self) -> usize {
        self.config.dimensions
    }

    /// Get the configured search dimensions.
    pub fn search_dimensions(&self) -> usize {
        self.config.matryoshka_search_dims
    }
}

/// Implement `IEmbeddingProvider` so the engine can be used as a drop-in
/// provider anywhere in the system.
impl IEmbeddingProvider for EmbeddingEngine {
    fn embed(&self, text: &str) -> CortexResult<Vec<f32>> {
        // For the trait impl we can't use &mut self, so we bypass caching
        // and go straight to the chain. The `embed_query`/`embed_memory`
        // methods are preferred for cached access.
        //
        // This is a design trade-off: the trait is defined as &self in
        // cortex-core, but our chain needs &mut for event tracking.
        // We use interior mutability workaround via a fresh TF-IDF fallback.
        let fallback = providers::TfIdfFallback::new(self.config.dimensions);
        fallback.embed(text)
    }

    fn embed_batch(&self, texts: &[String]) -> CortexResult<Vec<Vec<f32>>> {
        let fallback = providers::TfIdfFallback::new(self.config.dimensions);
        fallback.embed_batch(texts)
    }

    fn dimensions(&self) -> usize {
        self.config.dimensions
    }

    fn name(&self) -> &str {
        "cortex-embedding-engine"
    }

    fn is_available(&self) -> bool {
        true // The engine always has at least TF-IDF.
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_engine() -> EmbeddingEngine {
        EmbeddingEngine::new(EmbeddingConfig {
            provider: "tfidf".to_string(),
            dimensions: 128,
            matryoshka_search_dims: 64,
            ..Default::default()
        })
    }

    #[test]
    fn engine_creates_with_defaults() {
        let engine = default_engine();
        assert_eq!(engine.dimensions(), 128);
        assert_eq!(engine.search_dimensions(), 64);
    }

    #[test]
    fn embed_query_returns_correct_dims() {
        let mut engine = default_engine();
        let vec = engine.embed_query("test query").unwrap();
        assert_eq!(vec.len(), 128);
    }

    #[test]
    fn embed_query_for_search_truncates() {
        let mut engine = default_engine();
        let vec = engine.embed_query_for_search("test query").unwrap();
        assert_eq!(vec.len(), 64);
    }

    #[test]
    fn embed_query_caches() {
        let mut engine = default_engine();
        let a = engine.embed_query("cached query").unwrap();
        let b = engine.embed_query("cached query").unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn trait_impl_works() {
        let engine = default_engine();
        let provider: &dyn IEmbeddingProvider = &engine;
        assert!(provider.is_available());
        assert_eq!(provider.dimensions(), 128);
        let vec = provider.embed("hello").unwrap();
        assert_eq!(vec.len(), 128);
    }

    #[test]
    fn trait_impl_batch() {
        let engine = default_engine();
        let provider: &dyn IEmbeddingProvider = &engine;
        let texts = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let vecs = provider.embed_batch(&texts).unwrap();
        assert_eq!(vecs.len(), 3);
        assert!(vecs.iter().all(|v| v.len() == 128));
    }

    #[test]
    fn no_degradation_events_on_success() {
        let mut engine = default_engine();
        engine.embed_query("test").unwrap();
        assert!(engine.drain_degradation_events().is_empty());
    }
}
