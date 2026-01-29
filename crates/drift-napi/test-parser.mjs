// Test the native parser
import { parse, supportedLanguages, version } from './index.js';
import { readFileSync } from 'fs';

console.log('drift-native version:', version());
console.log('Supported languages:', supportedLanguages());
console.log();

// Test TypeScript parsing
const tsCode = `
import { Request, Response } from 'express';
import * as fs from 'fs';

export class UserController {
  async getUser(req: Request, res: Response): Promise<void> {
    const userId = req.params.id;
    const user = await this.userService.findById(userId);
    res.json(user);
  }
  
  createUser(req: Request, res: Response) {
    const data = req.body;
    console.log('Creating user:', data);
  }
}

export function validateUser(user: any): boolean {
  return user.name && user.email;
}
`;

console.log('=== TypeScript Parsing ===');
const tsResult = parse(tsCode, 'test.ts');
if (tsResult) {
  console.log(`Language: ${tsResult.language}`);
  console.log(`Parse time: ${tsResult.parseTimeUs}µs`);
  console.log(`Functions: ${tsResult.functions.length}`);
  tsResult.functions.forEach(f => {
    console.log(`  - ${f.name} (lines ${f.startLine}-${f.endLine})${f.isAsync ? ' [async]' : ''}`);
  });
  console.log(`Classes: ${tsResult.classes.length}`);
  tsResult.classes.forEach(c => {
    console.log(`  - ${c.name}${c.extends ? ` extends ${c.extends}` : ''}`);
  });
  console.log(`Imports: ${tsResult.imports.length}`);
  tsResult.imports.forEach(i => {
    console.log(`  - from '${i.source}': ${i.named.join(', ') || i.default || i.namespace || '*'}`);
  });
  console.log(`Calls: ${tsResult.calls.length}`);
  tsResult.calls.slice(0, 5).forEach(c => {
    console.log(`  - ${c.receiver ? c.receiver + '.' : ''}${c.callee}() at line ${c.line}`);
  });
}
console.log();

// Test Python parsing
const pyCode = `
from typing import List, Optional
import json

class UserService:
    def __init__(self, db):
        self.db = db
    
    async def get_user(self, user_id: str) -> Optional[dict]:
        result = await self.db.query("SELECT * FROM users WHERE id = ?", user_id)
        return result
    
    def create_user(self, data: dict) -> dict:
        print(f"Creating user: {data}")
        return self.db.insert("users", data)

def validate_email(email: str) -> bool:
    return "@" in email
`;

console.log('=== Python Parsing ===');
const pyResult = parse(pyCode, 'test.py');
if (pyResult) {
  console.log(`Language: ${pyResult.language}`);
  console.log(`Parse time: ${pyResult.parseTimeUs}µs`);
  console.log(`Functions: ${pyResult.functions.length}`);
  pyResult.functions.forEach(f => {
    console.log(`  - ${f.name}${f.isAsync ? ' [async]' : ''}`);
  });
  console.log(`Classes: ${pyResult.classes.length}`);
  pyResult.classes.forEach(c => {
    console.log(`  - ${c.name}`);
  });
  console.log(`Imports: ${pyResult.imports.length}`);
  pyResult.imports.forEach(i => {
    console.log(`  - from '${i.source}': ${i.named.join(', ') || i.default || '*'}`);
  });
}
console.log();

// Benchmark: Parse a real file
console.log('=== Benchmark: Parse Real File ===');
try {
  const realFile = readFileSync('../../packages/core/src/call-graph/streaming-builder.ts', 'utf-8');
  const iterations = 100;
  
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    parse(realFile, 'streaming-builder.ts');
  }
  const elapsed = performance.now() - start;
  
  const result = parse(realFile, 'streaming-builder.ts');
  console.log(`File size: ${realFile.length} bytes`);
  console.log(`Functions found: ${result?.functions.length}`);
  console.log(`Classes found: ${result?.classes.length}`);
  console.log(`Calls found: ${result?.calls.length}`);
  console.log(`Average parse time: ${(elapsed / iterations).toFixed(2)}ms`);
  console.log(`Throughput: ${((realFile.length * iterations) / elapsed / 1000).toFixed(2)} MB/s`);
} catch (e) {
  console.log('Could not read test file:', e.message);
}
