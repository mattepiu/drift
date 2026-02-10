//! Phase 2 NAPI bindings — drift_analyze(), drift_call_graph(), drift_boundaries().

use napi_derive::napi;
use serde::{Deserialize, Serialize};

use crate::conversions::error_codes;
use crate::runtime;

/// Analysis result returned to TypeScript.
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsAnalysisResult {
    pub file: String,
    pub language: String,
    pub matches: Vec<JsPatternMatch>,
    pub analysis_time_us: f64,
}

/// A pattern match returned to TypeScript.
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsPatternMatch {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub pattern_id: String,
    pub confidence: f64,
    pub category: String,
    pub detection_method: String,
    pub matched_text: String,
    pub cwe_ids: Vec<u32>,
    pub owasp: Option<String>,
}

/// Call graph result returned to TypeScript.
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsCallGraphResult {
    pub total_functions: u32,
    pub total_edges: u32,
    pub entry_points: u32,
    pub resolution_rate: f64,
    pub build_duration_ms: f64,
}

/// Boundary detection result returned to TypeScript.
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsBoundaryResult {
    pub models: Vec<JsModelResult>,
    pub sensitive_fields: Vec<JsSensitiveField>,
    pub frameworks_detected: Vec<String>,
}

/// A model result returned to TypeScript.
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsModelResult {
    pub name: String,
    pub table_name: Option<String>,
    pub file: String,
    pub framework: String,
    pub field_count: u32,
    pub confidence: f64,
}

/// A sensitive field result returned to TypeScript.
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsSensitiveField {
    pub model_name: String,
    pub field_name: String,
    pub file: String,
    pub sensitivity: String,
    pub confidence: f64,
}

fn storage_err(e: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(format!("[{}] {e}", error_codes::STORAGE_ERROR))
}

