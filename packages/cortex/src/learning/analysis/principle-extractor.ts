/**
 * Principle Extractor
 * 
 * Extracts generalizable principles from corrections that can
 * be applied to future code generation.
 * 
 * @module learning/analysis/principle-extractor
 */

import type {
  CorrectionCategory,
  CorrectionDiff,
  ExtractedPrinciple,
  PrincipleScope,
} from '../../types/learning.js';

/**
 * Principle templates for each category
 */
const PRINCIPLE_TEMPLATES: Record<CorrectionCategory, string[]> = {
  pattern_violation: [
    'Follow the established {pattern} pattern when {context}',
    'Use {pattern} consistently across the codebase',
    'Maintain consistency with existing {pattern} implementations',
  ],
  tribal_miss: [
    'Remember that {knowledge} when working with {context}',
    'Be aware that {knowledge}',
    'Consider {knowledge} before {action}',
  ],
  constraint_violation: [
    'Always {constraint} when {context}',
    'Never {antipattern} in this codebase',
    'Ensure {constraint} is satisfied',
  ],
  style_preference: [
    'Prefer {preferred} over {alternative} for {context}',
    'Use {style} style for {context}',
    'Format {element} as {format}',
  ],
  naming_convention: [
    'Name {element} using {convention} convention',
    'Use {prefix} prefix for {element}',
    'Follow {convention} naming for {context}',
  ],
  architecture_mismatch: [
    'Place {element} in {layer} layer',
    'Keep {concern} separate from {other}',
    'Use {pattern} for {context}',
  ],
  security_issue: [
    'Always {action} to prevent {vulnerability}',
    'Never {antipattern} as it creates {risk}',
    'Sanitize {input} before {usage}',
  ],
  performance_issue: [
    'Optimize {operation} by {technique}',
    'Avoid {antipattern} for better performance',
    'Use {technique} instead of {alternative} for {context}',
  ],
  api_misuse: [
    'Use {correct} instead of {incorrect} for {purpose}',
    'Call {api} with {parameters}',
    'Handle {case} when using {api}',
  ],
  other: [
    'Consider {consideration} when {context}',
    'Apply {technique} for {purpose}',
  ],
};

/**
 * Principle Extractor
 * 
 * Analyzes corrections to extract generalizable principles.
 */
export class PrincipleExtractor {
  /**
   * Extract a principle from a correction
   */
  extract(
    original: string,
    feedback: string,
    diff: CorrectionDiff | null,
    category: CorrectionCategory
  ): ExtractedPrinciple {
    // Try to extract from diff first (most specific)
    if (diff) {
      const diffPrinciple = this.extractFromDiff(diff, category);
      if (diffPrinciple) {
        return diffPrinciple;
      }
    }

    // Fall back to extracting from feedback
    return this.extractFromFeedback(feedback, category, original);
  }

  /**
   * Extract principle from diff analysis
   */
  extractFromDiff(
    diff: CorrectionDiff,
    category: CorrectionCategory
  ): ExtractedPrinciple | null {
    // Analyze semantic changes
    for (const change of diff.semanticChanges) {
      switch (change.type) {
        case 'add_error_handling':
          return this.createPrinciple(
            'Always include error handling for operations that can fail',
            'Error handling was missing and needed to be added.',
            category,
            { projectWide: true },
            0.8
          );

        case 'add_validation':
          return this.createPrinciple(
            'Validate inputs before processing',
            'Input validation was missing and needed to be added.',
            category,
            { projectWide: true },
            0.8
          );

        case 'rename':
          const renamed = change.affectedElements.join(', ');
          return this.createPrinciple(
            `Use appropriate naming for ${renamed}`,
            `Identifiers were renamed to follow conventions: ${change.description}`,
            category,
            { projectWide: false },
            0.7
          );

        case 'refactor':
          return this.createPrinciple(
            'Structure code according to project conventions',
            'Code structure was refactored to match project patterns.',
            category,
            { projectWide: true },
            0.6
          );
      }
    }

    // Analyze modifications for patterns
    if (diff.modifications.length > 0) {
      const patterns = this.findModificationPatterns(diff.modifications);
      const firstPattern = patterns[0];
      if (firstPattern) {
        return this.createPrinciple(
          firstPattern.principle,
          firstPattern.explanation,
          category,
          { projectWide: firstPattern.projectWide },
          firstPattern.confidence
        );
      }
    }

    return null;
  }

