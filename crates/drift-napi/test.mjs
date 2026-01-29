// Simple test for the native addon
import { scan, version } from './index.js';

console.log('drift-native version:', version());

const result = scan({
  root: '../../demo/backend',
  patterns: ['**/*.ts', '**/*.js'],
  computeHashes: true,
});

console.log('Scan result:');
console.log(`  Root: ${result.root}`);
console.log(`  Files: ${result.stats.totalFiles}`);
console.log(`  Duration: ${result.stats.durationMs}ms`);
console.log(`  Errors: ${result.errors.length}`);

if (result.files.length > 0) {
  console.log('\nFirst 5 files:');
  result.files.slice(0, 5).forEach(f => {
    console.log(`  ${f.path} (${f.language || 'unknown'}) - ${f.size} bytes`);
  });
}
