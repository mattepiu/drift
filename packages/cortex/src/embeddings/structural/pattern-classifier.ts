/**
 * Pattern Classifier
 * 
 * Classifies code into architectural patterns and
 * code structure categories for structural embeddings.
 * 
 * @module embeddings/structural/pattern-classifier
 */

import type { StructuralFeatures } from './feature-extractor.js';

/**
 * Code pattern category
 */
export type PatternCategory =
  | 'controller'
  | 'service'
  | 'repository'
  | 'middleware'
  | 'validator'
  | 'transformer'
  | 'factory'
  | 'builder'
  | 'singleton'
  | 'observer'
  | 'decorator'
  | 'utility'
  | 'handler'
  | 'hook'
  | 'component'
  | 'test'
  | 'config'
  | 'unknown';

/**
 * Classification result
 */
export interface ClassificationResult {
  /** Primary category */
  category: PatternCategory;
  /** Confidence score (0-1) */
  confidence: number;
  /** Secondary categories with scores */
  secondary: Array<{ category: PatternCategory; confidence: number }>;
  /** Detected architectural patterns */
  architecturalPatterns: string[];
  /** Code style indicators */
  styleIndicators: string[];
}

/**
 * Pattern classifier configuration
 */
export interface PatternClassifierConfig {
  /** Minimum confidence for classification */
  minConfidence: number;
  /** Maximum secondary categories to return */
  maxSecondary: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PatternClassifierConfig = {
  minConfidence: 0.3,
  maxSecondary: 3,
};

/**
 * Pattern detection rules
 */
interface PatternRule {
  category: PatternCategory;
  codePatterns: RegExp[];
  featureIndicators: (features: StructuralFeatures) => boolean;
  weight: number;
}

/**
 * Pattern rules for classification
 */
const PATTERN_RULES: PatternRule[] = [
  {
    category: 'controller',
    codePatterns: [
      /class\s+\w*Controller/i,
      /@Controller\s*\(/,
      /router\.(get|post|put|delete|patch)\s*\(/,
      /app\.(get|post|put|delete|patch)\s*\(/,
    ],
    featureIndicators: (f) => f.patterns.includes('middleware-pattern'),
    weight: 1.0,
  },
  {
    category: 'service',
    codePatterns: [
      /class\s+\w*Service/i,
      /@Service\s*\(/,
      /@Injectable\s*\(/,
    ],
    featureIndicators: (f) => f.hasAsync && !f.patterns.includes('middleware-pattern'),
    weight: 0.8,
  },
  {
    category: 'repository',
    codePatterns: [
      /class\s+\w*Repository/i,
      /@Repository\s*\(/,
      /\.(find|save|delete|update|create)\s*\(/,
      /prisma\.|typeorm\.|sequelize\./i,
    ],
    featureIndicators: (f) => f.sideEffects.some(e => e.type === 'io'),
    weight: 0.9,
  },
  {
    category: 'middleware',
    codePatterns: [
      /\(req,\s*res,\s*next\)/,
      /\(request,\s*response,\s*next\)/,
      /middleware/i,
      /\.use\s*\(/,
    ],
    featureIndicators: (f) => f.patterns.includes('middleware-pattern'),
    weight: 1.0,
  },
  {
    category: 'validator',
    codePatterns: [
      /class\s+\w*Validator/i,
      /validate|isValid|check[A-Z]/,
      /@IsString|@IsNumber|@IsEmail/,
      /Joi\.|yup\.|zod\./,
    ],
    featureIndicators: (f) => f.patterns.includes('validation'),
    weight: 0.9,
  },
  {
    category: 'transformer',
    codePatterns: [
      /class\s+\w*Transformer/i,
      /transform|convert|map[A-Z]/,
      /toDTO|fromDTO|serialize|deserialize/i,
    ],
    featureIndicators: (f) => f.returnType === 'object' || f.returnType === 'array',
    weight: 0.7,
  },
  {
    category: 'factory',
    codePatterns: [
      /class\s+\w*Factory/i,
      /create[A-Z]\w*\s*\(/,
      /Factory\s*\{/,
    ],
    featureIndicators: (f) => f.patterns.includes('factory-pattern'),
    weight: 1.0,
  },
  {
    category: 'builder',
    codePatterns: [
      /class\s+\w*Builder/i,
      /\.build\s*\(/,
      /return\s+this\b/,
    ],
    featureIndicators: (f) => f.patterns.includes('builder-pattern'),
    weight: 1.0,
  },
  {
    category: 'singleton',
    codePatterns: [
      /static\s+instance/,
      /getInstance\s*\(/,
      /private\s+constructor/,
    ],
    featureIndicators: (f) => f.patterns.includes('singleton-pattern'),
    weight: 1.0,
  },
  {
    category: 'observer',
    codePatterns: [
      /subscribe|unsubscribe|notify/,
      /addEventListener|removeEventListener/,
      /EventEmitter|Subject|Observable/,
    ],
    featureIndicators: (f) => f.patterns.includes('event-handler'),
    weight: 0.9,
  },
  {
    category: 'decorator',
    codePatterns: [
      /@\w+\s*\(/,
      /decorator/i,
      /wrap\s*\(/,
    ],
    featureIndicators: (f) => f.patterns.includes('decorator-pattern'),
    weight: 0.8,
  },
  {
    category: 'utility',
    codePatterns: [
      /utils?|helpers?|common/i,
      /export\s+function\s+\w+/,
    ],
    featureIndicators: (f) => !f.hasAsync && f.complexity < 5,
    weight: 0.5,
  },
  {
    category: 'handler',
    codePatterns: [
      /class\s+\w*Handler/i,
      /handle[A-Z]\w*\s*\(/,
      /on[A-Z]\w*\s*\(/,
    ],
    featureIndicators: (f) => f.patterns.includes('event-handler'),
    weight: 0.8,
  },
  {
    category: 'hook',
    codePatterns: [
      /^use[A-Z]/m,
      /function\s+use[A-Z]/,
      /const\s+use[A-Z]/,
    ],
    featureIndicators: (f) => f.hasAsync || f.returnType === 'array',
    weight: 0.9,
  },
  {
    category: 'component',
    codePatterns: [
      /React\.|jsx|tsx/,
      /function\s+\w+\s*\(\s*\{\s*\w+/,
      /export\s+default\s+function/,
      /<\w+[^>]*>/,
    ],
    featureIndicators: (f) => f.returnType === 'object',
    weight: 0.7,
  },
  {
    category: 'test',
    codePatterns: [
      /describe\s*\(|it\s*\(|test\s*\(/,
      /expect\s*\(|assert\./,
      /\.spec\.|\.test\./,
      /beforeEach|afterEach|beforeAll|afterAll/,
    ],
    featureIndicators: () => false,
    weight: 1.0,
  },
  {
    category: 'config',
    codePatterns: [
      /config|configuration|settings/i,
      /export\s+(const|default)\s+\{/,
      /process\.env\./,
    ],
    featureIndicators: (f) => f.complexity < 3 && !f.hasAsync,
    weight: 0.6,
  },
];

/**
 * Pattern classifier for structural embeddings
 */
export class PatternClassifier {
  private config: PatternClassifierConfig;

  constructor(config?: Partial<PatternClassifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Classify code into pattern categories
   */
  classify(code: string, features: StructuralFeatures): ClassificationResult {
    const scores = new Map<PatternCategory, number>();

    // Score each pattern rule
    for (const rule of PATTERN_RULES) {
      let score = 0;

      // Check code patterns
      for (const pattern of rule.codePatterns) {
        if (pattern.test(code)) {
          score += rule.weight;
        }
      }

      // Check feature indicators
      if (rule.featureIndicators(features)) {
        score += rule.weight * 0.5;
      }

      if (score > 0) {
        scores.set(rule.category, (scores.get(rule.category) ?? 0) + score);
      }
    }

    // Normalize scores
    const maxScore = Math.max(...scores.values(), 1);
    const normalizedScores = new Map<PatternCategory, number>();
    for (const [category, score] of scores) {
      normalizedScores.set(category, score / maxScore);
    }

    // Sort by score
    const sorted = Array.from(normalizedScores.entries())
      .sort((a, b) => b[1] - a[1]);

    // Get primary category
    const [primaryCategory, primaryConfidence] = sorted[0] ?? ['unknown', 0];

    // Get secondary categories
    const secondary = sorted
      .slice(1, this.config.maxSecondary + 1)
      .filter(([, conf]) => conf >= this.config.minConfidence)
      .map(([category, confidence]) => ({ category, confidence }));

    // Detect architectural patterns
    const architecturalPatterns = this.detectArchitecturalPatterns(code, features);

    // Detect style indicators
    const styleIndicators = this.detectStyleIndicators(code, features);

    return {
      category: primaryConfidence >= this.config.minConfidence ? primaryCategory : 'unknown',
      confidence: primaryConfidence,
      secondary,
      architecturalPatterns,
      styleIndicators,
    };
  }

  /**
   * Detect architectural patterns
   */
  private detectArchitecturalPatterns(code: string, features: StructuralFeatures): string[] {
    const patterns: string[] = [];

    // MVC patterns
    if (/Controller|View|Model/i.test(code)) {
      patterns.push('mvc');
    }

    // Clean architecture
    if (/UseCase|Repository|Entity|Domain/i.test(code)) {
      patterns.push('clean-architecture');
    }

    // CQRS
    if (/Command|Query|Handler/i.test(code)) {
      patterns.push('cqrs');
    }

    // Event sourcing
    if (/Event|Aggregate|EventStore/i.test(code)) {
      patterns.push('event-sourcing');
    }

    // Dependency injection
    if (/@Inject|@Injectable|container\./i.test(code)) {
      patterns.push('dependency-injection');
    }

    // Layered architecture
    if (/Service|Repository|Controller/i.test(code)) {
      patterns.push('layered');
    }

    // Functional patterns
    if (features.patterns.includes('promise-based') || features.patterns.includes('observable-based')) {
      patterns.push('reactive');
    }

    return patterns;
  }

  /**
   * Detect code style indicators
   */
  private detectStyleIndicators(code: string, features: StructuralFeatures): string[] {
    const indicators: string[] = [];

    // TypeScript
    if (/:\s*(string|number|boolean|void|any)\b|interface\s+\w+|type\s+\w+\s*=/.test(code)) {
      indicators.push('typescript');
    }

    // Functional style
    if (/=>\s*\{|\.map\(|\.filter\(|\.reduce\(/.test(code) && !features.hasLoops) {
      indicators.push('functional');
    }

    // OOP style
    if (/class\s+\w+|extends\s+\w+|implements\s+\w+/.test(code)) {
      indicators.push('object-oriented');
    }

    // Async style
    if (features.hasAsync) {
      indicators.push('async');
    }

    // Error handling
    if (features.hasErrorHandling) {
      indicators.push('defensive');
    }

    // Verbose
    if (features.complexity > 15 || features.maxNesting > 5) {
      indicators.push('complex');
    } else if (features.complexity < 5 && features.maxNesting < 3) {
      indicators.push('simple');
    }

    return indicators;
  }

  /**
   * Get category embedding vector
   */
  getCategoryVector(category: PatternCategory, dimensions: number): number[] {
    const categories: PatternCategory[] = [
      'controller', 'service', 'repository', 'middleware', 'validator',
      'transformer', 'factory', 'builder', 'singleton', 'observer',
      'decorator', 'utility', 'handler', 'hook', 'component', 'test', 'config', 'unknown',
    ];

    const vector = new Array(dimensions).fill(0);
    const idx = categories.indexOf(category);
    
    if (idx >= 0 && idx < dimensions) {
      vector[idx] = 1;
    }

    return vector;
  }
}
