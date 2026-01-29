/**
 * Laravel Relationship Extractor
 *
 * Extracts Eloquent relationship definitions from Laravel models.
 * Dedicated extractor for relationship analysis and N+1 detection hints.
 *
 * @module data-access/laravel/extractors/relationship-extractor
 */

import { RELATIONSHIP_TYPES, MORPH_RELATIONSHIP_TYPES } from '../types.js';

import type {
  RelationshipInfo,
  RelationshipType,
  RelationshipExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Relationship method definition
 */
const RELATIONSHIP_METHOD_PATTERN = new RegExp(
  `public\\s+function\\s+(\\w+)\\s*\\([^)]*\\)(?:\\s*:\\s*[\\w\\\\|]+)?\\s*\\{[^}]*\\$this->(${RELATIONSHIP_TYPES.join('|')})\\s*\\(`,
  'g'
);

/**
 * Related model class
 */
const RELATED_MODEL_PATTERN = /\(\s*([A-Z]\w+)::class/;

/**
 * Foreign key argument
 */
const FOREIGN_KEY_PATTERN = /,\s*['"](\w+)['"]/;

/**
 * Local key argument (second string after foreign key)
 */
const LOCAL_KEY_PATTERN = /,\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]/;

/**
 * Pivot table name
 */
const PIVOT_TABLE_PATTERN = /belongsToMany\s*\([^)]+,\s*['"](\w+)['"]/;

/**
 * Pivot fields
 */
const PIVOT_FIELDS_PATTERN = /->withPivot\s*\(\s*\[?([^\])]+)\]?\s*\)/;

// Note: These patterns are defined for future use in enhanced relationship analysis
// const PIVOT_TIMESTAMPS_PATTERN = /->withTimestamps\s*\(/;
// const EAGER_LOAD_PATTERN = /->with\s*\(\s*\[?([^\])]+)\]?\s*\)/;
// const CONSTRAINT_PATTERN = /->(where|orderBy|latest|oldest|limit|take)\s*\(/g;

// ============================================================================
// Relationship Extractor
// ============================================================================

/**
 * Extracts Eloquent relationship definitions
 */
export class RelationshipExtractor {
  /**
   * Extract all relationships from content
   */
  extract(content: string, file: string): RelationshipExtractionResult {
    const relationships = this.extractRelationships(content, file);
    const confidence = relationships.length > 0 ? 0.9 : 0;

    return {
      relationships,
      confidence,
    };
  }

  /**
   * Check if content contains relationships
   */
  hasRelationships(content: string): boolean {
    return RELATIONSHIP_TYPES.some(type => content.includes(`$this->${type}(`));
  }

  /**
   * Get relationship types used in content
   */
  getUsedRelationshipTypes(content: string): RelationshipType[] {
    return RELATIONSHIP_TYPES.filter(type => content.includes(`$this->${type}(`));
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract relationship definitions
   */
  private extractRelationships(content: string, _file: string): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];
    RELATIONSHIP_METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = RELATIONSHIP_METHOD_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const type = match[2] as RelationshipType;
      const line = this.getLineNumber(content, match.index);

      // Extract method body for detailed analysis
      const methodBody = this.extractMethodBody(content, match.index);
      const details = this.parseRelationshipDetails(methodBody, type);

      relationships.push({
        name,
        type,
        relatedModel: details.relatedModel,
        foreignKey: details.foreignKey,
        localKey: details.localKey,
        pivotTable: details.pivotTable,
        pivotFields: details.pivotFields,
        isMorph: MORPH_RELATIONSHIP_TYPES.includes(type),
        line,
      });
    }

    return relationships;
  }

  /**
   * Parse relationship details from method body
   */
  private parseRelationshipDetails(methodBody: string, type: RelationshipType): {
    relatedModel: string;
    foreignKey: string | null;
    localKey: string | null;
    pivotTable: string | null;
    pivotFields: string[];
  } {
    // Extract related model
    const modelMatch = methodBody.match(RELATED_MODEL_PATTERN);
    const relatedModel = modelMatch ? modelMatch[1] || '' : '';

    // Extract foreign key
    const foreignKeyMatch = methodBody.match(FOREIGN_KEY_PATTERN);
    const foreignKey = foreignKeyMatch ? foreignKeyMatch[1] || null : null;

    // Extract local key
    const localKeyMatch = methodBody.match(LOCAL_KEY_PATTERN);
    const localKey = localKeyMatch ? localKeyMatch[2] || null : null;

    // Extract pivot table (for belongsToMany)
    let pivotTable: string | null = null;
    if (type === 'belongsToMany') {
      const pivotMatch = methodBody.match(PIVOT_TABLE_PATTERN);
      pivotTable = pivotMatch ? pivotMatch[1] || null : null;
    }

    // Extract pivot fields
    const pivotFieldsMatch = methodBody.match(PIVOT_FIELDS_PATTERN);
    const pivotFields = pivotFieldsMatch
      ? pivotFieldsMatch[1]?.split(',').map(f => f.trim().replace(/['"]/g, '')).filter(Boolean) || []
      : [];

    return {
      relatedModel,
      foreignKey,
      localKey,
      pivotTable,
      pivotFields,
    };
  }

  /**
   * Extract method body starting from match index
   */
  private extractMethodBody(content: string, startIndex: number): string {
    const openBrace = content.indexOf('{', startIndex);
    if (openBrace === -1) {return '';}

    let depth = 1;
    let i = openBrace + 1;

    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }

    return content.substring(openBrace + 1, i - 1);
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new relationship extractor
 */
export function createRelationshipExtractor(): RelationshipExtractor {
  return new RelationshipExtractor();
}
