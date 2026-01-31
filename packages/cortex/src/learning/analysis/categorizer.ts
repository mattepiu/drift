/**
 * Correction Categorizer
 * 
 * Categorizes corrections into 10 types to understand
 * what kind of mistake was made.
 * 
 * @module learning/analysis/categorizer
 */

import type { CorrectionCategory, CorrectionDiff } from '../../types/learning.js';

/**
 * Categorization result with confidence
 */
export interface CategorizationResult {
  /** Primary category */
  category: CorrectionCategory;
  /** Confidence in categorization (0-1) */
  confidence: number;
  /** Secondary categories that might apply */
  secondaryCategories: CorrectionCategory[];
  /** Reasoning for categorization */
  reasoning: string;
}

/**
 * Keywords associated with each category
 */
const CATEGORY_KEYWORDS: Record<CorrectionCategory, string[]> = {
  pattern_violation: [
    'pattern', 'convention', 'standard', 'consistent', 'follow',
    'established', 'existing', 'codebase', 'project',
  ],
  tribal_miss: [
    'know', 'aware', 'gotcha', 'trick', 'quirk', 'legacy',
    'historical', 'reason', 'because', 'actually', 'team',
  ],
  constraint_violation: [
    'constraint', 'rule', 'must', 'required', 'mandatory',
    'enforce', 'policy', 'compliance', 'regulation',
  ],
  style_preference: [
    'prefer', 'style', 'like', 'way', 'format', 'readable',
    'cleaner', 'better', 'nicer', 'personal',
  ],
  naming_convention: [
    'name', 'naming', 'called', 'rename', 'variable', 'function',
    'camelCase', 'snake_case', 'PascalCase', 'prefix', 'suffix',
  ],
  architecture_mismatch: [
    'architecture', 'design', 'structure', 'layer', 'module',
    'component', 'service', 'repository', 'pattern', 'separation',
  ],
  security_issue: [
    'security', 'secure', 'vulnerability', 'injection', 'xss',
    'csrf', 'auth', 'permission', 'sanitize', 'escape', 'encrypt',
  ],
  performance_issue: [
    'performance', 'slow', 'fast', 'optimize', 'efficient',
    'memory', 'cpu', 'cache', 'batch', 'lazy', 'eager',
  ],
  api_misuse: [
    'api', 'method', 'function', 'parameter', 'argument',
    'return', 'type', 'signature', 'deprecated', 'wrong',
  ],
  other: [],
};

/**
 * Code patterns associated with each category
 */
