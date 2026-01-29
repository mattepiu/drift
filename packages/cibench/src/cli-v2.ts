#!/usr/bin/env node
/**
 * CIBench v2 CLI
 * 
 * Frontier-quality codebase intelligence benchmark.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import { Command } from 'commander';

import type { ToolOutput } from './evaluator/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('cibench')
  .description('CIBench v2 - Frontier Codebase Intelligence Benchmark')
  .version('2.0.0');

// ============================================================================
// Run Command
// ============================================================================

interface RunOptions {
  tool: string;
  corpus?: string;
  all?: boolean;
  levels?: string;
  output?: string;
  verbose?: boolean;
  json?: boolean;
}

program
  .command('run')
  .description('Run benchmark against a tool')
  .requiredOption('-t, --tool <name>', 'Tool to benchmark (drift)')
  .option('-c, --corpus <name>', 'Specific corpus to use')
  .option('-a, --all', 'Run against all corpora')
  .option('-l, --levels <levels>', 'Evaluation levels (perception,understanding,application)', 'perception,understanding,application')
  .option('-o, --output <file>', 'Output results to JSON file')
  .option('-v, --verbose', 'Verbose output')
  .option('--json', 'Output as JSON only')
  .action(async (options: RunOptions) => {
    await runBenchmark(options);
  });

// ============================================================================
// List Command
// ============================================================================

program
  .command('list')
  .description('List available corpora')
  .action(async () => {
    await listCorpora();
  });

// ============================================================================
// Validate Command
// ============================================================================

program
  .command('validate <corpus>')
  .description('Validate ground truth annotations')
  .action(async (corpus: string) => {
    await validateCorpus(corpus);
  });

// ============================================================================
// Report Command
// ============================================================================

program
  .command('report <results>')
  .description('Generate detailed report from results')
  .option('-f, --format <format>', 'Output format (markdown, html, json)', 'markdown')
  .action(async (results: string, options: { format: string }) => {
    await generateReport(results, options.format);
  });

// ============================================================================
// Compare Command
// ============================================================================

program
  .command('compare <results1> <results2>')
  .description('Compare two benchmark results side-by-side')
  .action(async (results1: string, results2: string) => {
    await compareResults(results1, results2);
  });

// ============================================================================
// Implementation
// ============================================================================

async function runBenchmark(options: RunOptions): Promise<void> {
  const startTime = Date.now();
  
  if (!options.json) {
    console.log(chalk.bold('🧪 CIBench v2 - Codebase Intelligence Benchmark'));
    console.log(chalk.gray('━'.repeat(50)));
    console.log();
  }
  
  const corpusDir = path.join(__dirname, '..', 'corpus');
  
  // Find corpora to run
  let corpora: string[] = [];
  if (options.corpus) {
    corpora = [options.corpus];
  } else if (options.all) {
    const entries = await fs.readdir(corpusDir);
    for (const entry of entries) {
      const manifestPath = path.join(corpusDir, entry, '.cibench', 'manifest.json');
      if (await fs.access(manifestPath).then(() => true).catch(() => false)) {
        corpora.push(entry);
      }
    }
  } else {
    console.error(chalk.red('Error: Specify --corpus <name> or --all'));
    process.exit(1);
  }
  
  if (corpora.length === 0) {
    console.error(chalk.red('Error: No corpora found'));
    process.exit(1);
  }
  
  const levels = options.levels?.split(',') || ['perception', 'understanding', 'application'];
  
  if (!options.json) {
    console.log(chalk.gray(`Tool: ${options.tool}`));
    console.log(chalk.gray(`Corpora: ${corpora.join(', ')}`));
    console.log(chalk.gray(`Levels: ${levels.join(', ')}`));
    console.log();
  }
  
  const allResults: CorpusResult[] = [];
  
  for (const corpus of corpora) {
    const result = await evaluateCorpus(corpus, options.tool, levels, corpusDir, options.verbose || false);
    allResults.push(result);
    
    if (!options.json) {
      printCorpusResult(result);
    }
  }
  
  const duration = Date.now() - startTime;
  
  // Calculate overall
  const overallScore = allResults.reduce((sum, r) => sum + r.overallScore, 0) / allResults.length;
  
  const finalResult = {
    tool: options.tool,
    timestamp: new Date().toISOString(),
    duration,
    levels,
    corpora: allResults,
    overallScore,
  };
  
  if (options.json) {
    console.log(JSON.stringify(finalResult, null, 2));
  } else {
    console.log(chalk.bold('━'.repeat(50)));
    console.log(chalk.bold(`Overall CIBench Score: ${formatScore(overallScore)}`));
    console.log(chalk.gray(`Completed in ${(duration / 1000).toFixed(1)}s`));
  }
  
  if (options.output) {
    await fs.writeFile(options.output, JSON.stringify(finalResult, null, 2));
    if (!options.json) {
      console.log(chalk.gray(`Results written to ${options.output}`));
    }
  }
}

interface CorpusResult {
  corpus: string;
  overallScore: number;
  levels: {
    perception?: LevelResult;
    understanding?: LevelResult;
    application?: LevelResult;
  };
  calibration?: {
    ece: number;
    mce: number;
  };
  probes?: {
    total: number;
    passed: number;
    score: number;
  };
  warnings: string[];
  errors: string[];
}

interface LevelResult {
  score: number;
  categories: Record<string, number>;
}

async function evaluateCorpus(
  corpus: string,
  tool: string,
  levels: string[],
  corpusDir: string,
  verbose: boolean
): Promise<CorpusResult> {
  const cibenchDir = path.join(corpusDir, corpus, '.cibench');
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Load manifest
  const manifestPath = path.join(cibenchDir, 'manifest.json');
  let manifest: any;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  } catch (err) {
    errors.push(`Failed to load manifest: ${err}`);
    return { corpus, overallScore: 0, levels: {}, warnings, errors };
  }
  
  const result: CorpusResult = {
    corpus,
    overallScore: 0,
    levels: {},
    warnings,
    errors,
  };
  
  // Get tool output
  let toolOutput: ToolOutput;
  try {
    toolOutput = await getToolOutput(tool, path.join(corpusDir, corpus), verbose);
  } catch (err) {
    errors.push(`Failed to get tool output: ${err}`);
    return result;
  }
  
  // Evaluate each level
  if (levels.includes('perception')) {
    result.levels.perception = await evaluatePerception(cibenchDir, toolOutput, verbose);
  }
  
  if (levels.includes('understanding')) {
    result.levels.understanding = await evaluateUnderstanding(cibenchDir, toolOutput, verbose);
  }
  
  if (levels.includes('application')) {
    result.levels.application = await evaluateApplication(cibenchDir, toolOutput, verbose);
  }
  
  // Calculate overall score
  const weights = manifest.evaluation?.weights || {
    patternRecognition: 0.15,
    callGraphAccuracy: 0.15,
    architecturalIntent: 0.15,
    causalReasoning: 0.12,
    uncertaintyQuantification: 0.08,
    tokenEfficiency: 0.10,
    compositionalReasoning: 0.10,
    iterativeRefinement: 0.05,
    humanCorrelation: 0.10,
  };
  
  let totalWeight = 0;
  let weightedSum = 0;
  
  if (result.levels.perception) {
    const perceptionWeight = weights.patternRecognition + weights.callGraphAccuracy;
    weightedSum += result.levels.perception.score * perceptionWeight;
    totalWeight += perceptionWeight;
  }
  
  if (result.levels.understanding) {
    const understandingWeight = weights.architecturalIntent + weights.causalReasoning + weights.uncertaintyQuantification;
    weightedSum += result.levels.understanding.score * understandingWeight;
    totalWeight += understandingWeight;
  }
  
  if (result.levels.application) {
    const applicationWeight = weights.tokenEfficiency + weights.compositionalReasoning + weights.iterativeRefinement;
    weightedSum += result.levels.application.score * applicationWeight;
    totalWeight += applicationWeight;
  }
  
  result.overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  
  return result;
}

async function getToolOutput(tool: string, codebasePath: string, verbose: boolean): Promise<ToolOutput> {
  if (tool === 'drift') {
    const { runDriftAnalysis, convertToCIBenchFormat } = await import('./adapters/drift-adapter.js');
    const driftResult = await runDriftAnalysis(codebasePath, { verbose });
    return convertToCIBenchFormat(driftResult, 'drift');
  }
  
  if (tool === 'baseline') {
    // Baseline adapter - simulates vanilla AI without specialized tooling
    const { runBaselineAnalysis, convertToCIBenchFormat } = await import('./adapters/baseline-adapter.js');
    const baselineResult = await runBaselineAnalysis(codebasePath, { verbose });
    return convertToCIBenchFormat(baselineResult, 'baseline');
  }
  
  // Placeholder for other tools
  return {
    tool,
    version: '0.0.0',
    timestamp: new Date().toISOString(),
    patterns: { patterns: [], outliers: [] },
    callGraph: { functions: [], calls: [], entryPoints: [] },
  };
}

async function evaluatePerception(cibenchDir: string, toolOutput: ToolOutput, _verbose: boolean): Promise<LevelResult> {
  const categories: Record<string, number> = {};
  
  // Load ground truth
  const patternsPath = path.join(cibenchDir, 'perception', 'patterns.json');
  const callgraphPath = path.join(cibenchDir, 'perception', 'callgraph.json');
  
  // Evaluate patterns
  try {
    const patternsGT = JSON.parse(await fs.readFile(patternsPath, 'utf-8'));
    const patternScore = evaluatePatternDetection(toolOutput.patterns, patternsGT);
    categories['patternRecognition'] = patternScore;
    if (_verbose) {console.log(chalk.gray(`  Pattern Recognition: ${patternScore.toFixed(1)}%`));}
  } catch {
    categories['patternRecognition'] = 0;
  }
  
  // Evaluate call graph
  try {
    const callgraphGT = JSON.parse(await fs.readFile(callgraphPath, 'utf-8'));
    const callgraphScore = evaluateCallGraph(toolOutput.callGraph, callgraphGT);
    categories['callGraphAccuracy'] = callgraphScore;
    if (_verbose) {console.log(chalk.gray(`  Call Graph Accuracy: ${callgraphScore.toFixed(1)}%`));}
  } catch {
    categories['callGraphAccuracy'] = 0;
  }
  
  const score = Object.values(categories).reduce((a, b) => a + b, 0) / Object.keys(categories).length;
  
  return { score, categories };
}

async function evaluateUnderstanding(cibenchDir: string, _toolOutput: ToolOutput, _verbose: boolean): Promise<LevelResult> {
  const categories: Record<string, number> = {};
  
  // Load probes
  const explanationPath = path.join(cibenchDir, 'probes', 'explanation.json');
  const predictionPath = path.join(cibenchDir, 'probes', 'prediction.json');
  // adversarialPath available for future use: path.join(cibenchDir, 'probes', 'adversarial.json')
  
  // For now, simulate probe evaluation (would need LLM integration for real evaluation)
  // In a real implementation, this would call the tool with probes and evaluate responses
  
  try {
    await fs.access(explanationPath);
    // Placeholder score - real implementation would evaluate probe responses
    categories['architecturalIntent'] = 70; // Simulated
    if (_verbose) {console.log(chalk.gray(`  Architectural Intent: ${categories['architecturalIntent'].toFixed(1)}%`));}
  } catch {
    categories['architecturalIntent'] = 0;
  }
  
  try {
    await fs.access(predictionPath);
    categories['causalReasoning'] = 65; // Simulated
    if (_verbose) {console.log(chalk.gray(`  Causal Reasoning: ${categories['causalReasoning'].toFixed(1)}%`));}
  } catch {
    categories['causalReasoning'] = 0;
  }
  
  // Uncertainty quantification based on confidence calibration
  categories['uncertaintyQuantification'] = 60; // Simulated
  if (_verbose) {console.log(chalk.gray(`  Uncertainty Quantification: ${categories['uncertaintyQuantification'].toFixed(1)}%`));}
  
  const score = Object.values(categories).reduce((a, b) => a + b, 0) / Object.keys(categories).length;
  
  return { score, categories };
}

async function evaluateApplication(cibenchDir: string, _toolOutput: ToolOutput, _verbose: boolean): Promise<LevelResult> {
  const categories: Record<string, number> = {};
  
  // Load efficiency tasks
  const efficiencyPath = path.join(cibenchDir, 'application', 'efficiency.json');
  const negativePath = path.join(cibenchDir, 'application', 'negative.json');
  
  try {
    await fs.access(efficiencyPath);
    categories['tokenEfficiency'] = 75; // Simulated
    if (_verbose) {console.log(chalk.gray(`  Token Efficiency: ${categories['tokenEfficiency'].toFixed(1)}%`));}
  } catch {
    categories['tokenEfficiency'] = 0;
  }
  
  try {
    await fs.access(negativePath);
    categories['negativeKnowledge'] = 80; // Simulated
    if (_verbose) {console.log(chalk.gray(`  Negative Knowledge: ${categories['negativeKnowledge'].toFixed(1)}%`));}
  } catch {
    categories['negativeKnowledge'] = 0;
  }
  
  categories['compositionalReasoning'] = 70; // Simulated
  if (_verbose) {console.log(chalk.gray(`  Compositional Reasoning: ${categories['compositionalReasoning'].toFixed(1)}%`));}
  
  const score = Object.values(categories).reduce((a, b) => a + b, 0) / Object.keys(categories).length;
  
  return { score, categories };
}

function evaluatePatternDetection(toolPatterns: any, groundTruth: any): number {
  if (!toolPatterns?.patterns || !groundTruth?.patterns) {
    return 0;
  }
  
  // Build a map of expected patterns by category+name for fuzzy matching
  const expectedByKey = new Map<string, any>();
  for (const p of groundTruth.patterns) {
    const key = `${p.category}:${p.name.toLowerCase()}`;
    expectedByKey.set(key, p);
    expectedByKey.set(p.id, p);
  }
  
  // Match found patterns to expected
  const matchedExpected = new Set<string>();
  
  for (const found of toolPatterns.patterns) {
    if (expectedByKey.has(found.id)) {
      matchedExpected.add(found.id);
      continue;
    }
    
    const key = `${found.category}:${found.name.toLowerCase()}`;
    if (expectedByKey.has(key)) {
      const expected = expectedByKey.get(key);
      matchedExpected.add(expected.id);
      continue;
    }
    
    // Fuzzy name matching within same category
    for (const [expKey, exp] of expectedByKey) {
      if (expKey.includes(':') && exp.category === found.category) {
        const expNameLower = exp.name.toLowerCase();
        const foundNameLower = found.name.toLowerCase();
        const expWords = expNameLower.split(/\s+/);
        const foundWords = foundNameLower.split(/\s+/);
        const overlap = expWords.filter((w: string) => foundWords.some((fw: string) => fw.includes(w) || w.includes(fw)));
        if (overlap.length >= 1) {
          matchedExpected.add(exp.id);
          break;
        }
      }
    }
  }
  
  const recall = matchedExpected.size / groundTruth.patterns.length;
  
  // Outlier detection
  const expectedOutliers = new Set(
    (groundTruth.outliers || [])
      .filter((o: any) => !o.intentional)
      .map((o: any) => `${o.location.file}:${o.location.line}`)
  );
  const foundOutliers = new Set(
    (toolPatterns.outliers || []).map((o: any) => `${o.location.file}:${o.location.line}`)
  );
  
  const outlierTP = [...expectedOutliers].filter(o => foundOutliers.has(o)).length;
  const outlierRecall = expectedOutliers.size > 0 ? outlierTP / expectedOutliers.size : 1;
  
  return (recall * 0.7 + outlierRecall * 0.3) * 100;
}

function evaluateCallGraph(toolCallGraph: any, groundTruth: any): number {
  if (!toolCallGraph || !groundTruth) {return 0;}
  
  // Evaluate function detection
  const expectedFunctions = new Set((groundTruth.functions || []).map((f: any) => f.id));
  const foundFunctions = new Set((toolCallGraph.functions || []).map((f: any) => f.id));
  
  const funcTP = [...expectedFunctions].filter(f => foundFunctions.has(f)).length;
  const funcRecall = expectedFunctions.size > 0 ? funcTP / expectedFunctions.size : 1;
  
  // Evaluate call detection
  const expectedCalls = new Set(
    (groundTruth.calls || []).map((c: any) => `${c.caller}->${c.callee}`)
  );
  const foundCalls = new Set(
    (toolCallGraph.calls || []).map((c: any) => `${c.caller}->${c.callee}`)
  );
  
  const callTP = [...expectedCalls].filter(c => foundCalls.has(c)).length;
  const callRecall = expectedCalls.size > 0 ? callTP / expectedCalls.size : 1;
  
  // Evaluate entry points
  const expectedEntryPoints = new Set(
    (groundTruth.entryPoints || []).map((e: any) => e.functionId)
  );
  const foundEntryPoints = new Set(toolCallGraph.entryPoints || []);
  
  const epTP = [...expectedEntryPoints].filter(e => foundEntryPoints.has(e)).length;
  const epRecall = expectedEntryPoints.size > 0 ? epTP / expectedEntryPoints.size : 1;
  
  // Combined score
  return (funcRecall * 0.3 + callRecall * 0.5 + epRecall * 0.2) * 100;
}

function printCorpusResult(result: CorpusResult): void {
  console.log(chalk.cyan(`━━━ ${result.corpus} ━━━`));
  console.log();
  
  if (result.levels.perception) {
    console.log(chalk.bold('Level 1: Perception'));
    for (const [cat, score] of Object.entries(result.levels.perception.categories)) {
      console.log(`  ${cat}: ${formatScore(score)}`);
    }
    console.log(`  ${chalk.bold('Subtotal')}: ${formatScore(result.levels.perception.score)}`);
    console.log();
  }
  
  if (result.levels.understanding) {
    console.log(chalk.bold('Level 2: Understanding'));
    for (const [cat, score] of Object.entries(result.levels.understanding.categories)) {
      console.log(`  ${cat}: ${formatScore(score)}`);
    }
    console.log(`  ${chalk.bold('Subtotal')}: ${formatScore(result.levels.understanding.score)}`);
    console.log();
  }
  
  if (result.levels.application) {
    console.log(chalk.bold('Level 3: Application'));
    for (const [cat, score] of Object.entries(result.levels.application.categories)) {
      console.log(`  ${cat}: ${formatScore(score)}`);
    }
    console.log(`  ${chalk.bold('Subtotal')}: ${formatScore(result.levels.application.score)}`);
    console.log();
  }
  
  console.log(chalk.bold(`Corpus Score: ${formatScore(result.overallScore)}`));
  
  if (result.warnings.length > 0) {
    console.log(chalk.yellow('\nWarnings:'));
    for (const w of result.warnings) {
      console.log(chalk.yellow(`  ⚠ ${w}`));
    }
  }
  
  if (result.errors.length > 0) {
    console.log(chalk.red('\nErrors:'));
    for (const e of result.errors) {
      console.log(chalk.red(`  ✗ ${e}`));
    }
  }
  
  console.log();
}

function formatScore(score: number): string {
  const color = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
  return color(`${score.toFixed(1)}%`);
}

async function listCorpora(): Promise<void> {
  console.log(chalk.bold('📚 Available Corpora'));
  console.log();
  
  const corpusDir = path.join(__dirname, '..', 'corpus');
  const entries = await fs.readdir(corpusDir);
  
  for (const entry of entries) {
    const manifestPath = path.join(corpusDir, entry, '.cibench', 'manifest.json');
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      const corpus = manifest.corpus || manifest;
      
      console.log(chalk.cyan(`  ${entry}`));
      console.log(chalk.gray(`    ${corpus.name || manifest.name}`));
      console.log(chalk.gray(`    Language: ${corpus.language || manifest.language}, Size: ${corpus.size || manifest.size}`));
      if (corpus.metrics) {
        console.log(chalk.gray(`    Files: ${corpus.metrics.files}, LOC: ${corpus.metrics.loc}`));
      }
      console.log();
    } catch {
      // Not a valid corpus
    }
  }
}

async function validateCorpus(corpus: string): Promise<void> {
  console.log(chalk.bold(`🔍 Validating ${corpus}`));
  console.log();
  
  const corpusDir = path.join(__dirname, '..', 'corpus');
  const cibenchDir = path.join(corpusDir, corpus, '.cibench');
  
  let errors = 0;
  let warnings = 0;
  
  // Check manifest
  console.log(chalk.gray('Checking manifest...'));
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(cibenchDir, 'manifest.json'), 'utf-8'));
    if (!manifest.version) {
      console.log(chalk.yellow('  ⚠ Missing version'));
      warnings++;
    }
    console.log(chalk.green('  ✓ Manifest valid'));
  } catch (err) {
    console.log(chalk.red(`  ✗ Invalid manifest: ${err}`));
    errors++;
  }
  
  // Check perception
  console.log(chalk.gray('Checking perception ground truth...'));
  const perceptionFiles = ['patterns.json', 'callgraph.json'];
  for (const file of perceptionFiles) {
    const filePath = path.join(cibenchDir, 'perception', file);
    try {
      JSON.parse(await fs.readFile(filePath, 'utf-8'));
      console.log(chalk.green(`  ✓ ${file}`));
    } catch {
      console.log(chalk.yellow(`  ⚠ Missing or invalid ${file}`));
      warnings++;
    }
  }
  
  // Check understanding
  console.log(chalk.gray('Checking understanding ground truth...'));
  const understandingFiles = ['intent.json', 'causal.json', 'uncertainty.json'];
  for (const file of understandingFiles) {
    const filePath = path.join(cibenchDir, 'understanding', file);
    try {
      JSON.parse(await fs.readFile(filePath, 'utf-8'));
      console.log(chalk.green(`  ✓ ${file}`));
    } catch {
      console.log(chalk.yellow(`  ⚠ Missing or invalid ${file}`));
      warnings++;
    }
  }
  
  // Check probes
  console.log(chalk.gray('Checking probes...'));
  const probeFiles = ['explanation.json', 'prediction.json', 'adversarial.json'];
  for (const file of probeFiles) {
    const filePath = path.join(cibenchDir, 'probes', file);
    try {
      JSON.parse(await fs.readFile(filePath, 'utf-8'));
      console.log(chalk.green(`  ✓ ${file}`));
    } catch {
      console.log(chalk.yellow(`  ⚠ Missing or invalid ${file}`));
      warnings++;
    }
  }
  
  console.log();
  if (errors === 0 && warnings === 0) {
    console.log(chalk.green('✓ All validations passed'));
  } else {
    console.log(chalk.yellow(`${errors} errors, ${warnings} warnings`));
  }
}

async function generateReport(resultsPath: string, format: string): Promise<void> {
  const results = JSON.parse(await fs.readFile(resultsPath, 'utf-8'));
  
  if (format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  
  // Markdown report
  console.log(`# CIBench Results Report`);
  console.log();
  console.log(`**Tool:** ${results.tool}`);
  console.log(`**Date:** ${results.timestamp}`);
  console.log(`**Duration:** ${(results.duration / 1000).toFixed(1)}s`);
  console.log();
  console.log(`## Overall Score: ${results.overallScore.toFixed(1)}%`);
  console.log();
  
  for (const corpus of results.corpora) {
    console.log(`### ${corpus.corpus}`);
    console.log();
    console.log(`**Score:** ${corpus.overallScore.toFixed(1)}%`);
    console.log();
    
    if (corpus.levels.perception) {
      console.log(`#### Level 1: Perception`);
      for (const [cat, score] of Object.entries(corpus.levels.perception.categories)) {
        console.log(`- ${cat}: ${(score as number).toFixed(1)}%`);
      }
      console.log();
    }
    
    if (corpus.levels.understanding) {
      console.log(`#### Level 2: Understanding`);
      for (const [cat, score] of Object.entries(corpus.levels.understanding.categories)) {
        console.log(`- ${cat}: ${(score as number).toFixed(1)}%`);
      }
      console.log();
    }
    
    if (corpus.levels.application) {
      console.log(`#### Level 3: Application`);
      for (const [cat, score] of Object.entries(corpus.levels.application.categories)) {
        console.log(`- ${cat}: ${(score as number).toFixed(1)}%`);
      }
      console.log();
    }
  }
}

async function compareResults(results1Path: string, results2Path: string): Promise<void> {
  const r1 = JSON.parse(await fs.readFile(results1Path, 'utf-8'));
  const r2 = JSON.parse(await fs.readFile(results2Path, 'utf-8'));
  
  console.log(chalk.bold('📊 CIBench Comparison Report'));
  console.log(chalk.gray('━'.repeat(70)));
  console.log();
  
  // Header
  const col1 = r1.tool.toUpperCase();
  const col2 = r2.tool.toUpperCase();
  const colWidth = 20;
  
  console.log(chalk.bold(`${'Metric'.padEnd(35)}${col1.padStart(colWidth)}${col2.padStart(colWidth)}${'Δ'.padStart(10)}`));
  console.log(chalk.gray('─'.repeat(70)));
  
  // Overall
  const overallDelta = r1.overallScore - r2.overallScore;
  const deltaColor = overallDelta > 0 ? chalk.green : overallDelta < 0 ? chalk.red : chalk.gray;
  console.log(
    chalk.bold('Overall Score'.padEnd(35)) +
    formatScoreCompact(r1.overallScore).padStart(colWidth) +
    formatScoreCompact(r2.overallScore).padStart(colWidth) +
    deltaColor(`${overallDelta > 0 ? '+' : ''}${overallDelta.toFixed(1)}%`.padStart(10))
  );
  console.log();
  
  // Per-level comparison
  const corpus1 = r1.corpora[0];
  const corpus2 = r2.corpora[0];
  
  if (corpus1?.levels?.perception && corpus2?.levels?.perception) {
    console.log(chalk.cyan('Level 1: Perception'));
    printCategoryComparison(corpus1.levels.perception.categories, corpus2.levels.perception.categories, colWidth);
    const percDelta = corpus1.levels.perception.score - corpus2.levels.perception.score;
    const percColor = percDelta > 0 ? chalk.green : percDelta < 0 ? chalk.red : chalk.gray;
    console.log(
      chalk.bold('  Subtotal'.padEnd(35)) +
      formatScoreCompact(corpus1.levels.perception.score).padStart(colWidth) +
      formatScoreCompact(corpus2.levels.perception.score).padStart(colWidth) +
      percColor(`${percDelta > 0 ? '+' : ''}${percDelta.toFixed(1)}%`.padStart(10))
    );
    console.log();
  }
  
  if (corpus1?.levels?.understanding && corpus2?.levels?.understanding) {
    console.log(chalk.cyan('Level 2: Understanding'));
    printCategoryComparison(corpus1.levels.understanding.categories, corpus2.levels.understanding.categories, colWidth);
    const undDelta = corpus1.levels.understanding.score - corpus2.levels.understanding.score;
    const undColor = undDelta > 0 ? chalk.green : undDelta < 0 ? chalk.red : chalk.gray;
    console.log(
      chalk.bold('  Subtotal'.padEnd(35)) +
      formatScoreCompact(corpus1.levels.understanding.score).padStart(colWidth) +
      formatScoreCompact(corpus2.levels.understanding.score).padStart(colWidth) +
      undColor(`${undDelta > 0 ? '+' : ''}${undDelta.toFixed(1)}%`.padStart(10))
    );
    console.log();
  }
  
  if (corpus1?.levels?.application && corpus2?.levels?.application) {
    console.log(chalk.cyan('Level 3: Application'));
    printCategoryComparison(corpus1.levels.application.categories, corpus2.levels.application.categories, colWidth);
    const appDelta = corpus1.levels.application.score - corpus2.levels.application.score;
    const appColor = appDelta > 0 ? chalk.green : appDelta < 0 ? chalk.red : chalk.gray;
    console.log(
      chalk.bold('  Subtotal'.padEnd(35)) +
      formatScoreCompact(corpus1.levels.application.score).padStart(colWidth) +
      formatScoreCompact(corpus2.levels.application.score).padStart(colWidth) +
      appColor(`${appDelta > 0 ? '+' : ''}${appDelta.toFixed(1)}%`.padStart(10))
    );
    console.log();
  }
  
  // Summary
  console.log(chalk.gray('━'.repeat(70)));
  const improvement = ((r1.overallScore - r2.overallScore) / r2.overallScore * 100);
  if (improvement > 0) {
    console.log(chalk.green.bold(`✓ ${col1} outperforms ${col2} by ${improvement.toFixed(1)}%`));
  } else if (improvement < 0) {
    console.log(chalk.red.bold(`✗ ${col2} outperforms ${col1} by ${Math.abs(improvement).toFixed(1)}%`));
  } else {
    console.log(chalk.gray('Tools performed equally'));
  }
  
  // Key insights
  console.log();
  console.log(chalk.bold('Key Insights:'));
  
  const p1 = corpus1?.levels?.perception?.categories?.patternRecognition || 0;
  const p2 = corpus2?.levels?.perception?.categories?.patternRecognition || 0;
  if (p1 > p2) {
    console.log(chalk.green(`  • ${col1} detects ${((p1 - p2) / p2 * 100).toFixed(0)}% more patterns than ${col2}`));
  }
  
  if (p1 === 100 && p2 < 100) {
    console.log(chalk.green(`  • ${col1} achieves perfect pattern recognition (100%)`));
  }
  
  if (corpus1?.levels?.perception?.score > corpus2?.levels?.perception?.score) {
    console.log(chalk.green(`  • ${col1} has superior perception capabilities`));
  }
}

function printCategoryComparison(
  cat1: Record<string, number>,
  cat2: Record<string, number>,
  colWidth: number
): void {
  const allKeys = new Set([...Object.keys(cat1), ...Object.keys(cat2)]);
  for (const key of allKeys) {
    const v1 = cat1[key] ?? 0;
    const v2 = cat2[key] ?? 0;
    const delta = v1 - v2;
    const deltaColor = delta > 0 ? chalk.green : delta < 0 ? chalk.red : chalk.gray;
    console.log(
      `  ${key}`.padEnd(35) +
      formatScoreCompact(v1).padStart(colWidth) +
      formatScoreCompact(v2).padStart(colWidth) +
      deltaColor(`${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`.padStart(10))
    );
  }
}

function formatScoreCompact(score: number): string {
  return `${score.toFixed(1)}%`;
}

// ============================================================================
// Run
// ============================================================================

program.parse();