  /**
   * Extract principle from feedback text
   */
  extractFromFeedback(
    feedback: string,
    category: CorrectionCategory,
    original: string
  ): ExtractedPrinciple {
    // Extract key phrases from feedback
    const keyPhrases = this.extractKeyPhrases(feedback);

    // Generate principle statement
    const statement = this.generateStatement(keyPhrases, category, feedback);

    // Determine scope
    const scope = this.determineScope(feedback, original);

    // Extract examples if possible
    const { correctExample, incorrectExample } = this.extractExamples(
      feedback,
      original
    );

    // Extract keywords for matching
    const keywords = this.extractKeywords(feedback, category);

    // Determine if this is a hard rule
    const isHardRule = this.isHardRule(feedback, category);

    const principle: ExtractedPrinciple = {
      statement,
      explanation: feedback,
      scope,
      confidence: this.calculateConfidence(keyPhrases, category),
      keywords,
      isHardRule,
    };

    // Only add optional properties if they have values
    if (correctExample) {
      principle.correctExample = correctExample;
    }
    if (incorrectExample) {
      principle.incorrectExample = incorrectExample;
    }

    return principle;
  }

  /**
   * Determine the scope where a principle applies
   */
  determineScope(feedback: string, _original: string): PrincipleScope {
    const scope: PrincipleScope = {
      projectWide: true,
    };

    // Check for file pattern mentions
    const filePatterns = this.extractFilePatterns(feedback);
    if (filePatterns.length > 0) {
      scope.filePatterns = filePatterns;
      scope.projectWide = false;
    }

    // Check for language mentions
    const languages = this.extractLanguages(feedback);
    if (languages.length > 0) {
      scope.languages = languages;
    }

    // Check for framework mentions
    const frameworks = this.extractFrameworks(feedback);
    if (frameworks.length > 0) {
      scope.frameworks = frameworks;
    }

    // Check for pattern mentions
    const patterns = this.extractPatternNames(feedback);
    if (patterns.length > 0) {
      scope.patterns = patterns;
    }

    return scope;
  }

  /**
   * Create a principle with all fields
   */
  private createPrinciple(
    statement: string,
    explanation: string,
    category: CorrectionCategory,
    scopeOverrides: Partial<PrincipleScope>,
    confidence: number
  ): ExtractedPrinciple {
    return {
      statement,
      explanation,
      scope: {
        projectWide: true,
        ...scopeOverrides,
      },
      confidence,
      keywords: this.extractKeywordsFromStatement(statement),
      isHardRule: category === 'security_issue' || category === 'constraint_violation',
    };
  }

  /**
   * Find patterns in modifications
   */
  private findModificationPatterns(
    modifications: Array<{ originalContent: string; newContent: string }>
  ): Array<{
    principle: string;
    explanation: string;
    projectWide: boolean;
    confidence: number;
  }> {
    const patterns: Array<{
      principle: string;
      explanation: string;
      projectWide: boolean;
      confidence: number;
    }> = [];

    for (const mod of modifications) {
      // Check for async/await changes
      if (!mod.originalContent.includes('await') && mod.newContent.includes('await')) {
        patterns.push({
          principle: 'Use await for async operations',
          explanation: 'Async operations should be awaited to ensure proper execution order.',
          projectWide: true,
          confidence: 0.8,
        });
      }

      // Check for null checks
      if (
        !mod.originalContent.includes('?') &&
        !mod.originalContent.includes('null') &&
        (mod.newContent.includes('?.') || mod.newContent.includes('?? '))
      ) {
        patterns.push({
          principle: 'Use optional chaining or nullish coalescing for potentially null values',
          explanation: 'Null safety was added to prevent runtime errors.',
          projectWide: true,
          confidence: 0.8,
        });
      }

      // Check for type assertions
      if (
        !mod.originalContent.includes(' as ') &&
        mod.newContent.includes(' as ')
      ) {
        patterns.push({
          principle: 'Use type assertions when TypeScript cannot infer the correct type',
          explanation: 'Type assertion was added for type safety.',
          projectWide: false,
          confidence: 0.6,
        });
      }
    }

    return patterns;
  }

