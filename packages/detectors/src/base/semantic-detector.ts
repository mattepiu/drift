/**
 * Semantic Learning Detector Base Class
 * 
 * A truly language-agnostic detector that:
 * 1. Uses broad semantic keywords to find concepts (not syntax)
 * 2. Extracts context around matches to understand usage patterns
 * 3. Clusters by context type (function, decorator, assignment, conditional, etc.)
 * 4. Learns the dominant pattern from frequency
 * 
 * This approach works for ANY programming language because it looks for
 * semantic concepts (words like "role", "permission", "error") rather than
 * language-specific syntax.
 */

import { BaseDetector, type DetectionContext, type DetectionResult } from './base-detector.js';

import type { DetectionMethod } from '../registry/types.js';
import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Context types that can surround a semantic match
 */
export type ContextType = 
  | 'function_definition'    // def check_role, function checkRole
  | 'function_call'          // checkRole(), has_permission()
  | 'decorator'              // @requires_role, @Authorize
  | 'assignment'             // role = 'admin', const role =
  | 'conditional'            // if role ==, if has_permission
  | 'property_access'        // user.role, request.user.role
  | 'class_definition'       // class Role, class Permission
  | 'import'                 // import { role }, from 'auth'
  | 'comment'                // // check role, # permission
  | 'string_literal'         // 'admin', "permission"
  | 'type_annotation'        // : Role, -> Permission
  | 'unknown';

/**
 * A semantic match found in the code
 */
export interface SemanticMatch {
  /** The keyword that matched */
  keyword: string;
  
  /** Full matched text (includes surrounding context) */
  matchedText: string;
  
  /** The context type */
  contextType: ContextType;
  
  /** Line number */
  line: number;
  
  /** Column number */
  column: number;
  
  /** File path */
  file: string;
  
  /** The full line of code for context */
  lineContent: string;
  
  /** Surrounding lines for additional context */
  surroundingContext: string;
}

/**
 * A learned usage pattern
 */
export interface UsagePattern {
  /** The context type */
  contextType: ContextType;
  
  /** Example matches */
  examples: string[];
  
  /** Number of occurrences */
  count: number;
  
  /** Files where this pattern appears */
  files: string[];
  
  /** Percentage of total matches */
  percentage: number;
}

/**
 * Result of semantic learning
 */
export interface SemanticLearningResult {
  /** All usage patterns found, sorted by frequency */
  patterns: UsagePattern[];
  
  /** The dominant pattern (most common) */
  dominantPattern: UsagePattern | null;
  
  /** Total matches found */
  totalMatches: number;
  
  /** Files analyzed */
  filesAnalyzed: number;
  
  /** Whether enough data was found to establish conventions */
  hasEnoughData: boolean;
}

/**
 * Configuration for semantic detection
 */
export interface SemanticDetectorConfig {
  /** Keywords to search for (semantic concepts) */
  keywords: string[];
  
  /** Minimum occurrences to consider a pattern established */
  minOccurrences: number;
  
  /** Minimum percentage to consider a pattern "dominant" (0-1) */
  dominanceThreshold: number;
  
  /** Minimum files that must contain the pattern */
  minFiles: number;
  
  /** Whether to include matches in comments */
  includeComments: boolean;
  
  /** Whether to include matches in string literals */
  includeStrings: boolean;
}

const DEFAULT_SEMANTIC_CONFIG: SemanticDetectorConfig = {
  keywords: [],
  minOccurrences: 3,
  dominanceThreshold: 0.4, // Lower threshold - we want to detect patterns even if mixed
  minFiles: 2,
  includeComments: false,
  includeStrings: false,
};

// ============================================================================
// Context Detection Patterns (Language Agnostic)
// ============================================================================

/**
 * Patterns to detect context type around a match
 * These work across languages because they look for universal patterns
 */