/// Run the full analysis pipeline on the project.
///
/// Orchestrates: read tracked files → parse → detect → persist detections →
/// run pattern intelligence (with feedback store) → persist patterns.
///
/// Returns analysis results for all files.
#[napi]
pub async fn drift_analyze() -> napi::Result<Vec<JsAnalysisResult>> {
    let rt = runtime::get()?;

    // Step 1: Read tracked files from file_metadata
    let files = rt.db.with_reader(|conn| {
        drift_storage::queries::files::load_all_file_metadata(conn)
    }).map_err(storage_err)?;

    if files.is_empty() {
        return Ok(Vec::new());
    }

    // Step 2: Parse each file and run detection
    let parser_manager = drift_analysis::parsers::ParserManager::new();
    let detection_engine = drift_analysis::engine::DetectionEngine::new(
        drift_analysis::engine::VisitorRegistry::new(),
    );
    let mut analysis_pipeline = drift_analysis::engine::AnalysisPipeline::with_engine(
        detection_engine,
    );

    let mut all_results: Vec<JsAnalysisResult> = Vec::new();
    let mut all_matches: Vec<drift_analysis::engine::types::PatternMatch> = Vec::new();
    let mut detection_rows: Vec<drift_storage::batch::commands::DetectionRow> = Vec::new();
    let mut function_rows: Vec<drift_storage::batch::commands::FunctionRow> = Vec::new();
    let mut all_parse_results: Vec<drift_analysis::parsers::ParseResult> = Vec::new();

    let project_root = rt.project_root.as_deref();

    for file_meta in &files {
        let file_path = if let Some(root) = project_root {
            root.join(&file_meta.path)
        } else {
            std::path::PathBuf::from(&file_meta.path)
        };

        // Skip files without a known language
        if file_meta.language.is_none() {
            continue;
        }

        let lang = match drift_analysis::scanner::language_detect::Language::from_extension(
            file_path.extension().and_then(|e| e.to_str()),
        ) {
            Some(l) => l,
            None => continue,
        };

        // Read file from disk
        let source = match std::fs::read(&file_path) {
            Ok(s) => s,
            Err(_) => continue, // File may have been deleted since scan
        };

        // Single parse: get both ParseResult and tree-sitter Tree
        let (parse_result, tree) = match parser_manager.parse_returning_tree(&source, &file_path) {
            Ok(pair) => pair,
            Err(_) => continue,
        };

        // Run the 4-phase analysis pipeline
        let mut resolution_index = drift_analysis::engine::ResolutionIndex::new();
        let result = analysis_pipeline.analyze_file(
            &parse_result,
            &source,
            &tree,
            &mut resolution_index,
        );

        // Collect parse results for cross-file analyses (boundaries, call graph)
        all_parse_results.push(parse_result.clone());

        // Collect matches for pattern intelligence
        all_matches.extend(result.matches.iter().cloned());

        // Convert to detection rows for batch persistence
        for m in &result.matches {
            detection_rows.push(drift_storage::batch::commands::DetectionRow {
                file: m.file.clone(),
                line: m.line as i64,
                column_num: m.column as i64,
                pattern_id: m.pattern_id.clone(),
                category: format!("{:?}", m.category),
                confidence: m.confidence as f64,
                detection_method: format!("{:?}", m.detection_method),
                cwe_ids: if m.cwe_ids.is_empty() {
                    None
                } else {
                    Some(m.cwe_ids.iter().map(|c| c.to_string()).collect::<Vec<_>>().join(","))
                },
                owasp: m.owasp.clone(),
                matched_text: Some(m.matched_text.clone()),
            });
        }

        // Convert parsed functions to function rows
        for func in &parse_result.functions {
            function_rows.push(drift_storage::batch::commands::FunctionRow {
                file: parse_result.file.clone(),
                name: func.name.clone(),
                qualified_name: func.qualified_name.clone(),
                language: lang.name().to_string(),
                line: func.line as i64,
                end_line: func.end_line as i64,
                parameter_count: func.parameters.len() as i64,
                return_type: func.return_type.clone(),
                is_exported: func.is_exported,
                is_async: func.is_async,
                body_hash: func.body_hash.to_le_bytes().to_vec(),
                signature_hash: func.signature_hash.to_le_bytes().to_vec(),
            });
        }

        // Build JS result
        let js_matches: Vec<JsPatternMatch> = result
            .matches
            .iter()
            .map(|m| JsPatternMatch {
                file: m.file.clone(),
                line: m.line,
                column: m.column,
                pattern_id: m.pattern_id.clone(),
                confidence: m.confidence as f64,
                category: format!("{:?}", m.category),
                detection_method: format!("{:?}", m.detection_method),
                matched_text: m.matched_text.clone(),
                cwe_ids: m.cwe_ids.to_vec(),
                owasp: m.owasp.clone(),
            })
            .collect();

        all_results.push(JsAnalysisResult {
            file: file_meta.path.clone(),
            language: lang.name().to_string(),
            matches: js_matches,
            analysis_time_us: result.analysis_time_us as f64,
        });
    }

    // Step 3: Persist detections and functions via BatchWriter
    if !detection_rows.is_empty() {
        rt.batch_writer.send(
            drift_storage::batch::commands::BatchCommand::InsertDetections(detection_rows),
        ).map_err(storage_err)?;
    }
    if !function_rows.is_empty() {
        rt.batch_writer.send(
            drift_storage::batch::commands::BatchCommand::InsertFunctions(function_rows),
        ).map_err(storage_err)?;
    }

    // Step 3b: Run cross-file analyses (boundary detection, call graph)
    if !all_parse_results.is_empty() {
        // Boundary detection → persist boundary rows
        let boundary_detector = drift_analysis::boundaries::BoundaryDetector::new();
        if let Ok(boundary_result) = boundary_detector.detect(&all_parse_results) {
            let mut boundary_rows: Vec<drift_storage::batch::commands::BoundaryRow> = Vec::new();

            for model in &boundary_result.models {
                // One row per model (no field)
                boundary_rows.push(drift_storage::batch::commands::BoundaryRow {
                    file: model.file.clone(),
                    framework: format!("{:?}", model.framework),
                    model_name: model.name.clone(),
                    table_name: model.table_name.clone(),
                    field_name: None,
                    sensitivity: None,
                    confidence: model.confidence as f64,
                });
            }

            for sf in &boundary_result.sensitive_fields {
                boundary_rows.push(drift_storage::batch::commands::BoundaryRow {
                    file: sf.file.clone(),
                    framework: String::new(),
                    model_name: sf.model_name.clone(),
                    table_name: None,
                    field_name: Some(sf.field_name.clone()),
                    sensitivity: Some(sf.sensitivity.name().to_string()),
                    confidence: sf.confidence as f64,
                });
            }

            if !boundary_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertBoundaries(boundary_rows),
                ).map_err(storage_err)?;
            }
        }

        // Call graph building → persist call edges
        let cg_builder = drift_analysis::call_graph::CallGraphBuilder::new();
        if let Ok((call_graph, _stats)) = cg_builder.build(&all_parse_results) {
            use petgraph::visit::{EdgeRef, IntoEdgeReferences};
            let call_edge_rows: Vec<drift_storage::batch::commands::CallEdgeRow> = call_graph
                .graph
                .edge_references()
                .map(|e: petgraph::stable_graph::EdgeReference<'_, drift_analysis::call_graph::CallEdge>| {
                    let edge = e.weight();
                    drift_storage::batch::commands::CallEdgeRow {
                        caller_id: e.source().index() as i64,
                        callee_id: e.target().index() as i64,
                        resolution: edge.resolution.name().to_string(),
                        confidence: edge.confidence as f64,
                        call_site_line: edge.call_site_line as i64,
                    }
                })
                .collect();

            if !call_edge_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertCallEdges(call_edge_rows),
                ).map_err(storage_err)?;
            }
        }
    }

    // Step 4: Run pattern intelligence pipeline (with feedback store for closed-loop)
    if !all_matches.is_empty() {
        let feedback_store = crate::feedback_store::DbFeedbackStore::new(rt.clone());
        let mut pattern_pipeline = drift_analysis::patterns::pipeline::PatternIntelligencePipeline::new()
            .with_feedback_store(Box::new(feedback_store));

        let total_files = files.len() as u64;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let pi_result = pattern_pipeline.run(&all_matches, total_files, now, None);

        // Persist pattern confidence scores
        let confidence_rows: Vec<drift_storage::batch::commands::PatternConfidenceRow> = pi_result
            .scores
            .iter()
            .map(|(pid, score)| drift_storage::batch::commands::PatternConfidenceRow {
                pattern_id: pid.clone(),
                alpha: score.alpha,
                beta: score.beta,
                posterior_mean: score.posterior_mean,
                credible_interval_low: score.credible_interval.0,
                credible_interval_high: score.credible_interval.1,
                tier: format!("{:?}", score.tier),
                momentum: format!("{:?}", score.momentum),
            })
            .collect();

        if !confidence_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertPatternConfidence(confidence_rows),
            ).map_err(storage_err)?;
        }

        // PH2-10: Persist outlier file/line from source detection matches
        let mut outlier_rows: Vec<drift_storage::batch::commands::OutlierDetectionRow> = Vec::new();
        for (pid, outliers) in &pi_result.outliers {
            // Find source detections for this pattern to extract file/line
            let pattern_matches: Vec<&drift_analysis::engine::types::PatternMatch> = all_matches
                .iter()
                .filter(|m| &m.pattern_id == pid)
                .collect();

            for o in outliers {
                // Use the outlier index to look up the source detection, fallback to first match
                let source = pattern_matches.get(o.index).or_else(|| pattern_matches.first());
                let (file, line) = match source {
                    Some(m) => (m.file.clone(), m.line as i64),
                    None => (String::new(), 0),
                };
                outlier_rows.push(drift_storage::batch::commands::OutlierDetectionRow {
                    pattern_id: pid.clone(),
                    file,
                    line,
                    deviation_score: o.deviation_score.value(),
                    significance: format!("{:?}", o.significance),
                    method: format!("{:?}", o.method),
                });
            }
        }
        if !outlier_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertOutliers(outlier_rows),
            ).map_err(storage_err)?;
        }

        // Persist conventions
        let convention_rows: Vec<drift_storage::batch::commands::ConventionInsertRow> = pi_result
            .conventions
            .iter()
            .map(|c| drift_storage::batch::commands::ConventionInsertRow {
                pattern_id: c.pattern_id.clone(),
                category: format!("{:?}", c.category),
                scope: c.scope.to_string(),
                dominance_ratio: c.dominance_ratio,
                promotion_status: format!("{:?}", c.promotion_status),
                discovered_at: c.discovery_date as i64,
                last_seen: c.last_seen as i64,
                expires_at: None,
            })
            .collect();

        if !convention_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertConventions(convention_rows),
            ).map_err(storage_err)?;
        }
    }

    // Step 5: Structural analysis — coupling, wrappers, crypto, constraints
    if !all_parse_results.is_empty() {
        // 5a: Coupling analysis → coupling_metrics + coupling_cycles tables
        let import_graph = drift_analysis::structural::coupling::ImportGraphBuilder::from_parse_results(
            &all_parse_results, 2,
        );
        let coupling_metrics = drift_analysis::structural::coupling::compute_martin_metrics(&import_graph);
        let coupling_rows: Vec<drift_storage::batch::commands::CouplingMetricInsertRow> = coupling_metrics
            .iter()
            .map(|m| drift_storage::batch::commands::CouplingMetricInsertRow {
                module: m.module.clone(),
                ce: m.ce as i64,
                ca: m.ca as i64,
                instability: m.instability,
                abstractness: m.abstractness,
                distance: m.distance,
                zone: format!("{:?}", m.zone),
            })
            .collect();
        if !coupling_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertCouplingMetrics(coupling_rows),
            ).map_err(storage_err)?;
        }

        let cycles = drift_analysis::structural::coupling::detect_cycles(&import_graph);
        let cycle_rows: Vec<drift_storage::batch::commands::CouplingCycleInsertRow> = cycles
            .iter()
            .map(|c| drift_storage::batch::commands::CouplingCycleInsertRow {
                members: serde_json::to_string(&c.members).unwrap_or_default(),
                break_suggestions: serde_json::to_string(&c.break_suggestions).unwrap_or_default(),
            })
            .collect();
        if !cycle_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertCouplingCycles(cycle_rows),
            ).map_err(storage_err)?;
        }

        // 5b: Wrapper detection → wrappers table
        let wrapper_detector = drift_analysis::structural::wrappers::WrapperDetector::new();
        let mut wrapper_rows: Vec<drift_storage::batch::commands::WrapperInsertRow> = Vec::new();
        for pr in &all_parse_results {
            if let Ok(content) = std::fs::read_to_string(&pr.file) {
                let wrappers = wrapper_detector.detect(&content, &pr.file);
                for w in &wrappers {
                    let confidence = drift_analysis::structural::wrappers::confidence::compute_confidence(w, &content);
                    let multi = drift_analysis::structural::wrappers::multi_primitive::analyze_multi_primitive(w);
                    wrapper_rows.push(drift_storage::batch::commands::WrapperInsertRow {
                        name: w.name.clone(),
                        file: w.file.clone(),
                        line: w.line,
                        category: format!("{:?}", w.category),
                        wrapped_primitives: serde_json::to_string(&w.wrapped_primitives).unwrap_or_default(),
                        framework: w.framework.clone(),
                        confidence,
                        is_multi_primitive: multi.is_composite,
                        is_exported: w.is_exported,
                        usage_count: w.usage_count,
                    });
                }
            }
        }
        if !wrapper_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertWrappers(wrapper_rows),
            ).map_err(storage_err)?;
        }

        // 5c: Crypto detection → crypto_findings table
        let crypto_detector = drift_analysis::structural::crypto::CryptoDetector::new();
        let mut crypto_rows: Vec<drift_storage::batch::commands::CryptoFindingInsertRow> = Vec::new();
        for pr in &all_parse_results {
            if let Ok(content) = std::fs::read_to_string(&pr.file) {
                let lang = format!("{:?}", pr.language).to_lowercase();
                let mut findings = crypto_detector.detect(&content, &pr.file, &lang);
                drift_analysis::structural::crypto::confidence::compute_confidence_batch(&mut findings, &content);
                for f in &findings {
                    crypto_rows.push(drift_storage::batch::commands::CryptoFindingInsertRow {
                        file: f.file.clone(),
                        line: f.line,
                        category: format!("{:?}", f.category),
                        description: f.description.clone(),
                        code: f.code.clone(),
                        confidence: f.confidence,
                        cwe_id: f.cwe_id,
                        owasp: f.owasp.clone(),
                        remediation: f.remediation.clone(),
                        language: lang.clone(),
                    });
                }
            }
        }
        if !crypto_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertCryptoFindings(crypto_rows),
            ).map_err(storage_err)?;
        }

        // 5d: DNA profiling → dna_genes + dna_mutations tables
        let dna_registry = drift_analysis::structural::dna::extractor::GeneExtractorRegistry::with_all_extractors();
        let mut all_gene_rows: Vec<drift_storage::batch::commands::DnaGeneInsertRow> = Vec::new();
        let mut all_mutation_rows: Vec<drift_storage::batch::commands::DnaMutationInsertRow> = Vec::new();
        let mut built_genes: Vec<drift_analysis::structural::dna::types::Gene> = Vec::new();

        // Extract genes: run each extractor across all files, build gene from results
        for extractor in dna_registry.extractors() {
            let mut file_results = Vec::new();
            for pr in &all_parse_results {
                if let Ok(content) = std::fs::read_to_string(&pr.file) {
                    let result = extractor.extract_from_file(&content, &pr.file);
                    file_results.push(result);
                }
            }
            let gene = extractor.build_gene(&file_results);
            if !gene.alleles.is_empty() {
                all_gene_rows.push(drift_storage::batch::commands::DnaGeneInsertRow {
                    gene_id: format!("{:?}", gene.id),
                    name: gene.name.clone(),
                    description: gene.description.clone(),
                    dominant_allele: gene.dominant.as_ref().map(|a| a.name.clone()),
                    alleles: serde_json::to_string(&gene.alleles).unwrap_or_default(),
                    confidence: gene.confidence,
                    consistency: gene.consistency,
                    exemplars: serde_json::to_string(&gene.exemplars).unwrap_or_default(),
                });
                built_genes.push(gene);
            }
        }

        // Detect mutations from the built genes (reuse — no double extraction)
        if !built_genes.is_empty() {
            let now_ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            let mutations = drift_analysis::structural::dna::mutations::detect_mutations(&built_genes, now_ts);
            for m in &mutations {
                all_mutation_rows.push(drift_storage::batch::commands::DnaMutationInsertRow {
                    id: m.id.clone(),
                    file: m.file.clone(),
                    line: m.line,
                    gene_id: format!("{:?}", m.gene),
                    expected: m.expected.clone(),
                    actual: m.actual.clone(),
                    impact: format!("{:?}", m.impact),
                    code: m.code.clone(),
                    suggestion: m.suggestion.clone(),
                    detected_at: now_ts,
                });
            }
        }

        if !all_gene_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertDnaGenes(all_gene_rows),
            ).map_err(storage_err)?;
        }
        if !all_mutation_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertDnaMutations(all_mutation_rows),
            ).map_err(storage_err)?;
        }

        // 5e: Secrets detection → secrets table
        let mut secret_rows: Vec<drift_storage::batch::commands::SecretInsertRow> = Vec::new();
        for pr in &all_parse_results {
            if let Ok(content) = std::fs::read_to_string(&pr.file) {
                let secrets = drift_analysis::structural::constants::secrets::detect_secrets(&content, &pr.file);
                for s in &secrets {
                    secret_rows.push(drift_storage::batch::commands::SecretInsertRow {
                        pattern_name: s.pattern_name.clone(),
                        redacted_value: s.redacted_value.clone(),
                        file: s.file.clone(),
                        line: s.line,
                        severity: format!("{:?}", s.severity),
                        entropy: s.entropy,
                        confidence: s.confidence,
                        cwe_ids: serde_json::to_string(&s.cwe_ids).unwrap_or_default(),
                    });
                }
            }
        }
        if !secret_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertSecrets(secret_rows),
            ).map_err(storage_err)?;
        }

        // 5f: Constants & magic numbers → constants table
        let mut constant_rows: Vec<drift_storage::batch::commands::ConstantInsertRow> = Vec::new();
        for pr in &all_parse_results {
            if let Ok(content) = std::fs::read_to_string(&pr.file) {
                let lang = format!("{:?}", pr.language).to_lowercase();
                let magic_numbers = drift_analysis::structural::constants::magic_numbers::detect_magic_numbers(&content, &pr.file, &lang);
                for mn in &magic_numbers {
                    constant_rows.push(drift_storage::batch::commands::ConstantInsertRow {
                        name: mn.suggested_name.clone().unwrap_or_else(|| mn.value.to_string()),
                        value: mn.value.to_string(),
                        file: mn.file.clone(),
                        line: mn.line as i64,
                        is_used: true,
                        language: lang.clone(),
                        is_named: mn.suggested_name.is_some(),
                    });
                }
            }
        }
        if !constant_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertConstants(constant_rows),
            ).map_err(storage_err)?;
        }

        // 5g: Constraint verification → constraint_verifications table
        let constraint_rows = rt.db.with_reader(|conn| {
            drift_storage::queries::structural::get_enabled_constraints(conn)
        }).unwrap_or_default();

        if !constraint_rows.is_empty() {
            // Populate the invariant detector from parse results
            let mut inv_detector = drift_analysis::structural::constraints::detector::InvariantDetector::new();
            for pr in &all_parse_results {
                let funcs: Vec<drift_analysis::structural::constraints::detector::FunctionInfo> = pr.functions.iter().map(|f| {
                    drift_analysis::structural::constraints::detector::FunctionInfo {
                        name: f.name.clone(),
                        line: f.line,
                        is_exported: f.is_exported,
                    }
                }).collect();
                let imports: Vec<String> = pr.imports.iter().map(|i| i.source.clone()).collect();
                let line_count = std::fs::read_to_string(&pr.file)
                    .map(|c| c.lines().count() as u32)
                    .unwrap_or(0);
                inv_detector.add_file(&pr.file, funcs, imports, line_count);
            }

            // Build store + verifier, run, persist results
            let mut store = drift_analysis::structural::constraints::store::ConstraintStore::new();
            for cr in &constraint_rows {
                store.add(drift_analysis::structural::constraints::types::Constraint {
                    id: cr.id.clone(),
                    description: cr.description.clone(),
                    invariant_type: serde_json::from_str(&format!("\"{}\"", cr.invariant_type))
                        .unwrap_or(drift_analysis::structural::constraints::types::InvariantType::MustExist),
                    target: cr.target.clone(),
                    scope: cr.scope.clone(),
                    source: drift_analysis::structural::constraints::types::ConstraintSource::Manual,
                    enabled: cr.enabled,
                });
            }

            let verifier = drift_analysis::structural::constraints::verifier::ConstraintVerifier::new(&store, &inv_detector);
            if let Ok(results) = verifier.verify_all() {
                // Flush batch writer first so constraint_verifications insert sees a clean state
                rt.batch_writer.flush().map_err(storage_err)?;

                rt.db.with_writer(|conn| {
                    for vr in &results {
                        let violations_json = serde_json::to_string(&vr.violations).unwrap_or_default();
                        let _ = drift_storage::queries::structural::insert_constraint_verification(
                            conn, &vr.constraint_id, vr.passed, &violations_json,
                        );
                    }
                    Ok(())
                }).map_err(storage_err)?;
            }
        }

        // 5h: Environment variable extraction → env_variables table
        let mut env_rows: Vec<drift_storage::batch::commands::EnvVariableInsertRow> = Vec::new();
        for pr in &all_parse_results {
            if let Ok(content) = std::fs::read_to_string(&pr.file) {
                let lang = format!("{:?}", pr.language).to_lowercase();
                let env_refs = drift_analysis::structural::constants::env_extraction::extract_env_references(&content, &pr.file, &lang);
                for ev in &env_refs {
                    env_rows.push(drift_storage::batch::commands::EnvVariableInsertRow {
                        name: ev.name.clone(),
                        file: ev.file.clone(),
                        line: ev.line as i64,
                        access_method: ev.access_method.clone(),
                        has_default: ev.has_default,
                        defined_in_env: ev.defined_in_env,
                        framework_prefix: ev.framework_prefix.clone(),
                    });
                }
            }
        }
        if !env_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertEnvVariables(env_rows),
            ).map_err(storage_err)?;
        }

        // 5i: Data access tracking → data_access table (from DataAccess-category detections)
        let mut da_rows: Vec<drift_storage::batch::commands::DataAccessInsertRow> = Vec::new();
        for m in &all_matches {
            if format!("{:?}", m.category) == "DataAccess" {
                // Extract operation and table from matched_text (e.g. "ORM call: findAll", "raw query: db.query")
                let operation = if m.pattern_id.starts_with("DA-RAW") {
                    "raw_query"
                } else if m.pattern_id.starts_with("DA-REPO") {
                    "repository"
                } else {
                    "orm"
                };
                // Use line as a proxy function_id (actual function_id requires join with functions table)
                da_rows.push(drift_storage::batch::commands::DataAccessInsertRow {
                    function_id: m.line as i64,
                    table_name: m.matched_text.clone(),
                    operation: operation.to_string(),
                    framework: None,
                    line: m.line as i64,
                    confidence: m.confidence as f64,
                });
            }
        }
        if !da_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertDataAccess(da_rows),
            ).map_err(storage_err)?;
        }

        // 5j: OWASP findings → owasp_findings table (enriched from detections with CWE/OWASP data)
        let mut owasp_rows: Vec<drift_storage::batch::commands::OwaspFindingInsertRow> = Vec::new();
        let mut owasp_counter: u64 = 0;
        for m in &all_matches {
            let has_cwe = !m.cwe_ids.is_empty();
            let has_owasp = m.owasp.is_some();
            if has_cwe || has_owasp {
                owasp_counter += 1;
                let cwes_json = if has_cwe {
                    serde_json::to_string(&m.cwe_ids.iter().map(|c| c.to_string()).collect::<Vec<_>>()).unwrap_or_default()
                } else {
                    "[]".to_string()
                };
                let owasp_cats = m.owasp.clone().unwrap_or_default();
                owasp_rows.push(drift_storage::batch::commands::OwaspFindingInsertRow {
                    id: format!("owasp-{}-{}-{}", m.file.replace('/', "-"), m.line, owasp_counter),
                    detector: m.pattern_id.clone(),
                    file: m.file.clone(),
                    line: m.line as i64,
                    description: m.matched_text.clone(),
                    severity: m.confidence as f64,
                    cwes: cwes_json,
                    owasp_categories: owasp_cats,
                    confidence: m.confidence as f64,
                    remediation: None,
                });
            }
        }
        if !owasp_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertOwaspFindings(owasp_rows),
            ).map_err(storage_err)?;
        }

        // 5k: Decomposition analysis → decomposition_decisions table
        {
            // Build DecompositionInput from parse results and call graph
            let decomp_files: Vec<drift_analysis::structural::decomposition::decomposer::FileEntry> =
                all_parse_results.iter().map(|pr| {
                    let line_count = std::fs::read_to_string(&pr.file)
                        .map(|c| c.lines().count() as u64)
                        .unwrap_or(0);
                    drift_analysis::structural::decomposition::decomposer::FileEntry {
                        path: pr.file.clone(),
                        line_count,
                        language: format!("{:?}", pr.language).to_lowercase(),
                    }
                }).collect();

            let decomp_functions: Vec<(String, String, bool)> = all_parse_results.iter()
                .flat_map(|pr| {
                    pr.functions.iter().map(move |f| (pr.file.clone(), f.name.clone(), f.is_exported))
                })
                .collect();

            // PH2-11: Build call_edges from parse results' call sites
            let decomp_call_edges: Vec<(String, String, String)> = all_parse_results.iter()
                .flat_map(|pr| {
                    pr.call_sites.iter().filter_map(move |cs| {
                        cs.receiver.as_ref().map(|_| {
                            (pr.file.clone(), cs.callee_name.clone(), cs.callee_name.clone())
                        })
                    })
                })
                .collect();

            // PH2-11: Build data_access from DataAccess-category detection matches
            let decomp_data_access: Vec<(String, String, String)> = all_matches.iter()
                .filter(|m| format!("{:?}", m.category) == "DataAccess")
                .map(|m| {
                    let operation = if m.pattern_id.starts_with("DA-RAW") { "raw" } else { "orm" };
                    (m.file.clone(), m.pattern_id.clone(), operation.to_string())
                })
                .collect();

            let decomp_input = drift_analysis::structural::decomposition::decomposer::DecompositionInput {
                files: decomp_files,
                call_edges: decomp_call_edges,
                data_access: decomp_data_access,
                functions: decomp_functions,
            };

            let modules = drift_analysis::structural::decomposition::decomposer::decompose_with_priors(
                &decomp_input, &[],
            );

            // Persist applied priors as decomposition decisions
            let mut decision_rows: Vec<drift_storage::batch::commands::DecompositionDecisionInsertRow> = Vec::new();
            for module in &modules {
                for prior in &module.applied_priors {
                    decision_rows.push(drift_storage::batch::commands::DecompositionDecisionInsertRow {
                        dna_profile_hash: module.name.clone(),
                        adjustment: serde_json::to_string(&prior.adjustment).unwrap_or_default(),
                        confidence: prior.applied_weight,
                        dna_similarity: prior.applied_weight,
                        narrative: prior.narrative.clone(),
                        source_dna_hash: prior.source_dna_hash.clone(),
                        applied_weight: prior.applied_weight,
                    });
                }
            }
            if !decision_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertDecompositionDecisions(decision_rows),
                ).map_err(storage_err)?;
            }
        }

        // 5l: Contract extraction → contracts + contract_mismatches tables
        {
            use drift_analysis::structural::contracts::extractors::ExtractorRegistry;
            use drift_analysis::structural::contracts::matching::match_contracts;

            let contract_registry = ExtractorRegistry::new();
            let mut contract_rows: Vec<drift_storage::batch::commands::ContractInsertRow> = Vec::new();
            let mut all_contract_endpoints: Vec<(String, drift_analysis::structural::contracts::types::Endpoint)> = Vec::new();

            for pr in &all_parse_results {
                if let Ok(content) = std::fs::read_to_string(&pr.file) {
                    let results = contract_registry.extract_all_with_context(
                        &content, &pr.file, Some(pr),
                    );
                    for (framework, endpoints) in &results {
                        if !endpoints.is_empty() {
                            let endpoints_json = serde_json::to_string(
                                &endpoints.iter().map(|ep| {
                                    serde_json::json!({
                                        "method": ep.method,
                                        "path": ep.path,
                                        "line": ep.line,
                                        "request_fields": ep.request_fields.len(),
                                        "response_fields": ep.response_fields.len(),
                                    })
                                }).collect::<Vec<_>>()
                            ).unwrap_or_default();

                            let paradigm = match framework.as_str() {
                                "trpc" => "rpc",
                                "frontend" => "frontend",
                                _ => "rest",
                            };
                            let field_count: usize = endpoints.iter()
                                .map(|ep| ep.request_fields.len() + ep.response_fields.len())
                                .sum();
                            let confidence = if field_count > 0 { 0.9 } else { 0.6 };
                            contract_rows.push(drift_storage::batch::commands::ContractInsertRow {
                                id: format!("{}:{}", pr.file, framework),
                                paradigm: paradigm.to_string(),
                                source_file: pr.file.clone(),
                                framework: framework.clone(),
                                confidence,
                                endpoints: endpoints_json,
                            });
                        }
                        for ep in endpoints {
                            all_contract_endpoints.push((framework.clone(), ep.clone()));
                        }
                    }
                }
            }

            if !contract_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertContracts(contract_rows),
                ).map_err(storage_err)?;
            }

            // Run BE↔FE matching
            let backend_frameworks = ["express", "fastify", "nestjs", "spring", "flask", "django", "rails", "laravel", "gin", "actix", "aspnet", "nextjs"];
            let frontend_frameworks = ["frontend"];
            let backend_eps: Vec<drift_analysis::structural::contracts::types::Endpoint> = all_contract_endpoints.iter()
                .filter(|(fw, _)| backend_frameworks.contains(&fw.as_str()))
                .map(|(_, ep)| ep.clone())
                .collect();
            let frontend_eps: Vec<drift_analysis::structural::contracts::types::Endpoint> = all_contract_endpoints.iter()
                .filter(|(fw, _)| frontend_frameworks.contains(&fw.as_str()))
                .map(|(_, ep)| ep.clone())
                .collect();

            let contract_matches = match_contracts(&backend_eps, &frontend_eps);
            let mismatch_rows: Vec<drift_storage::batch::commands::ContractMismatchInsertRow> = contract_matches.iter()
                .flat_map(|m| m.mismatches.iter().map(|mm| {
                    drift_storage::batch::commands::ContractMismatchInsertRow {
                        backend_endpoint: mm.backend_endpoint.clone(),
                        frontend_call: mm.frontend_call.clone(),
                        mismatch_type: format!("{:?}", mm.mismatch_type),
                        severity: format!("{:?}", mm.severity),
                        message: mm.message.clone(),
                    }
                }))
                .collect();

            if !mismatch_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertContractMismatches(mismatch_rows),
                ).map_err(storage_err)?;
            }
        }
    }

    // Step 6: Graph intelligence — taint, error handling, impact, test topology
    if !all_parse_results.is_empty() {
        // Re-build call graph (or reuse from Step 3b if we stored it)
        let cg_builder = drift_analysis::call_graph::CallGraphBuilder::new();
        let call_graph_result = cg_builder.build(&all_parse_results);

        if let Ok((ref call_graph, ref _cg_stats)) = call_graph_result {
            // 6a: Taint analysis → taint_flows table
            let taint_registry = drift_analysis::graph::taint::TaintRegistry::with_defaults();

            // Phase 1: intraprocedural (per-file)
            let mut all_taint_flows = Vec::new();
            for pr in &all_parse_results {
                let intra_flows = drift_analysis::graph::taint::analyze_intraprocedural(pr, &taint_registry);
                all_taint_flows.extend(intra_flows);
            }
            // Phase 2: interprocedural (cross-function via call graph)
            if let Ok(inter_flows) = drift_analysis::graph::taint::analyze_interprocedural(
                call_graph, &all_parse_results, &taint_registry, None,
            ) {
                all_taint_flows.extend(inter_flows);
            }

            let taint_rows: Vec<drift_storage::batch::commands::TaintFlowInsertRow> = all_taint_flows
                .iter()
                .map(|f| drift_storage::batch::commands::TaintFlowInsertRow {
                    source_file: f.source.file.clone(),
                    source_line: f.source.line as i64,
                    source_type: f.source.source_type.name().to_string(),
                    sink_file: f.sink.file.clone(),
                    sink_line: f.sink.line as i64,
                    sink_type: f.sink.sink_type.name().to_string(),
                    cwe_id: f.cwe_id.map(|c| c as i64),
                    is_sanitized: f.is_sanitized,
                    path: serde_json::to_string(&f.path.iter().map(|h| &h.function).collect::<Vec<_>>()).unwrap_or_default(),
                    confidence: f.confidence as f64,
                })
                .collect();
            if !taint_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertTaintFlows(taint_rows),
                ).map_err(storage_err)?;
            }

            // 6b: Error handling analysis → error_gaps table
            let handlers = drift_analysis::graph::error_handling::handler_detection::detect_handlers(&all_parse_results);
            let chains = drift_analysis::graph::error_handling::propagation::trace_propagation(
                call_graph, &all_parse_results, &handlers,
            );
            let gaps = drift_analysis::graph::error_handling::gap_analysis::analyze_gaps(
                &handlers, &chains, &all_parse_results,
            );

            let gap_rows: Vec<drift_storage::batch::commands::ErrorGapInsertRow> = gaps
                .iter()
                .map(|g| {
                    let cwe = drift_analysis::graph::error_handling::cwe_mapping::map_to_cwe(g);
                    drift_storage::batch::commands::ErrorGapInsertRow {
                        file: g.file.clone(),
                        function_id: g.function.clone(),
                        gap_type: g.gap_type.name().to_string(),
                        error_type: g.error_type.clone(),
                        propagation_chain: None,
                        framework: g.framework.clone(),
                        cwe_id: Some(cwe.cwe_id as i64),
                        severity: drift_analysis::graph::error_handling::cwe_mapping::gap_severity(g.gap_type).name().to_string(),
                    }
                })
                .collect();
            if !gap_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertErrorGaps(gap_rows),
                ).map_err(storage_err)?;
            }

            // 6c: Impact analysis → impact_scores table
            let blast_radii = drift_analysis::graph::impact::blast_radius::compute_all_blast_radii(call_graph);
            let dead_code = drift_analysis::graph::impact::dead_code::detect_dead_code(call_graph);

            let mut impact_rows: Vec<drift_storage::batch::commands::ImpactScoreInsertRow> = Vec::new();

            // Add blast radius entries
            for br in &blast_radii {
                let node = &call_graph.graph[br.function_id];
                let key = format!("{}::{}", node.file, node.name);
                impact_rows.push(drift_storage::batch::commands::ImpactScoreInsertRow {
                    function_id: key,
                    blast_radius: br.caller_count as i64,
                    risk_score: br.risk_score.overall as f64,
                    is_dead_code: false,
                    dead_code_reason: None,
                    exclusion_category: None,
                });
            }
            // Update entries that are dead code
            for dc in &dead_code {
                let node = &call_graph.graph[dc.function_id];
                let key = format!("{}::{}", node.file, node.name);
                // Find existing entry or create new
                if let Some(existing) = impact_rows.iter_mut().find(|r| r.function_id == key) {
                    existing.is_dead_code = true;
                    existing.dead_code_reason = Some(format!("{:?}", dc.reason));
                    existing.exclusion_category = dc.exclusion.as_ref().map(|e| format!("{:?}", e));
                } else {
                    impact_rows.push(drift_storage::batch::commands::ImpactScoreInsertRow {
                        function_id: key,
                        blast_radius: 0,
                        risk_score: 0.0,
                        is_dead_code: true,
                        dead_code_reason: Some(format!("{:?}", dc.reason)),
                        exclusion_category: dc.exclusion.as_ref().map(|e| format!("{:?}", e)),
                    });
                }
            }
            if !impact_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertImpactScores(impact_rows),
                ).map_err(storage_err)?;
            }

            // 6d: Test topology → test_quality table
            let quality_score = drift_analysis::graph::test_topology::quality_scorer::compute_quality_score(
                call_graph, &all_parse_results,
            );
            let smells = drift_analysis::graph::test_topology::smells::detect_all_smells(
                &all_parse_results, call_graph,
            );

            let mut quality_rows: Vec<drift_storage::batch::commands::TestQualityInsertRow> = Vec::new();
            // Add per-function quality (from smells)
            for (file, func_name, func_smells) in &smells {
                let key = format!("{}::{}", file, func_name);
                quality_rows.push(drift_storage::batch::commands::TestQualityInsertRow {
                    function_id: key,
                    coverage_breadth: None,
                    coverage_depth: None,
                    assertion_density: None,
                    mock_ratio: None,
                    isolation: None,
                    freshness: None,
                    stability: None,
                    overall_score: quality_score.overall as f64,
                    smells: if func_smells.is_empty() {
                        None
                    } else {
                        Some(serde_json::to_string(func_smells).unwrap_or_default())
                    },
                });
            }
            // If no per-function data, insert aggregate
            if quality_rows.is_empty() {
                quality_rows.push(drift_storage::batch::commands::TestQualityInsertRow {
                    function_id: "__aggregate__".to_string(),
                    coverage_breadth: Some(quality_score.coverage_breadth as f64),
                    coverage_depth: Some(quality_score.coverage_depth as f64),
                    assertion_density: Some(quality_score.assertion_density as f64),
                    mock_ratio: Some(quality_score.mock_ratio as f64),
                    isolation: Some(quality_score.isolation as f64),
                    freshness: Some(quality_score.freshness as f64),
                    stability: Some(quality_score.stability as f64),
                    overall_score: quality_score.overall as f64,
                    smells: None,
                });
            }
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertTestQuality(quality_rows),
            ).map_err(storage_err)?;

            // 6e: Reachability cache → reachability_cache table
            let mut reach_rows: Vec<drift_storage::batch::commands::ReachabilityCacheRow> = Vec::new();
            for node_idx in call_graph.graph.node_indices() {
                let node = &call_graph.graph[node_idx];
                let key = format!("{}::{}", node.file, node.name);

                let fwd = drift_analysis::graph::reachability::bfs::reachability_forward(
                    call_graph, node_idx, Some(10),
                );
                let reachable_names: Vec<String> = fwd.reachable.iter().map(|&idx| {
                    let n = &call_graph.graph[idx];
                    format!("{}::{}", n.file, n.name)
                }).collect();
                let reachable_vec: Vec<_> = fwd.reachable.iter().copied().collect();
                let sensitivity = drift_analysis::graph::reachability::sensitivity::classify_sensitivity(
                    call_graph, node_idx, &reachable_vec,
                );

                reach_rows.push(drift_storage::batch::commands::ReachabilityCacheRow {
                    source_node: key,
                    direction: "forward".to_string(),
                    reachable_set: serde_json::to_string(&reachable_names).unwrap_or_default(),
                    sensitivity: sensitivity.name().to_string(),
                });
            }
            if !reach_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertReachabilityCache(reach_rows),
                ).map_err(storage_err)?;
            }
        }
    }

    // Step 7: Enforcement — run quality gates, persist violations + gate results
    if !all_parse_results.is_empty() {
        use drift_analysis::enforcement::gates::{GateOrchestrator, GateInputBuilder};
        use drift_analysis::enforcement::rules::types::PatternInfo as RulesPatternInfo;

        // Build GateInput from upstream analysis results
        let file_list: Vec<String> = all_parse_results.iter().map(|pr| pr.file.clone()).collect();

        // Convert detection matches into PatternInfo for enforcement gates
        let mut pattern_map: std::collections::HashMap<String, RulesPatternInfo> = std::collections::HashMap::new();
        for m in &all_matches {
            let entry = pattern_map.entry(m.pattern_id.clone()).or_insert_with(|| RulesPatternInfo {
                pattern_id: m.pattern_id.clone(),
                category: format!("{:?}", m.category),
                confidence: m.confidence as f64,
                locations: Vec::new(),
                outliers: Vec::new(),
                cwe_ids: m.cwe_ids.to_vec(),
                owasp_categories: m.owasp.as_ref().map(|o| vec![o.clone()]).unwrap_or_default(),
            });
            entry.locations.push(drift_analysis::enforcement::rules::types::PatternLocation {
                file: m.file.clone(),
                line: m.line,
                column: Some(m.column),
            });
        }
        let patterns: Vec<RulesPatternInfo> = pattern_map.into_values().collect();

        let gate_input = GateInputBuilder::new()
            .files(file_list)
            .patterns(patterns)
            .build();

        let orchestrator = GateOrchestrator::new();
        if let Ok(gate_results) = orchestrator.execute(&gate_input) {
            // Collect all violations from all gates
            let mut violation_rows: Vec<drift_storage::batch::commands::ViolationInsertRow> = Vec::new();
            let mut gate_result_rows: Vec<drift_storage::batch::commands::GateResultInsertRow> = Vec::new();

            for gr in &gate_results {
                // Persist gate result
                gate_result_rows.push(drift_storage::batch::commands::GateResultInsertRow {
                    gate_id: gr.gate_id.to_string(),
                    status: format!("{:?}", gr.status).to_lowercase(),
                    passed: gr.passed,
                    score: gr.score,
                    summary: gr.summary.clone(),
                    violation_count: gr.violations.len() as i64,
                    warning_count: gr.warnings.len() as i64,
                    execution_time_ms: gr.execution_time_ms as i64,
                    details: if gr.details.is_null() { None } else { Some(gr.details.to_string()) },
                    error: gr.error.clone(),
                });

                // Persist violations
                for v in &gr.violations {
                    violation_rows.push(drift_storage::batch::commands::ViolationInsertRow {
                        id: v.id.clone(),
                        file: v.file.clone(),
                        line: v.line as i64,
                        column_num: v.column.map(|c| c as i64),
                        end_line: v.end_line.map(|l| l as i64),
                        end_column: v.end_column.map(|c| c as i64),
                        severity: format!("{:?}", v.severity).to_lowercase(),
                        pattern_id: v.pattern_id.clone(),
                        rule_id: v.rule_id.clone(),
                        message: v.message.clone(),
                        quick_fix_strategy: v.quick_fix.as_ref().map(|qf| format!("{:?}", qf.strategy).to_lowercase()),
                        quick_fix_description: v.quick_fix.as_ref().map(|qf| qf.description.clone()),
                        cwe_id: v.cwe_id.map(|c| c as i64),
                        owasp_category: v.owasp_category.clone(),
                        suppressed: v.suppressed,
                        is_new: v.is_new,
                    });
                }
            }

            if !violation_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertViolations(violation_rows),
                ).map_err(storage_err)?;
            }
            if !gate_result_rows.is_empty() {
                rt.batch_writer.send(
                    drift_storage::batch::commands::BatchCommand::InsertGateResults(gate_result_rows),
                ).map_err(storage_err)?;
            }
        }
    }

    // Step 8: Degradation alerts — compare current vs previous gate results
    {
        let previous_gates = rt.db.with_reader(|conn| {
            drift_storage::queries::enforcement::query_gate_results(conn)
        }).unwrap_or_default();

        let mut alert_rows: Vec<drift_storage::batch::commands::DegradationAlertInsertRow> = Vec::new();

        // Check for score degradation across gates
        for prev in &previous_gates {
            if prev.score < 0.5 && prev.violation_count > 0 {
                alert_rows.push(drift_storage::batch::commands::DegradationAlertInsertRow {
                    alert_type: "gate_score_low".to_string(),
                    severity: if prev.score < 0.3 { "high" } else { "medium" }.to_string(),
                    message: format!("Gate '{}' score is {:.1}% with {} violations",
                        prev.gate_id, prev.score * 100.0, prev.violation_count),
                    current_value: prev.score,
                    previous_value: 1.0,
                    delta: prev.score - 1.0,
                });
            }
        }

        // Check overall violation count
        let total_violations = rt.db.with_reader(|conn| {
            drift_storage::queries::enforcement::query_all_violations(conn)
                .map(|v| v.len() as i64)
        }).unwrap_or(0);

        if total_violations > 50 {
            alert_rows.push(drift_storage::batch::commands::DegradationAlertInsertRow {
                alert_type: "violation_count_high".to_string(),
                severity: if total_violations > 100 { "high" } else { "medium" }.to_string(),
                message: format!("{} total violations detected", total_violations),
                current_value: total_violations as f64,
                previous_value: 0.0,
                delta: total_violations as f64,
            });
        }

        if !alert_rows.is_empty() {
            rt.batch_writer.send(
                drift_storage::batch::commands::BatchCommand::InsertDegradationAlerts(alert_rows),
            ).map_err(storage_err)?;
        }
    }

    // Flush to ensure batch writer processes all queued commands
    rt.batch_writer.flush().map_err(storage_err)?;

    Ok(all_results)
}

