/**
 * Quick test to verify sqlite-vec integration
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const db = new Database(':memory:');

try {
  // Load sqlite-vec
  sqliteVec.load(db);
  console.log('✅ sqlite-vec loaded successfully');

  // Check version
  const version = db.prepare('SELECT vec_version()').get();
  console.log('✅ sqlite-vec version:', version);

  // Create vector table
  db.exec(`
    CREATE VIRTUAL TABLE test_embeddings USING vec0(
      embedding float[384]
    );
  `);
  console.log('✅ Vector table created');

  // Insert test embedding
  const testEmbedding = new Array(384).fill(0).map(() => Math.random());
  db.prepare('INSERT INTO test_embeddings (embedding) VALUES (?)').run(JSON.stringify(testEmbedding));
  console.log('✅ Test embedding inserted');

  // Query with cosine distance
  const queryEmbedding = new Array(384).fill(0).map(() => Math.random());
  const result = db.prepare(`
    SELECT rowid, vec_distance_cosine(embedding, ?) as distance
    FROM test_embeddings
    ORDER BY distance
    LIMIT 5
  `).all(JSON.stringify(queryEmbedding));
  
  console.log('✅ Similarity search works:', result);
  console.log('\n🎉 All sqlite-vec tests passed!');

} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
} finally {
  db.close();
}