const CONTEXT_PATTERNS: Array<{ type: ContextType; pattern: RegExp }> = [
  // Decorators: @something, @Something() (Python/Java/etc)
  { type: 'decorator', pattern: /^\s*@\w*{KEYWORD}\w*\s*(\(|$)/i },
  
  // PHP 8 Attributes: #[Something], #[Something()]
  { type: 'decorator', pattern: /^\s*#\[\w*{KEYWORD}\w*\s*(\(|])/i },
  
  // Function definition: def/function/func followed by keyword
  { type: 'function_definition', pattern: /(?:def|function|func|fn)\s+\w*{KEYWORD}\w*\s*\(/i },
  
  // PHP method definition: public/protected/private function
  { type: 'function_definition', pattern: /(?:public|protected|private)\s+(?:static\s+)?function\s+\w*{KEYWORD}\w*\s*\(/i },
  
  // Class definition: class Keyword
  { type: 'class_definition', pattern: /(?:class|struct|interface|type|trait|enum)\s+\w*{KEYWORD}\w*/i },
  
  // Import statements (including PHP use)
  { type: 'import', pattern: /(?:import|from|require|use)\s+.*{KEYWORD}/i },
  
  // Property access: .keyword or ['keyword'] or ->keyword (PHP)
  { type: 'property_access', pattern: /(?:\.|->)\s*{KEYWORD}\b|\[\s*['"`]{KEYWORD}['"`]\s*\]/i },
  
  // Function call: keyword( or keyword.something( or keyword->something( (PHP)
  { type: 'function_call', pattern: /\b{KEYWORD}\w*\s*\(/i },
  
  // Static method call: Class::keyword() (PHP)
  { type: 'function_call', pattern: /\w+::{KEYWORD}\w*\s*\(/i },
  
  // Conditional: if/elif/else if/when/case followed by keyword
  { type: 'conditional', pattern: /(?:if|elif|else\s+if|when|case|switch).*{KEYWORD}/i },
  
  // Assignment: keyword = or keyword := or $keyword = (PHP)
  { type: 'assignment', pattern: /(?:\$?\b{KEYWORD}\w*)\s*[:=]/i },
  
  // Type annotation: : Keyword or -> Keyword
  { type: 'type_annotation', pattern: /[:\-]>\s*\w*{KEYWORD}\w*/i },
  
  // Comment: // or # or /* followed by keyword
  { type: 'comment', pattern: /(?:\/\/|#|\/\*|<!--).*{KEYWORD}/i },
  
  // String literal: 'keyword' or "keyword"
  { type: 'string_literal', pattern: /['"`].*{KEYWORD}.*['"`]/i },
];

// ============================================================================
// Semantic Detector Base Class
// ============================================================================

/**
 * Abstract base class for semantic learning detectors
 */
export abstract class SemanticDetector extends BaseDetector {
  /** Detection method */
  readonly detectionMethod: DetectionMethod = 'custom';
  
  /** Semantic configuration */
  protected config: SemanticDetectorConfig;
  
  /** Cached learning result */
  protected learningResult: SemanticLearningResult | null = null;
  
  /** All languages supported - semantic detection is language agnostic */
  readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'csharp', 'php', 'css', 'scss', 'json', 'yaml', 'markdown'
  ];

  constructor(config: Partial<SemanticDetectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_SEMANTIC_CONFIG, ...config };
  }

  // ============================================================================
  // Abstract Methods
  // ============================================================================

  /**
   * Get the semantic keywords for this detector
   * These are the concepts we're looking for (e.g., 'role', 'permission', 'auth')
   */
  protected abstract getSemanticKeywords(): string[];

  /**
   * Get the category name for this detector (e.g., 'auth', 'error', 'logging')
   */
  protected abstract getSemanticCategory(): string;

  /**
   * Determine if a match is relevant (subclasses can filter out false positives)
   */
  protected isRelevantMatch(_match: SemanticMatch): boolean {
    return true; // Default: all matches are relevant
  }

  /**
   * Create a violation for an inconsistent pattern
   */
  protected abstract createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation;

  // ============================================================================
  // Semantic Analysis
  // ============================================================================

  /**
   * Find all semantic matches in content
   */
  protected findSemanticMatches(context: DetectionContext): SemanticMatch[] {
    const matches: SemanticMatch[] = [];
    const keywords = this.getSemanticKeywords();
    const lines = context.content.split('\n');

    for (const keyword of keywords) {
      // Build a regex that finds the keyword as a word boundary
      const keywordRegex = new RegExp(`\\b${this.escapeRegex(keyword)}\\w*\\b`, 'gi');
      
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        let match;
        
        while ((match = keywordRegex.exec(line)) !== null) {
          const contextType = this.detectContextType(line, keyword);
          
          // Skip comments/strings if configured
          if (contextType === 'comment' && !this.config.includeComments) {continue;}
          if (contextType === 'string_literal' && !this.config.includeStrings) {continue;}
          
          const semanticMatch: SemanticMatch = {
            keyword,
            matchedText: match[0],
            contextType,
            line: lineNum,
            column: match.index + 1,
            file: context.file,
            lineContent: line.trim(),
            surroundingContext: this.getSurroundingContext(lines, lineNum - 1),
          };
          
          if (this.isRelevantMatch(semanticMatch)) {
            matches.push(semanticMatch);
          }
        }
      }
    }

    return matches;
  }

  /**
   * Detect the context type for a match
   */
  protected detectContextType(line: string, keyword: string): ContextType {
    for (const { type, pattern } of CONTEXT_PATTERNS) {
      // Replace {KEYWORD} placeholder with actual keyword
      const concretePattern = new RegExp(
        pattern.source.replace(/{KEYWORD}/g, this.escapeRegex(keyword)),
        pattern.flags
      );
      
      if (concretePattern.test(line)) {
        return type;
      }
    }
    
    return 'unknown';
  }

  /**
   * Get surrounding lines for context
   */
  protected getSurroundingContext(lines: string[], lineIndex: number, range: number = 2): string {
    const start = Math.max(0, lineIndex - range);
    const end = Math.min(lines.length, lineIndex + range + 1);
    return lines.slice(start, end).join('\n');
  }

  /**
   * Escape special regex characters
   */
  protected escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ============================================================================
  // Learning
  // ============================================================================

  /**
   * Learn patterns from the project
   */
  async learnFromProject(contexts: DetectionContext[]): Promise<SemanticLearningResult> {
    const allMatches: SemanticMatch[] = [];
    const contextCounts = new Map<ContextType, { count: number; files: Set<string>; examples: string[] }>();
    
    // Initialize counts for all context types
    const contextTypes: ContextType[] = [
      'function_definition', 'function_call', 'decorator', 'assignment',
      'conditional', 'property_access', 'class_definition', 'import',
      'comment', 'string_literal', 'type_annotation', 'unknown'
    ];
    
    for (const type of contextTypes) {
      contextCounts.set(type, { count: 0, files: new Set(), examples: [] });
    }

    // Analyze each file
    for (const context of contexts) {
      if (!this.supportsLanguage(context.language)) {continue;}
      if (context.isTestFile || context.isTypeDefinition) {continue;}
      
      const matches = this.findSemanticMatches(context);
      allMatches.push(...matches);
      
      for (const match of matches) {
        const entry = contextCounts.get(match.contextType)!;
        entry.count++;
        entry.files.add(match.file);
        if (entry.examples.length < 5) {
          entry.examples.push(match.lineContent);
        }
      }
    }

    // Build patterns sorted by frequency
    const patterns: UsagePattern[] = [];
    const totalMatches = allMatches.length;
    
    for (const [contextType, data] of contextCounts) {
      if (data.count === 0) {continue;}
      
      patterns.push({
        contextType,
        examples: data.examples,
        count: data.count,
        files: Array.from(data.files),
        percentage: totalMatches > 0 ? data.count / totalMatches : 0,
      });
    }
    
    // Sort by count descending
    patterns.sort((a, b) => b.count - a.count);

    // Determine dominant pattern
    let dominantPattern: UsagePattern | null = null;
    if (patterns.length > 0) {
      const topPattern = patterns[0]!;
      if (topPattern.count >= this.config.minOccurrences &&
          topPattern.percentage >= this.config.dominanceThreshold &&
          topPattern.files.length >= this.config.minFiles) {
        dominantPattern = topPattern;
      }
    }

    this.learningResult = {
      patterns,
      dominantPattern,
      totalMatches,
      filesAnalyzed: contexts.length,
      hasEnoughData: totalMatches >= this.config.minOccurrences,
    };

    return this.learningResult;
  }

  /**
   * Set pre-learned result
   */
  setLearningResult(result: SemanticLearningResult): void {
    this.learningResult = result;
  }

  /**
   * Get learning result
   */
  getLearningResult(): SemanticLearningResult | null {
    return this.learningResult;
  }

  // ============================================================================
  // Detection
  // ============================================================================

  /**
   * Calculate confidence score based on actual metrics
   */
  protected calculateConfidenceScore(
    matches: SemanticMatch[],
    totalFiles: number
  ): { score: number; level: 'high' | 'medium' | 'low' | 'uncertain' } {
    if (matches.length === 0) {
      return { score: 0, level: 'uncertain' };
    }

    // Frequency: matches relative to files analyzed
    const frequency = Math.min(matches.length / Math.max(totalFiles, 1), 1);
    
    // Spread: unique files containing matches
    const uniqueFiles = new Set(matches.map(m => m.file)).size;
    const spread = Math.min(uniqueFiles / Math.max(totalFiles * 0.1, 1), 1); // Expect ~10% of files
    
    // Consistency: how uniform are the context types?
    const contextCounts = new Map<ContextType, number>();
    for (const m of matches) {
      contextCounts.set(m.contextType, (contextCounts.get(m.contextType) || 0) + 1);
    }
    const dominantCount = Math.max(...contextCounts.values());
    const consistency = dominantCount / matches.length;
    
    // Age factor: assume patterns are established (would need metadata for real age)
    const ageFactor = 0.8; // Default to established
    
    // Weighted score
    const score = 
      frequency * 0.35 +
      consistency * 0.35 +
      spread * 0.15 +
      ageFactor * 0.15;
    
    // Determine level
    let level: 'high' | 'medium' | 'low' | 'uncertain';
    if (score >= 0.85) {level = 'high';}
    else if (score >= 0.70) {level = 'medium';}
    else if (score >= 0.50) {level = 'low';}
    else {level = 'uncertain';}
    
    return { score, level };
  }

  /**
   * Main detection method
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    // Find all semantic matches in this file
    const matches = this.findSemanticMatches(context);
    
    // Calculate confidence based on matches found
    const { score: baseConfidence } = this.calculateConfidenceScore(matches, 1);
    
    // If we have learned conventions, check for violations
    if (this.learningResult?.dominantPattern) {
      const dominant = this.learningResult.dominantPattern;
      
      // Use learned confidence if available, otherwise calculate
      const confidence = this.learningResult.hasEnoughData 
        ? Math.min(dominant.percentage + 0.3, 1.0)  // Boost dominant pattern confidence
        : baseConfidence;
      
      for (const match of matches) {
        const isOutlier = match.contextType !== dominant.contextType && 
                          match.contextType !== 'unknown' &&
                          dominant.contextType !== 'unknown';
        
        // Outliers get lower confidence
        const matchConfidence = isOutlier ? confidence * 0.6 : confidence;
        
        patterns.push({
          patternId: `${this.id}/${match.contextType}`,
          location: {
            file: match.file,
            line: match.line,
            column: match.column,
          },
          confidence: matchConfidence,
          isOutlier,
        });
        
        // If this doesn't match the dominant pattern, it's a violation
        if (isOutlier) {
          violations.push(this.createPatternViolation(match, dominant));
        }
      }
    } else {
      // No learned conventions yet - calculate confidence per match
      for (const match of matches) {
        // Base confidence on context type quality
        let matchConfidence = baseConfidence;
        
        // Boost confidence for strong context types
        if (['function_definition', 'class_definition', 'decorator'].includes(match.contextType)) {
          matchConfidence = Math.min(matchConfidence + 0.15, 1.0);
        }
        // Lower confidence for weak context types
        if (['unknown', 'string_literal', 'comment'].includes(match.contextType)) {
          matchConfidence = Math.max(matchConfidence - 0.2, 0.3);
        }
        
        patterns.push({
          patternId: `${this.id}/${match.contextType}`,
          location: {
            file: match.file,
            line: match.line,
            column: match.column,
          },
          confidence: matchConfidence,
          isOutlier: false,
        });
      }
    }

    return this.createResult(patterns, violations, patterns.length > 0 ? 0.9 : 0);
  }

  /**
   * Generate quick fix - default returns null
   */
  generateQuickFix(_violation: Violation): null {
    return null;
  }
}

export { DEFAULT_SEMANTIC_CONFIG };
