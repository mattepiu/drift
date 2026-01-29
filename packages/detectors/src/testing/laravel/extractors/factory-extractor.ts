/**
 * Laravel Factory Extractor
 *
 * Extracts model factory definitions from Laravel code.
 * Factories are used for generating test data.
 *
 * @module testing/laravel/extractors/factory-extractor
 */

import type {
  FactoryInfo,
  FactoryStateInfo,
  FactoryRelationshipInfo,
  FactoryExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Factory class definition (Laravel 8+)
 */
const FACTORY_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+(?:Illuminate\\Database\\Eloquent\\Factories\\)?Factory\s*\{/g;

/**
 * Model property
 */
const MODEL_PROPERTY_PATTERN = /protected\s+\$model\s*=\s*([A-Z]\w+)::class/;

/**
 * Model property with namespace
 */
const MODEL_PROPERTY_FQN_PATTERN = /protected\s+\$model\s*=\s*\\?([A-Z][\w\\]+)::class/;

/**
 * State method definition
 */
const STATE_METHOD_PATTERN = /public\s+function\s+(\w+)\s*\([^)]*\)\s*(?::\s*(?:static|self|Factory))?\s*\{[^}]*\$this->state\s*\(/g;

/**
 * Has relationship in factory
 */
const HAS_RELATIONSHIP_PATTERN = /->has\s*\(\s*([A-Z]\w+)::factory\s*\(/g;

/**
 * For relationship in factory
 */
const FOR_RELATIONSHIP_PATTERN = /->for\s*\(\s*([A-Z]\w+)::factory\s*\(/g;

// Note: These patterns are defined for future use in factory lifecycle detection
// const RECYCLE_PATTERN = /->recycle\s*\(\s*\$(\w+)\s*\)/g;
// const DEFINITION_PATTERN = /public\s+function\s+definition\s*\(\s*\)/;
// const CONFIGURE_PATTERN = /public\s+function\s+configure\s*\(\s*\)/;
// const AFTER_MAKING_PATTERN = /->afterMaking\s*\(/g;
// const AFTER_CREATING_PATTERN = /->afterCreating\s*\(/g;

// ============================================================================
// Factory Extractor
// ============================================================================

/**
 * Extracts Laravel model factory definitions
 */
export class FactoryExtractor {
  /**
   * Extract all factories from content
   */
  extract(content: string, file: string): FactoryExtractionResult {
    const factories = this.extractFactories(content, file);
    const confidence = factories.length > 0 ? 0.9 : 0;

    return {
      factories,
      confidence,
    };
  }

  /**
   * Check if content contains factories
   */
  hasFactories(content: string): boolean {
    return (
      content.includes('extends Factory') ||
      content.includes('Illuminate\\Database\\Eloquent\\Factories\\Factory')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract factory definitions
   */
  private extractFactories(content: string, file: string): FactoryInfo[] {
    const factories: FactoryInfo[] = [];
    FACTORY_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = FACTORY_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      // Extract model class
      const modelClass = this.extractModelClass(classBody);

      // Extract states
      const states = this.extractStates(classBody, line);

      // Extract relationships
      const relationships = this.extractRelationships(classBody, line);

      factories.push({
        name,
        modelClass,
        states,
        relationships,
        file,
        line,
      });
    }

    return factories;
  }

  /**
   * Extract model class from factory
   */
  private extractModelClass(classBody: string): string {
    // Try FQN first
    const fqnMatch = classBody.match(MODEL_PROPERTY_FQN_PATTERN);
    if (fqnMatch?.[1]) {
      const parts = fqnMatch[1].split('\\');
      return parts[parts.length - 1] || '';
    }

    // Try simple class name
    const simpleMatch = classBody.match(MODEL_PROPERTY_PATTERN);
    return simpleMatch ? simpleMatch[1] || '' : '';
  }

  /**
   * Extract state definitions
   */
  private extractStates(classBody: string, classLine: number): FactoryStateInfo[] {
    const states: FactoryStateInfo[] = [];
    STATE_METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = STATE_METHOD_PATTERN.exec(classBody)) !== null) {
      const name = match[1] || '';
      // Skip definition and configure methods
      if (name === 'definition' || name === 'configure') {continue;}

      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      states.push({
        name,
        line,
      });
    }

    return states;
  }

  /**
   * Extract relationship definitions
   */
  private extractRelationships(classBody: string, classLine: number): FactoryRelationshipInfo[] {
    const relationships: FactoryRelationshipInfo[] = [];

    // Has relationships
    HAS_RELATIONSHIP_PATTERN.lastIndex = 0;
    let match;
    while ((match = HAS_RELATIONSHIP_PATTERN.exec(classBody)) !== null) {
      const factory = match[1] || '';
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      relationships.push({
        name: this.lcfirst(factory),
        factory,
        line,
      });
    }

    // For relationships
    FOR_RELATIONSHIP_PATTERN.lastIndex = 0;
    while ((match = FOR_RELATIONSHIP_PATTERN.exec(classBody)) !== null) {
      const factory = match[1] || '';
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      relationships.push({
        name: this.lcfirst(factory),
        factory,
        line,
      });
    }

    return relationships;
  }

  /**
   * Extract class body
   */
  private extractClassBody(content: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex;

    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }

    return content.substring(startIndex, i - 1);
  }

  /**
   * Lowercase first character
   */
  private lcfirst(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new factory extractor
 */
export function createFactoryExtractor(): FactoryExtractor {
  return new FactoryExtractor();
}