  /**
   * Extract key phrases from feedback
   */
  private extractKeyPhrases(feedback: string): string[] {
    const phrases: string[] = [];

    // Look for "should" statements
    const shouldMatch = feedback.match(/should\s+([^.!?]+)/gi);
    if (shouldMatch) {
      phrases.push(...shouldMatch);
    }

    // Look for "always" statements
    const alwaysMatch = feedback.match(/always\s+([^.!?]+)/gi);
    if (alwaysMatch) {
      phrases.push(...alwaysMatch);
    }

    // Look for "never" statements
    const neverMatch = feedback.match(/never\s+([^.!?]+)/gi);
    if (neverMatch) {
      phrases.push(...neverMatch);
    }

    // Look for "use X instead of Y"
    const insteadMatch = feedback.match(/use\s+(\w+)\s+instead\s+of\s+(\w+)/gi);
    if (insteadMatch) {
      phrases.push(...insteadMatch);
    }

    return phrases;
  }

  /**
   * Generate a principle statement
   */
  private generateStatement(
    keyPhrases: string[],
    category: CorrectionCategory,
    feedback: string
  ): string {
    // If we have key phrases, use the first one
    const phrase = keyPhrases[0];
    if (phrase) {
      // Clean up and capitalize
      return phrase.charAt(0).toUpperCase() + phrase.slice(1).trim();
    }

    // Fall back to template-based generation
    const templates = PRINCIPLE_TEMPLATES[category];
    const firstTemplate = templates?.[0];
    if (firstTemplate) {
      // Use first template with placeholders filled from feedback
      return this.fillTemplate(firstTemplate, feedback);
    }

    // Last resort: summarize feedback
    return this.summarizeFeedback(feedback);
  }

  /**
   * Fill a template with values from feedback
   */
  private fillTemplate(template: string, feedback: string): string {
    // Extract potential values from feedback
    const words = feedback.split(/\s+/);
    const nouns = words.filter(w => w.length > 3 && /^[a-z]+$/i.test(w));

    // Replace placeholders with extracted values or generic terms
    return template
      .replace(/{pattern}/g, nouns[0] || 'established')
      .replace(/{context}/g, 'this context')
      .replace(/{knowledge}/g, feedback.slice(0, 50))
      .replace(/{constraint}/g, 'the requirement')
      .replace(/{preferred}/g, nouns[0] || 'the preferred approach')
      .replace(/{alternative}/g, nouns[1] || 'alternatives')
      .replace(/{element}/g, 'code elements')
      .replace(/{convention}/g, 'project')
      .replace(/{action}/g, 'follow best practices')
      .replace(/{vulnerability}/g, 'security issues')
      .replace(/{technique}/g, 'the recommended approach')
      .replace(/{api}/g, 'the API')
      .replace(/{correct}/g, 'the correct method')
      .replace(/{incorrect}/g, 'the incorrect method')
      .replace(/{purpose}/g, 'this purpose')
      .replace(/{.*?}/g, 'appropriate values');
  }

  /**
   * Summarize feedback into a principle
   */
  private summarizeFeedback(feedback: string): string {
    // Take first sentence or first 100 chars
    const sentences = feedback.split(/[.!?]/);
    const firstSentence = sentences[0];
    if (firstSentence && firstSentence.length <= 100) {
      return firstSentence.trim();
    }
    return feedback.slice(0, 97).trim() + '...';
  }

  /**
   * Extract file patterns from feedback
   */
  private extractFilePatterns(feedback: string): string[] {
    const patterns: string[] = [];

    // Look for file extensions
    const extMatch = feedback.match(/\*?\.\w+/g);
    if (extMatch) {
      patterns.push(...extMatch.map(e => `*${e}`));
    }

    // Look for directory patterns
    const dirMatch = feedback.match(/\b(src|lib|test|spec|components?|services?|utils?)\b/gi);
    if (dirMatch) {
      patterns.push(...dirMatch.map(d => `**/${d.toLowerCase()}/**`));
    }

    return [...new Set(patterns)];
  }

