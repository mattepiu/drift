/**
 * Laravel Eloquent Model Extractor
 *
 * Extracts Eloquent model definitions from Laravel code.
 *
 * @module data-access/laravel/extractors/eloquent-model-extractor
 */

import { MODEL_EVENTS } from '../types.js';

import type {
  EloquentModelInfo,
  RelationshipInfo,
  ScopeInfo,
  AccessorInfo,
  MutatorInfo,
  ModelEventInfo,
  ModelExtractionResult,
  ModelEvent,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Model class definition
 */
const MODEL_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+(?:Illuminate\\Database\\Eloquent\\)?Model\s*\{/g;

/**
 * Table property
 */
const TABLE_PATTERN = /protected\s+\$table\s*=\s*['"]([^'"]+)['"]/;

/**
 * Primary key property
 */
const PRIMARY_KEY_PATTERN = /protected\s+\$primaryKey\s*=\s*['"]([^'"]+)['"]/;

/**
 * Timestamps property
 */
const TIMESTAMPS_PATTERN = /public\s+\$timestamps\s*=\s*(true|false)/;

/**
 * Fillable property
 */
const FILLABLE_PATTERN = /protected\s+\$fillable\s*=\s*\[([\s\S]*?)\]/;

/**
 * Guarded property
 */
const GUARDED_PATTERN = /protected\s+\$guarded\s*=\s*\[([\s\S]*?)\]/;

/**
 * Hidden property
 */
const HIDDEN_PATTERN = /protected\s+\$hidden\s*=\s*\[([\s\S]*?)\]/;

/**
 * Visible property
 */
const VISIBLE_PATTERN = /protected\s+\$visible\s*=\s*\[([\s\S]*?)\]/;

/**
 * Casts property
 */
const CASTS_PATTERN = /protected\s+\$casts\s*=\s*\[([\s\S]*?)\]/;

/**
 * Appends property
 */
const APPENDS_PATTERN = /protected\s+\$appends\s*=\s*\[([\s\S]*?)\]/;

/**
 * Relationship method
 */
const RELATIONSHIP_PATTERN = /public\s+function\s+(\w+)\s*\([^)]*\)(?:\s*:\s*[\w\\]+)?\s*\{[^}]*\$this->(hasOne|hasMany|belongsTo|belongsToMany|hasOneThrough|hasManyThrough|morphOne|morphMany|morphTo|morphToMany|morphedByMany)\s*\(/g;

/**
 * Scope method
 */
const SCOPE_PATTERN = /public\s+function\s+scope(\w+)\s*\(([^)]*)\)/g;

/**
 * Old-style accessor (getXxxAttribute)
 */
const OLD_ACCESSOR_PATTERN = /public\s+function\s+get(\w+)Attribute\s*\(/g;

/**
 * Old-style mutator (setXxxAttribute)
 */
const OLD_MUTATOR_PATTERN = /public\s+function\s+set(\w+)Attribute\s*\(/g;

/**
 * New-style accessor/mutator (Attribute::make)
 */
const NEW_ACCESSOR_PATTERN = /protected\s+function\s+(\w+)\s*\([^)]*\)\s*:\s*Attribute\s*\{/g;

/**
 * Model event registration
 */
const MODEL_EVENT_PATTERN = /static::(creating|created|updating|updated|saving|saved|deleting|deleted|restoring|restored|replicating|forceDeleting|forceDeleted)\s*\(/g;

// ============================================================================
// Eloquent Model Extractor
// ============================================================================

/**
 * Extracts Eloquent model definitions
 */
export class EloquentModelExtractor {
  /**
   * Extract all models from content
   */
  extract(content: string, file: string): ModelExtractionResult {
    const models = this.extractModels(content, file);
    const confidence = models.length > 0 ? 0.9 : 0;

    return {
      models,
      confidence,
    };
  }

  /**
   * Check if content contains Eloquent models
   */
  hasModels(content: string): boolean {
    return (
      content.includes('extends Model') ||
      content.includes('Illuminate\\Database\\Eloquent\\Model')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract model definitions
   */
  private extractModels(content: string, file: string): EloquentModelInfo[] {
    const models: EloquentModelInfo[] = [];
    MODEL_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = MODEL_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      // Extract namespace
      const namespace = this.extractNamespace(content);

      // Extract properties
      const table = this.extractStringProperty(classBody, TABLE_PATTERN) || this.inferTableName(name);
      const primaryKey = this.extractStringProperty(classBody, PRIMARY_KEY_PATTERN) || 'id';
      const timestamps = this.extractBooleanProperty(classBody, TIMESTAMPS_PATTERN, true);
      const fillable = this.extractArrayProperty(classBody, FILLABLE_PATTERN);
      const guarded = this.extractArrayProperty(classBody, GUARDED_PATTERN);
      const hidden = this.extractArrayProperty(classBody, HIDDEN_PATTERN);
      const visible = this.extractArrayProperty(classBody, VISIBLE_PATTERN);
      const casts = this.extractCasts(classBody);
      const appends = this.extractArrayProperty(classBody, APPENDS_PATTERN);

      // Extract methods
      const relationships = this.extractRelationships(classBody, line);
      const scopes = this.extractScopes(classBody, line);
      const accessors = this.extractAccessors(classBody, line);
      const mutators = this.extractMutators(classBody, line);
      const events = this.extractEvents(classBody, line);

      models.push({
        name,
        fqn: namespace ? `${namespace}\\${name}` : name,
        namespace,
        table,
        primaryKey,
        timestamps,
        fillable,
        guarded,
        hidden,
        visible,
        casts,
        appends,
        relationships,
        scopes,
        accessors,
        mutators,
        events,
        file,
        line,
      });
    }

    return models;
  }

  /**
   * Extract relationships from class body
   */
  private extractRelationships(classBody: string, classLine: number): RelationshipInfo[] {
    const relationships: RelationshipInfo[] = [];
    RELATIONSHIP_PATTERN.lastIndex = 0;

    let match;
    while ((match = RELATIONSHIP_PATTERN.exec(classBody)) !== null) {
      const name = match[1] || '';
      const type = match[2] as RelationshipInfo['type'];
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      // Extract relationship details from the method body
      const methodBody = this.extractMethodBody(classBody, match.index);
      const details = this.parseRelationshipDetails(methodBody, type);

      relationships.push({
        name,
        type,
        relatedModel: details.relatedModel,
        foreignKey: details.foreignKey,
        localKey: details.localKey,
        pivotTable: details.pivotTable,
        pivotFields: details.pivotFields,
        isMorph: type.startsWith('morph'),
        line,
      });
    }

    return relationships;
  }

  /**
   * Extract scopes from class body
   */
  private extractScopes(classBody: string, classLine: number): ScopeInfo[] {
    const scopes: ScopeInfo[] = [];
    SCOPE_PATTERN.lastIndex = 0;

    let match;
    while ((match = SCOPE_PATTERN.exec(classBody)) !== null) {
      const name = match[1] || '';
      const paramsStr = match[2] || '';
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      // Parse parameters (skip $query which is always first)
      const params = paramsStr
        .split(',')
        .slice(1)
        .map(p => {
          const paramMatch = p.trim().match(/\$(\w+)/);
          return paramMatch ? paramMatch[1] || '' : '';
        })
        .filter(Boolean);

      scopes.push({
        name: this.lcfirst(name),
        parameters: params,
        line,
      });
    }

    return scopes;
  }

  /**
   * Extract accessors from class body
   */
  private extractAccessors(classBody: string, classLine: number): AccessorInfo[] {
    const accessors: AccessorInfo[] = [];

    // Old-style accessors
    OLD_ACCESSOR_PATTERN.lastIndex = 0;
    let match;
    while ((match = OLD_ACCESSOR_PATTERN.exec(classBody)) !== null) {
      const attribute = match[1] || '';
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      accessors.push({
        attribute: this.snakeCase(attribute),
        methodName: `get${attribute}Attribute`,
        isNewStyle: false,
        line,
      });
    }

    // New-style accessors
    NEW_ACCESSOR_PATTERN.lastIndex = 0;
    while ((match = NEW_ACCESSOR_PATTERN.exec(classBody)) !== null) {
      const attribute = match[1] || '';
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      accessors.push({
        attribute,
        methodName: attribute,
        isNewStyle: true,
        line,
      });
    }

    return accessors;
  }

  /**
   * Extract mutators from class body
   */
  private extractMutators(classBody: string, classLine: number): MutatorInfo[] {
    const mutators: MutatorInfo[] = [];

    // Old-style mutators
    OLD_MUTATOR_PATTERN.lastIndex = 0;
    let match;
    while ((match = OLD_MUTATOR_PATTERN.exec(classBody)) !== null) {
      const attribute = match[1] || '';
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      mutators.push({
        attribute: this.snakeCase(attribute),
        methodName: `set${attribute}Attribute`,
        isNewStyle: false,
        line,
      });
    }

    return mutators;
  }

  /**
   * Extract model events from class body
   */
  private extractEvents(classBody: string, classLine: number): ModelEventInfo[] {
    const events: ModelEventInfo[] = [];
    MODEL_EVENT_PATTERN.lastIndex = 0;

    let match;
    while ((match = MODEL_EVENT_PATTERN.exec(classBody)) !== null) {
      const event = match[1] as ModelEvent;
      if (MODEL_EVENTS.includes(event)) {
        const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

        events.push({
          event,
          handlerType: 'closure',
          line,
        });
      }
    }

    return events;
  }

  /**
   * Parse relationship details from method body
   */
  private parseRelationshipDetails(methodBody: string, _type: string): {
    relatedModel: string;
    foreignKey: string | null;
    localKey: string | null;
    pivotTable: string | null;
    pivotFields: string[];
  } {
    // Extract related model
    const modelMatch = methodBody.match(/\(\s*([A-Z]\w+)::class/);
    const relatedModel = modelMatch ? modelMatch[1] || '' : '';

    // Extract foreign key
    const foreignKeyMatch = methodBody.match(/,\s*['"](\w+)['"]/);
    const foreignKey = foreignKeyMatch ? foreignKeyMatch[1] || null : null;

    // Extract local key
    const localKeyMatch = methodBody.match(/,\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]/);
    const localKey = localKeyMatch ? localKeyMatch[2] || null : null;

    // Extract pivot table (for belongsToMany)
    const pivotMatch = methodBody.match(/->withPivot\s*\(\s*\[?([^\])]+)\]?\s*\)/);
    const pivotFields = pivotMatch
      ? pivotMatch[1]?.split(',').map(f => f.trim().replace(/['"]/g, '')).filter(Boolean) || []
      : [];

    return {
      relatedModel,
      foreignKey,
      localKey,
      pivotTable: null,
      pivotFields,
    };
  }

  /**
   * Extract string property
   */
  private extractStringProperty(content: string, pattern: RegExp): string | null {
    const match = content.match(pattern);
    return match ? match[1] || null : null;
  }

  /**
   * Extract boolean property
   */
  private extractBooleanProperty(content: string, pattern: RegExp, defaultValue: boolean): boolean {
    const match = content.match(pattern);
    return match ? match[1] === 'true' : defaultValue;
  }

  /**
   * Extract array property
   */
  private extractArrayProperty(content: string, pattern: RegExp): string[] {
    const match = content.match(pattern);
    if (!match?.[1]) {return [];}

    return match[1]
      .split(',')
      .map(item => item.trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }

  /**
   * Extract casts property
   */
  private extractCasts(content: string): Record<string, string> {
    const match = content.match(CASTS_PATTERN);
    if (!match?.[1]) {return {};}

    const casts: Record<string, string> = {};
    const castPattern = /['"](\w+)['"]\s*=>\s*['"]?([^'",\]]+)['"]?/g;

    let castMatch;
    while ((castMatch = castPattern.exec(match[1])) !== null) {
      if (castMatch[1] && castMatch[2]) {
        casts[castMatch[1]] = castMatch[2].trim();
      }
    }

    return casts;
  }

  /**
   * Extract namespace
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
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
   * Extract method body
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
   * Infer table name from model name
   */
  private inferTableName(modelName: string): string {
    // Convert PascalCase to snake_case and pluralize
    const snake = this.snakeCase(modelName);
    return this.pluralize(snake);
  }

  /**
   * Convert to snake_case
   */
  private snakeCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }

  /**
   * Simple pluralize
   */
  private pluralize(word: string): string {
    if (word.endsWith('y')) {return word.slice(0, -1) + 'ies';}
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('ch') || word.endsWith('sh')) {
      return word + 'es';
    }
    return word + 's';
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
 * Create a new eloquent model extractor
 */
export function createEloquentModelExtractor(): EloquentModelExtractor {
  return new EloquentModelExtractor();
}
