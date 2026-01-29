// Benchmark: Native Rust parser performance
import { parse, scan } from './index.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('='.repeat(60));
console.log('Drift Native Parser Benchmark');
console.log('='.repeat(60));

// Collect all TypeScript files from packages/core
function collectFiles(dir, files = []) {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory() && !entry.includes('node_modules') && entry !== '.git') {
        collectFiles(fullPath, files);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch (e) {}
  return files;
}

const coreDir = '../../packages/core/src';
const files = collectFiles(coreDir);
console.log(`\nFound ${files.length} TypeScript files in packages/core/src`);

// Parse all files
let totalBytes = 0;
let totalFunctions = 0;
let totalClasses = 0;
let totalCalls = 0;
let totalImports = 0;
let parseErrors = 0;

const start = performance.now();

for (const file of files) {
  try {
    const source = readFileSync(file, 'utf-8');
    totalBytes += source.length;
    
    const result = parse(source, file);
    if (result) {
      totalFunctions += result.functions.length;
      totalClasses += result.classes.length;
      totalCalls += result.calls.length;
      totalImports += result.imports.length;
      if (result.errors.length > 0) parseErrors++;
    }
  } catch (e) {
    parseErrors++;
  }
}

const elapsed = performance.now() - start;

console.log(`\n📊 Results:`);
console.log(`   Files parsed: ${files.length}`);
console.log(`   Total bytes: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Total time: ${elapsed.toFixed(2)}ms`);
console.log(`   Throughput: ${(totalBytes / elapsed / 1000).toFixed(2)} MB/s`);
console.log(`   Avg per file: ${(elapsed / files.length).toFixed(2)}ms`);
console.log(`\n📈 Extracted:`);
console.log(`   Functions: ${totalFunctions}`);
console.log(`   Classes: ${totalClasses}`);
console.log(`   Calls: ${totalCalls}`);
console.log(`   Imports: ${totalImports}`);
console.log(`   Parse errors: ${parseErrors}`);

console.log('\n' + '='.repeat(60));