  /**
   * Extract language mentions from feedback
   */
  private extractLanguages(feedback: string): string[] {
    const languages = [
      'typescript', 'javascript', 'python', 'java', 'csharp', 'c#',
      'go', 'rust', 'php', 'ruby', 'swift', 'kotlin',
    ];

    const found: string[] = [];
    const lower = feedback.toLowerCase();

    for (const lang of languages) {
      if (lower.includes(lang)) {
        found.push(lang === 'c#' ? 'csharp' : lang);
      }
    }

    return found;
  }

  /**
   * Extract framework mentions from feedback
   */
  private extractFrameworks(feedback: string): string[] {
    const frameworks = [
      'react', 'vue', 'angular', 'express', 'nestjs', 'next',
      'nuxt', 'fastify', 'spring', 'django', 'flask', 'laravel',
    ];

    const found: string[] = [];
    const lower = feedback.toLowerCase();

    for (const fw of frameworks) {
      if (lower.includes(fw)) {
        found.push(fw);
      }
    }

    return found;
  }

  /**
   * Extract pattern names from feedback
   */
  private extractPatternNames(feedback: string): string[] {
    const patterns = [
      'repository', 'factory', 'singleton', 'observer', 'strategy',
      'decorator', 'adapter', 'facade', 'proxy', 'middleware',
      'controller', 'service', 'model', 'view', 'presenter',
    ];

    const found: string[] = [];
    const lower = feedback.toLowerCase();

    for (const pattern of patterns) {
      if (lower.includes(pattern)) {
        found.push(pattern);
      }
    }

    return found;
  }

  /**
   * Extract examples from feedback
   */
  private extractExamples(
    feedback: string,
    original: string
  ): { correctExample?: string; incorrectExample?: string } {
    const result: { correctExample?: string; incorrectExample?: string } = {};

    // Look for code blocks in feedback
    const codeBlocks = feedback.match(/```[\s\S]*?```/g);
    if (codeBlocks && codeBlocks.length > 0) {
      result.correctExample = codeBlocks[0].replace(/```\w*\n?/g, '').trim();
    }

    // Use original as incorrect example if we have a correct one
    if (result.correctExample && original) {
      result.incorrectExample = original.slice(0, 200);
    }

    return result;
  }

  /**
   * Extract keywords for matching
   */
  private extractKeywords(feedback: string, category: CorrectionCategory): string[] {
    const keywords = new Set<string>();

    // Add category-related keywords
    keywords.add(category.replace('_', ' '));

    // Extract significant words from feedback
    const words = feedback
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3);

    // Filter out common words
    const stopWords = new Set([
      'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they',
      'their', 'what', 'when', 'where', 'which', 'while', 'would',
      'could', 'should', 'about', 'after', 'before', 'being', 'between',
    ]);

    for (const word of words) {
      if (!stopWords.has(word)) {
        keywords.add(word);
      }
    }

    return Array.from(keywords).slice(0, 10);
  }

  /**
   * Extract keywords from a statement
   */
  private extractKeywordsFromStatement(statement: string): string[] {
    return statement
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 3)
      .slice(0, 5);
  }

  /**
   * Determine if this is a hard rule
   */
  private isHardRule(feedback: string, category: CorrectionCategory): boolean {
    // Security and constraint violations are always hard rules
    if (category === 'security_issue' || category === 'constraint_violation') {
      return true;
    }

    // Check for strong language
    const hardRuleIndicators = [
      'must', 'always', 'never', 'required', 'mandatory',
      'critical', 'important', 'essential', 'necessary',
    ];

    const lower = feedback.toLowerCase();
    return hardRuleIndicators.some(i => lower.includes(i));
  }

  /**
   * Calculate confidence in the extracted principle
   */
  private calculateConfidence(
    keyPhrases: string[],
    category: CorrectionCategory
  ): number {
    let confidence = 0.5;

    // More key phrases = higher confidence
    confidence += Math.min(keyPhrases.length * 0.1, 0.3);

    // Specific categories have higher confidence
    if (category !== 'other') {
      confidence += 0.1;
    }

    // Security and constraint categories are more certain
    if (category === 'security_issue' || category === 'constraint_violation') {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }
}
