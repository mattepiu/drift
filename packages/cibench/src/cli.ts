#!/usr/bin/env node
/**
 * CIBench CLI
 * 
 * Command-line interface for running codebase intelligence benchmarks.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';

import { loadGroundTruth, Evaluator } from './evaluator/index.js';

import { VERSION } from './index.js';

import type { ToolOutput, EvaluationResult } from './evaluator/types.js';

const program = new Command();

program
  .name('cibench')
  .description('Codebase Intelligence Benchmark - measure how well tools understand code')
  .version(VERSION);

// ============================================================================
// Run Command
// ============================================================================

program
  .command('run')
  .description('Run benchmark against a tool')
  .requiredOption('-t, --tool <name>', 'Tool to benchmark (drift, cursor, cody, etc.)')
  .option('-c, --corpus <name>', 'Specific corpus to use')
  .option('-a, --all', 'Run against all corpora')
  .option('-o, --output <file>', 'Output results to JSON file')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    console.log(chalk.bold('🧪 CIBench - Codebase Intelligence Benchmark'));
    console.log();
    
    const corpusDir = path.join(__dirname, '..', 'corpus');
    
    // Find corpora to run
    let corpora: string[] = [];
    if (options.corpus) {
      corpora = [options.corpus];
    } else if (options.all) {
      try {
        const entries = await fs.readdir(corpusDir);
        for (const entry of entries) {
          const manifestPath = path.join(corpusDir, entry, '.cibench', 'manifest.json');
          try {
            await fs.access(manifestPath);
            corpora.push(entry);
          } catch {
            // Not a valid corpus
          }
        }
      } catch {
        console.error(chalk.red('Error: Could not read corpus directory'));
        process.exit(1);
      }
    } else {
      console.error(chalk.red('Error: Specify --corpus <name> or --all'));
      process.exit(1);
    }
    
    if (corpora.length === 0) {
      console.error(chalk.red('Error: No corpora found'));
      process.exit(1);
    }
    
    console.log(chalk.gray(`Tool: ${options.tool}`));
    console.log(chalk.gray(`Corpora: ${corpora.join(', ')}`));
    console.log();
    
    const results: EvaluationResult[] = [];
    
    for (const corpus of corpora) {
      console.log(chalk.cyan(`━━━ ${corpus} ━━━`));
      
      const cibenchDir = path.join(corpusDir, corpus, '.cibench');
      
      try {
        // Load ground truth
        const groundTruth = await loadGroundTruth(cibenchDir);
        console.log(chalk.gray(`  Loaded: ${groundTruth.manifest.name}`));
        console.log(chalk.gray(`  Focus: ${groundTruth.manifest.testsFocus.join(', ')}`));
        
        // Get tool output (placeholder - would call actual tool adapter)
        const toolOutput = await getToolOutput(options.tool, path.join(corpusDir, corpus));
        
        // Evaluate
        const evaluator = new Evaluator(groundTruth, { verbose: options.verbose });
        const result = evaluator.evaluate(toolOutput);
        results.push(result);
        
        // Print results
        console.log();
        console.log(chalk.bold(`  Overall Score: ${result.overallScore.toFixed(1)}%`));
        console.log();
        
        for (const [category, score] of Object.entries(result.categoryScores)) {
          if (score.weight > 0) {
            const color = score.score >= 80 ? chalk.green : score.score >= 50 ? chalk.yellow : chalk.red;
            console.log(`  ${category}: ${color(score.score.toFixed(1) + '%')}`);
          }
        }
        
        console.log();
        
        if (result.summary.strengths.length > 0) {
          console.log(chalk.green('  Strengths:'));
          for (const s of result.summary.strengths) {
            console.log(chalk.green(`    ✓ ${s}`));
          }
        }
        
        if (result.summary.weaknesses.length > 0) {
          console.log(chalk.red('  Weaknesses:'));
          for (const w of result.summary.weaknesses) {
            console.log(chalk.red(`    ✗ ${w}`));
          }
        }
        
        console.log();
        
      } catch (error) {
        console.error(chalk.red(`  Error: ${(error as Error).message}`));
      }
    }
    
    // Output to file if requested
    if (options.output) {
      await fs.writeFile(options.output, JSON.stringify(results, null, 2));
      console.log(chalk.gray(`Results written to ${options.output}`));
    }
    
    // Summary
    if (results.length > 1) {
      console.log(chalk.bold('━━━ Summary ━━━'));
      const avgScore = results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;
      console.log(`  Average Score: ${avgScore.toFixed(1)}%`);
    }
  });

// ============================================================================
// List Command
// ============================================================================

program
  .command('list')
  .description('List available corpora')
  .action(async () => {
    console.log(chalk.bold('📚 Available Corpora'));
    console.log();
    
    const corpusDir = path.join(__dirname, '..', 'corpus');
    
    try {
      const entries = await fs.readdir(corpusDir);
      
      for (const entry of entries) {
        const manifestPath = path.join(corpusDir, entry, '.cibench', 'manifest.json');
        try {
          const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
          console.log(chalk.cyan(`  ${entry}`));
          console.log(chalk.gray(`    ${manifest.name}`));
          console.log(chalk.gray(`    Language: ${manifest.language}, Size: ${manifest.size}`));
          console.log(chalk.gray(`    Focus: ${manifest.testsFocus.join(', ')}`));
          console.log();
        } catch {
          // Not a valid corpus
        }
      }
    } catch {
      console.error(chalk.red('Error: Could not read corpus directory'));
    }
  });

// ============================================================================
// Validate Command
// ============================================================================

program
  .command('validate <corpus>')
  .description('Validate ground truth annotations')
  .action(async (corpus) => {
    console.log(chalk.bold(`🔍 Validating ${corpus}`));
    console.log();
    
    const corpusDir = path.join(__dirname, '..', 'corpus');
    const cibenchDir = path.join(corpusDir, corpus, '.cibench');
    
    try {
      const groundTruth = await loadGroundTruth(cibenchDir);
      
      let errors = 0;
      let warnings = 0;
      
      // Validate manifest
      console.log(chalk.gray('Checking manifest...'));
      if (!groundTruth.manifest.id) {
        console.log(chalk.red('  ✗ Missing id'));
        errors++;
      }
      
      // Validate patterns
      if (groundTruth.patterns) {
        console.log(chalk.gray('Checking patterns...'));
        for (const pattern of groundTruth.patterns.patterns) {
          if (pattern.locations.length === 0) {
            console.log(chalk.yellow(`  ⚠ Pattern ${pattern.id} has no locations`));
            warnings++;
          }
          
          // Check if files exist
          for (const loc of pattern.locations) {
            const filePath = path.join(corpusDir, corpus, loc.file);
            try {
              await fs.access(filePath);
            } catch {
              console.log(chalk.red(`  ✗ Pattern ${pattern.id}: file not found: ${loc.file}`));
              errors++;
            }
          }
        }
      }
      
      // Validate agentic tasks
      if (groundTruth.agentic) {
        console.log(chalk.gray('Checking agentic tasks...'));
        const agenticData = groundTruth.agentic as { tasks?: Array<{ id: string; expectedGrounding?: { relevantFiles?: unknown[] } }> };
        for (const task of agenticData.tasks ?? []) {
          if (!task.expectedGrounding?.relevantFiles?.length) {
            console.log(chalk.yellow(`  ⚠ Task ${task.id} has no relevant files`));
            warnings++;
          }
        }
      }
      
      console.log();
      if (errors === 0 && warnings === 0) {
        console.log(chalk.green('✓ All validations passed'));
      } else {
        console.log(chalk.yellow(`${errors} errors, ${warnings} warnings`));
      }
      
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get tool output (placeholder - would call actual tool adapter)
 */
async function getToolOutput(tool: string, _codebasePath: string): Promise<ToolOutput> {
  // TODO: Implement actual tool adapters
  // For now, return empty output
  return {
    tool,
    version: '0.0.0',
    timestamp: new Date().toISOString(),
    patterns: { patterns: [], outliers: [] },
    callGraph: { functions: [], calls: [], entryPoints: [] },
  };
}

// ============================================================================
// Run
// ============================================================================

program.parse();
