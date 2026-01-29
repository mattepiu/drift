// Benchmark: Compare Rust scanner vs TypeScript scanner
import { scan } from './index.js';
import { performance } from 'perf_hooks';

const testDirs = [
  { name: 'demo/backend', path: '../../demo/backend' },
  { name: 'packages/core', path: '../../packages/core' },
  { name: 'drift (full repo)', path: '../..' },
];

console.log('='.repeat(60));
console.log('Drift Native Scanner Benchmark');
console.log('='.repeat(60));

for (const dir of testDirs) {
  console.log(`\n📁 ${dir.name}`);
  
  // Warm up
  scan({ root: dir.path, patterns: ['**/*.ts', '**/*.js'], computeHashes: false });
  
  // Benchmark without hashes
  const runs = 5;
  let totalNoHash = 0;
  let totalWithHash = 0;
  let fileCount = 0;
  
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const result = scan({ root: dir.path, patterns: ['**/*.ts', '**/*.js'], computeHashes: false });
    totalNoHash += performance.now() - start;
    fileCount = result.stats.totalFiles;
  }
  
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    scan({ root: dir.path, patterns: ['**/*.ts', '**/*.js'], computeHashes: true });
    totalWithHash += performance.now() - start;
  }
  
  console.log(`   Files: ${fileCount}`);
  console.log(`   Without hashes: ${(totalNoHash / runs).toFixed(2)}ms avg`);
  console.log(`   With hashes:    ${(totalWithHash / runs).toFixed(2)}ms avg`);
}

console.log('\n' + '='.repeat(60));