const CATEGORY_CODE_PATTERNS: Record<CorrectionCategory, RegExp[]> = {
  pattern_violation: [
    /\/\/ TODO: follow pattern/i,
    /inconsistent with/i,
  ],
  tribal_miss: [],
  constraint_violation: [
    /eslint-disable/i,
    /\@ts-ignore/i,
    /\@ts-expect-error/i,
  ],
  style_preference: [
    /prettier/i,
    /formatting/i,
  ],
  naming_convention: [
    /[a-z][A-Z]/,  // camelCase
    /[a-z]_[a-z]/,  // snake_case
    /^[A-Z][a-z]/,  // PascalCase
  ],
  architecture_mismatch: [
    /import.*from.*\.\.\//,  // Cross-layer imports
    /circular/i,
  ],
  security_issue: [
    /innerHTML/,
    /eval\(/,
    /dangerouslySetInnerHTML/,
    /password/i,
    /secret/i,
    /token/i,
  ],
  performance_issue: [
    /\.forEach\(/,
    /new Array\(/,
    /JSON\.parse.*JSON\.stringify/,
    /useEffect.*\[\]/,
  ],
  api_misuse: [
    /deprecated/i,
    /\.then\(.*\.then\(/,  // Promise chaining issues
  ],
  other: [],
};

/**
 * Correction Categorizer
 * 
 * Analyzes corrections to determine what category of mistake was made.
 */
export class CorrectionCategorizer {
  /**
   * Categorize a correction
   */
  categorize(
    original: string,
    feedback: string,
    diff: CorrectionDiff | null
  ): CategorizationResult {
    const scores = new Map<CorrectionCategory, number>();

    // Initialize all categories with 0
    for (const category of Object.keys(CATEGORY_KEYWORDS) as CorrectionCategory[]) {
      scores.set(category, 0);
    }

    // Score based on feedback keywords
    this.scoreByKeywords(feedback, scores);

    // Score based on code patterns in original
    this.scoreByCodePatterns(original, scores);

    // Score based on diff analysis
    if (diff) {
      this.scoreByDiff(diff, scores);
    }

    // Find the highest scoring category
    let maxScore = 0;
    let bestCategory: CorrectionCategory = 'other';
    const secondaryCategories: CorrectionCategory[] = [];

    for (const [category, score] of scores) {
      if (score > maxScore) {
        if (maxScore > 0) {
          secondaryCategories.push(bestCategory);
        }
        maxScore = score;
        bestCategory = category;
      } else if (score > 0 && score >= maxScore * 0.5) {
        secondaryCategories.push(category);
      }
    }

    // Calculate confidence based on score distribution
    const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? Math.min(maxScore / totalScore + 0.3, 1.0) : 0.5;

    // Generate reasoning
    const reasoning = this.generateReasoning(bestCategory, feedback, diff);

    return {
      category: bestCategory,
      confidence,
      secondaryCategories: secondaryCategories.filter(c => c !== 'other').slice(0, 2),
      reasoning,
    };
  }

  /**
   * Check if correction is a pattern violation
   */
  checkPatternViolation(original: string): boolean {
    const patterns = CATEGORY_CODE_PATTERNS.pattern_violation;
    return patterns.some(p => p.test(original));
  }

  /**
   * Check if correction is a tribal knowledge miss
   */
  checkTribalMiss(feedback: string): boolean {
    const keywords = CATEGORY_KEYWORDS.tribal_miss;
    const lowerFeedback = feedback.toLowerCase();
    return keywords.some(k => lowerFeedback.includes(k));
  }

  /**
   * Check if correction is a constraint violation
   */
  checkConstraintViolation(original: string): boolean {
    const patterns = CATEGORY_CODE_PATTERNS.constraint_violation;
    return patterns.some(p => p.test(original));
  }

  /**
   * Analyze feedback text to determine category
   */
  analyzeFeedbackText(feedback: string): CorrectionCategory {
    const result = this.categorize('', feedback, null);
    return result.category;
  }

  /**
   * Score categories based on keyword matches in feedback
   */
  private scoreByKeywords(
    feedback: string,
    scores: Map<CorrectionCategory, number>
  ): void {
    const lowerFeedback = feedback.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerFeedback.includes(keyword)) {
          const current = scores.get(category as CorrectionCategory) || 0;
          scores.set(category as CorrectionCategory, current + 1);
        }
      }
    }
  }

  /**
   * Score categories based on code patterns
   */
  private scoreByCodePatterns(
    code: string,
    scores: Map<CorrectionCategory, number>
  ): void {
    for (const [category, patterns] of Object.entries(CATEGORY_CODE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(code)) {
          const current = scores.get(category as CorrectionCategory) || 0;
          scores.set(category as CorrectionCategory, current + 2);
        }
      }
    }
  }

  /**
   * Score categories based on diff analysis
   */
  private scoreByDiff(
    diff: CorrectionDiff,
    scores: Map<CorrectionCategory, number>
  ): void {
    // Check semantic changes
    for (const change of diff.semanticChanges) {
      switch (change.type) {
        case 'add_error_handling':
          this.addScore(scores, 'pattern_violation', 1);
          break;
        case 'add_validation':
          this.addScore(scores, 'security_issue', 1);
          this.addScore(scores, 'api_misuse', 1);
          break;
        case 'rename':
          this.addScore(scores, 'naming_convention', 2);
          break;
        case 'refactor':
          this.addScore(scores, 'architecture_mismatch', 1);
          this.addScore(scores, 'style_preference', 1);
          break;
        case 'change_logic':
          this.addScore(scores, 'api_misuse', 1);
          break;
      }
    }

    // Check modifications for specific patterns
    for (const mod of diff.modifications) {
      // Check for naming changes
      if (this.isNamingChange(mod.originalContent, mod.newContent)) {
        this.addScore(scores, 'naming_convention', 2);
      }

      // Check for security-related changes
      if (this.isSecurityRelated(mod.originalContent, mod.newContent)) {
        this.addScore(scores, 'security_issue', 2);
      }
    }
  }

  /**
   * Add score to a category
   */
  private addScore(
    scores: Map<CorrectionCategory, number>,
    category: CorrectionCategory,
    amount: number
  ): void {
    const current = scores.get(category) || 0;
    scores.set(category, current + amount);
  }

  /**
   * Check if modification is primarily a naming change
   */
  private isNamingChange(original: string, corrected: string): boolean {
    // Remove whitespace and compare structure
    const originalStructure = original.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, 'ID');
    const correctedStructure = corrected.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, 'ID');
    return originalStructure === correctedStructure && original !== corrected;
  }

  /**
   * Check if modification is security-related
   */
  private isSecurityRelated(original: string, corrected: string): boolean {
    const securityPatterns = [
      /innerHTML/i,
      /eval/i,
      /password/i,
      /secret/i,
      /token/i,
      /sanitize/i,
      /escape/i,
      /encode/i,
    ];

    return securityPatterns.some(
      p => p.test(original) || p.test(corrected)
    );
  }

  /**
   * Generate reasoning for the categorization
   */
  private generateReasoning(
    category: CorrectionCategory,
    _feedback: string,
    diff: CorrectionDiff | null
  ): string {
    const reasons: string[] = [];

    switch (category) {
      case 'pattern_violation':
        reasons.push('The correction suggests following an established pattern or convention.');
        break;
      case 'tribal_miss':
        reasons.push('The feedback indicates institutional knowledge that was not applied.');
        break;
      case 'constraint_violation':
        reasons.push('A project constraint or rule was violated.');
        break;
      case 'style_preference':
        reasons.push('The correction reflects a style or formatting preference.');
        break;
      case 'naming_convention':
        reasons.push('The correction involves naming conventions.');
        if (diff?.semanticChanges.some(c => c.type === 'rename')) {
          reasons.push('Identifiers were renamed in the correction.');
        }
        break;
      case 'architecture_mismatch':
        reasons.push('The correction addresses architectural concerns.');
        break;
      case 'security_issue':
        reasons.push('The correction addresses a security concern.');
        break;
      case 'performance_issue':
        reasons.push('The correction addresses a performance concern.');
        break;
      case 'api_misuse':
        reasons.push('The correction fixes incorrect API usage.');
        break;
      case 'other':
        reasons.push('The correction does not fit a specific category.');
        break;
    }

    // Add diff-based reasoning
    if (diff) {
      if (diff.additions.length > diff.removals.length) {
        reasons.push('Code was added to address the issue.');
      } else if (diff.removals.length > diff.additions.length) {
        reasons.push('Code was removed to address the issue.');
      }
    }

    return reasons.join(' ');
  }
}
