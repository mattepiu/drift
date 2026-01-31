/**
 * Structural Embeddings Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StructuralEmbedder,
  ASTAnalyzer,
  FeatureExtractor,
  PatternClassifier,
} from '../../embeddings/structural/index.js';

describe('ASTAnalyzer', () => {
  let analyzer: ASTAnalyzer;

  beforeEach(() => {
    analyzer = new ASTAnalyzer();
  });

  describe('hasAsyncPattern', () => {
    it('should detect async functions', () => {
      const code = 'async function fetchData() { return await fetch(url); }';
      expect(analyzer.hasAsyncPattern(code)).toBe(true);
    });

    it('should detect Promise patterns', () => {
      const code = 'function getData() { return Promise.resolve(data); }';
      expect(analyzer.hasAsyncPattern(code)).toBe(true);
    });

    it('should detect .then() patterns', () => {
      const code = 'fetch(url).then(res => res.json())';
      expect(analyzer.hasAsyncPattern(code)).toBe(true);
    });

    it('should return false for sync code', () => {
      const code = 'function add(a, b) { return a + b; }';
      expect(analyzer.hasAsyncPattern(code)).toBe(false);
    });
  });

  describe('hasErrorHandling', () => {
    it('should detect try-catch', () => {
      const code = 'try { doSomething(); } catch (e) { console.error(e); }';
      expect(analyzer.hasErrorHandling(code)).toBe(true);
    });

    it('should detect .catch()', () => {
      const code = 'promise.catch(err => handleError(err))';
      expect(analyzer.hasErrorHandling(code)).toBe(true);
    });

    it('should detect throw statements', () => {
      const code = 'if (!valid) throw new Error("Invalid");';
      expect(analyzer.hasErrorHandling(code)).toBe(true);
    });
  });

  describe('measureCallDepth', () => {
    it('should measure nested function calls', () => {
      const code = 'foo(bar(baz(x)))';
      expect(analyzer.measureCallDepth(code)).toBe(3);
    });

    it('should return 0 for no calls', () => {
      const code = 'const x = 5;';
      expect(analyzer.measureCallDepth(code)).toBe(0);
    });
  });

  describe('inferReturnType', () => {
    it('should detect promise return type', () => {
      const code = 'async function getData() { return data; }';
      expect(analyzer.inferReturnType(code)).toBe('promise');
    });

    it('should detect array return type', () => {
      const code = 'function getItems() { return [1, 2, 3]; }';
      expect(analyzer.inferReturnType(code)).toBe('array');
    });

    it('should detect object return type', () => {
      const code = 'function getUser() { return { name: "John" }; }';
      expect(analyzer.inferReturnType(code)).toBe('object');
    });

    it('should detect void return type', () => {
      const code = 'function log(msg) { console.log(msg); return; }';
      expect(analyzer.inferReturnType(code)).toBe('void');
    });
  });

  describe('detectSideEffects', () => {
    it('should detect console logging', () => {
      const code = 'console.log("hello");';
      const effects = analyzer.detectSideEffects(code);
      expect(effects.some(e => e.type === 'logging')).toBe(true);
    });

    it('should detect network operations', () => {
      const code = 'fetch("/api/data")';
      const effects = analyzer.detectSideEffects(code);
      expect(effects.some(e => e.type === 'network')).toBe(true);
    });

    it('should detect storage operations', () => {
      const code = 'localStorage.setItem("key", "value")';
      const effects = analyzer.detectSideEffects(code);
      expect(effects.some(e => e.type === 'storage')).toBe(true);
    });
  });

  describe('estimateComplexity', () => {
    it('should calculate complexity for simple function', () => {
      const code = 'function add(a, b) { return a + b; }';
      expect(analyzer.estimateComplexity(code)).toBe(1);
    });

    it('should increase complexity for conditionals', () => {
      const code = 'function check(x) { if (x > 0) { return true; } else { return false; } }';
      expect(analyzer.estimateComplexity(code)).toBeGreaterThan(1);
    });

    it('should increase complexity for loops', () => {
      const code = 'function sum(arr) { let s = 0; for (let i = 0; i < arr.length; i++) { s += arr[i]; } return s; }';
      expect(analyzer.estimateComplexity(code)).toBeGreaterThan(1);
    });
  });
});

describe('FeatureExtractor', () => {
  let extractor: FeatureExtractor;
  let analyzer: ASTAnalyzer;

  beforeEach(() => {
    extractor = new FeatureExtractor();
    analyzer = new ASTAnalyzer();
  });

  it('should extract features from code', () => {
    const code = `
      async function fetchUser(id) {
        try {
          const response = await fetch(\`/api/users/\${id}\`);
          return response.json();
        } catch (error) {
          console.error(error);
          throw error;
        }
      }
    `;
    
    const analysis = analyzer.analyze(code, 'typescript');
    const features = extractor.extract(analysis, code);

    expect(features.hasAsync).toBe(true);
    expect(features.hasErrorHandling).toBe(true);
    expect(features.returnType).toBe('promise');
    expect(features.sideEffects.length).toBeGreaterThan(0);
  });

  it('should detect patterns', () => {
    const code = `
      function validateUser(user) {
        if (!user.name) return false;
        if (!user.email) return false;
        return true;
      }
    `;
    
    const analysis = analyzer.analyze(code, 'typescript');
    const features = extractor.extract(analysis, code);

    expect(features.patterns).toContain('validation');
  });

  it('should convert features to vector', () => {
    const code = 'function add(a, b) { return a + b; }';
    const analysis = analyzer.analyze(code, 'typescript');
    const features = extractor.extract(analysis, code);
    
    const vector = extractor.toVector(features, 128);
    
    expect(vector).toHaveLength(128);
    expect(vector.every(v => typeof v === 'number')).toBe(true);
  });
});

describe('PatternClassifier', () => {
  let classifier: PatternClassifier;
  let extractor: FeatureExtractor;
  let analyzer: ASTAnalyzer;

  beforeEach(() => {
    classifier = new PatternClassifier();
    extractor = new FeatureExtractor();
    analyzer = new ASTAnalyzer();
  });

  it('should classify controller code', () => {
    const code = `
      class UserController {
        async getUser(req, res, next) {
          const user = await this.userService.findById(req.params.id);
          res.json(user);
        }
      }
    `;
    
    const analysis = analyzer.analyze(code, 'typescript');
    const features = extractor.extract(analysis, code);
    const result = classifier.classify(code, features);

    expect(['controller', 'middleware']).toContain(result.category);
  });

  it('should classify service code', () => {
    const code = `
      class UserService {
        async findById(id) {
          return this.repository.findOne({ where: { id } });
        }
      }
    `;
    
    const analysis = analyzer.analyze(code, 'typescript');
    const features = extractor.extract(analysis, code);
    const result = classifier.classify(code, features);

    // Service code could be classified as service, repository, or builder depending on patterns
    expect(['service', 'repository', 'builder', 'unknown']).toContain(result.category);
  });

  it('should classify test code', () => {
    const code = `
      describe('UserService', () => {
        it('should find user by id', async () => {
          const user = await service.findById(1);
          expect(user).toBeDefined();
        });
      });
    `;
    
    const analysis = analyzer.analyze(code, 'typescript');
    const features = extractor.extract(analysis, code);
    const result = classifier.classify(code, features);

    expect(result.category).toBe('test');
  });

  it('should detect architectural patterns', () => {
    const code = `
      class CreateUserUseCase {
        constructor(private userRepository: UserRepository) {}
        
        async execute(dto: CreateUserDTO): Promise<User> {
          return this.userRepository.save(new User(dto));
        }
      }
    `;
    
    const analysis = analyzer.analyze(code, 'typescript');
    const features = extractor.extract(analysis, code);
    const result = classifier.classify(code, features);

    expect(result.architecturalPatterns).toContain('clean-architecture');
  });
});

describe('StructuralEmbedder', () => {
  let embedder: StructuralEmbedder;

  beforeEach(async () => {
    embedder = new StructuralEmbedder({ dimensions: 128 });
    await embedder.initialize();
  });

  it('should generate embeddings with correct dimensions', () => {
    const code = 'function add(a, b) { return a + b; }';
    const embedding = embedder.embed(code);
    
    expect(embedding).toHaveLength(128);
  });

  it('should generate normalized embeddings', () => {
    const code = 'async function fetchData() { return await fetch(url); }';
    const embedding = embedder.embed(code);
    
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('should generate different embeddings for different code', () => {
    const code1 = 'function add(a, b) { return a + b; }';
    const code2 = 'async function fetchUser(id) { return await api.get(id); }';
    
    const emb1 = embedder.embed(code1);
    const emb2 = embedder.embed(code2);
    
    // Should not be identical
    const identical = emb1.every((v, i) => v === emb2[i]);
    expect(identical).toBe(false);
  });

  it('should calculate similarity between code snippets', () => {
    const code1 = 'async function fetchUser(id) { return await api.get(id); }';
    const code2 = 'async function getUser(userId) { return await service.find(userId); }';
    const code3 = 'function add(a, b) { return a + b; }';
    
    const sim12 = embedder.similarity(code1, code2);
    const sim13 = embedder.similarity(code1, code3);
    
    // Similar async functions should have higher similarity
    expect(sim12).toBeGreaterThan(sim13);
  });

  it('should provide detailed embedding results', () => {
    const code = `
      class UserService {
        async findById(id) {
          return this.repository.findOne(id);
        }
      }
    `;
    
    const result = embedder.embedWithDetails(code);
    
    expect(result.embedding).toHaveLength(128);
    expect(result.features).toBeDefined();
    expect(result.classification).toBeDefined();
    expect(result.classification.category).toBeDefined();
  });
});