/// Build or query the call graph.
#[napi]
pub async fn drift_call_graph() -> napi::Result<JsCallGraphResult> {
    let rt = runtime::get()?;

    let total_functions = rt.db.with_reader(|conn| {
        drift_storage::queries::functions::count_functions(conn)
    }).map_err(storage_err)? as u32;

    let total_edges = rt.db.with_reader(|conn| {
        drift_storage::queries::call_edges::count_call_edges(conn)
    }).map_err(storage_err)? as u32;

    let entry_points = rt.db.with_reader(|conn| {
        drift_storage::queries::functions::count_entry_points(conn)
    }).unwrap_or(0) as u32;

    Ok(JsCallGraphResult {
        total_functions,
        total_edges,
        entry_points,
        // PH2-09: Compute real resolution_rate from stored resolution types
        resolution_rate: if total_edges > 0 {
            let resolved = rt.db.with_reader(|conn| {
                drift_storage::queries::call_edges::count_resolved_edges(conn)
            }).unwrap_or(0) as f64;
            resolved / total_edges as f64
        } else {
            0.0
        },
        build_duration_ms: 0.0,
    })
}

/// Run boundary detection.
#[napi]
pub async fn drift_boundaries() -> napi::Result<JsBoundaryResult> {
    let rt = runtime::get()?;

    let boundaries = rt.db.with_reader(|conn| {
        drift_storage::queries::boundaries::get_sensitive_boundaries(conn)
    }).map_err(storage_err)?;

    let all_boundaries = rt.db.with_reader(|conn| {
        conn.prepare_cached(
            "SELECT DISTINCT framework FROM boundaries"
        )
        .map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })
        })
    }).map_err(storage_err)?;

    // Group boundaries into models (by model_name) and sensitive fields
    // PH2-12: Include table_name from boundary storage
    let mut models_map: std::collections::HashMap<String, (String, String, u32, f64, Option<String>)> = std::collections::HashMap::new();
    let mut sensitive_fields = Vec::new();

    for b in &boundaries {
        let entry = models_map.entry(b.model_name.clone()).or_insert((
            b.file.clone(), b.framework.clone(), 0, b.confidence, b.table_name.clone(),
        ));
        entry.2 += 1;

        if let Some(ref field) = b.field_name {
            sensitive_fields.push(JsSensitiveField {
                model_name: b.model_name.clone(),
                field_name: field.clone(),
                file: b.file.clone(),
                sensitivity: b.sensitivity.clone().unwrap_or_default(),
                confidence: b.confidence,
            });
        }
    }

    let models: Vec<JsModelResult> = models_map.into_iter().map(|(name, (file, fw, count, conf, tbl))| {
        JsModelResult {
            name,
            table_name: tbl,
            file,
            framework: fw,
            field_count: count,
            confidence: conf,
        }
    }).collect();

    Ok(JsBoundaryResult {
        models,
        sensitive_fields,
        frameworks_detected: all_boundaries,
    })
}
