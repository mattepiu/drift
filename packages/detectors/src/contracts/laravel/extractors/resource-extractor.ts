/**
 * Laravel API Resource Extractor
 *
 * Extracts API Resource definitions from Laravel resource files.
 * Handles JsonResource, ResourceCollection, and conditional fields.
 *
 * @module contracts/laravel/extractors/resource-extractor
 */

import { ClassExtractor } from '../../../php/class-extractor.js';

import type { PhpClassInfo, PhpMethodInfo } from '../../../php/types.js';
import type {
  LaravelResourceInfo,
  ResourceField,
  ConditionalField,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Pattern to match field assignments in toArray()
 * 'field_name' => $this->property
 * 'field_name' => $this->method()
 */
const FIELD_PATTERN = /['"](\w+)['"]\s*=>\s*\$this->(\w+)(?:\(\))?/g;

/**
 * Pattern to match whenLoaded() calls
 * 'relation' => new RelationResource($this->whenLoaded('relation'))
 */
const WHEN_LOADED_PATTERN = /['"](\w+)['"]\s*=>\s*(?:new\s+(\w+Resource)\s*\()?\s*\$this->whenLoaded\s*\(\s*['"](\w+)['"]/g;

/**
 * Pattern to match when() calls
 * 'field' => $this->when($condition, $value)
 */
const WHEN_PATTERN = /['"](\w+)['"]\s*=>\s*\$this->when\s*\(\s*([^,]+)\s*,/g;

/**
 * Pattern to match mergeWhen() calls
 */
// const MERGE_WHEN_PATTERN = /\$this->mergeWhen\s*\(\s*([^,]+)\s*,\s*\[([^\]]+)\]\s*\)/g;

/**
 * Pattern to match whenNotNull() calls
 */
const WHEN_NOT_NULL_PATTERN = /['"](\w+)['"]\s*=>\s*\$this->whenNotNull\s*\(\s*\$this->(\w+)/g;

/**
 * Pattern to match additional() or merge() calls
 */
const ADDITIONAL_PATTERN = /\$this->(?:additional|merge)\s*\(\s*\[([^\]]+)\]\s*\)/g;

// ============================================================================
// Resource Extractor
// ============================================================================

/**
 * Extracts Laravel API Resource definitions
 */
export class ResourceExtractor {
  private readonly classExtractor: ClassExtractor;

  constructor() {
    this.classExtractor = new ClassExtractor();
  }

  /**
   * Extract all resources from content
   *
   * @param content - PHP source code
   * @param file - File path
   * @returns Array of extracted resources
   */
  extract(content: string, file: string): LaravelResourceInfo[] {
    const resources: LaravelResourceInfo[] = [];

    // Extract namespace
    const namespace = this.extractNamespace(content);

    // Extract classes
    const classResult = this.classExtractor.extract(content, file, namespace);

    for (const classInfo of classResult.items) {
      if (this.isResource(classInfo)) {
        const resource = this.parseResource(classInfo, file);
        resources.push(resource);
      }
    }

    return resources;
  }

  /**
   * Check if content contains Laravel resources
   */
  hasResources(content: string): boolean {
    return (
      content.includes('extends JsonResource') ||
      content.includes('extends ResourceCollection') ||
      content.includes('use Illuminate\\Http\\Resources\\Json\\JsonResource')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Check if a class is a resource
   */
  private isResource(classInfo: PhpClassInfo): boolean {
    if (classInfo.extends?.includes('JsonResource')) {return true;}
    if (classInfo.extends?.includes('ResourceCollection')) {return true;}
    if (classInfo.name.endsWith('Resource')) {return true;}
    if (classInfo.name.endsWith('Collection')) {return true;}
    return false;
  }

  /**
   * Parse a resource class
   */
  private parseResource(
    classInfo: PhpClassInfo,
    file: string
  ): LaravelResourceInfo {
    // Find toArray method
    const toArrayMethod = classInfo.methods.find(m => m.name === 'toArray');

    // Extract fields from toArray
    const fields = toArrayMethod ? this.extractFields(toArrayMethod) : [];

    // Extract conditional fields
    const conditionalFields = toArrayMethod ? this.extractConditionalFields(toArrayMethod) : [];

    // Extract additional data
    const additionalData = toArrayMethod ? this.extractAdditionalData(toArrayMethod) : [];

    // Determine if collection
    const isCollection = 
      classInfo.extends?.includes('ResourceCollection') ||
      classInfo.name.endsWith('Collection');

    return {
      name: classInfo.name,
      fqn: classInfo.fqn,
      namespace: classInfo.namespace,
      isCollection,
      fields,
      conditionalFields,
      additionalData,
      file,
      line: classInfo.line,
    };
  }

  /**
   * Extract fields from toArray method
   */
  private extractFields(method: PhpMethodInfo): ResourceField[] {
    const fields: ResourceField[] = [];
    
    if (!method.body) {return fields;}

    FIELD_PATTERN.lastIndex = 0;

    let match;
    while ((match = FIELD_PATTERN.exec(method.body)) !== null) {
      const name = match[1] || '';
      const source = match[2] || '';

      // Skip conditional fields (handled separately)
      if (source === 'whenLoaded' || source === 'when' || source === 'whenNotNull') {
        continue;
      }

      fields.push({
        name,
        source,
        type: this.inferFieldType(source, method.body),
        required: true,
        line: method.line,
      });
    }

    return fields;
  }

  /**
   * Extract conditional fields from toArray method
   */
  private extractConditionalFields(method: PhpMethodInfo): ConditionalField[] {
    const conditionalFields: ConditionalField[] = [];
    
    if (!method.body) {return conditionalFields;}

    // Extract whenLoaded fields
    WHEN_LOADED_PATTERN.lastIndex = 0;
    let match;
    while ((match = WHEN_LOADED_PATTERN.exec(method.body)) !== null) {
      conditionalFields.push({
        name: match[1] || '',
        conditionType: 'whenLoaded',
        condition: match[3] || '',
        nestedResource: match[2] || null,
        line: method.line,
      });
    }

    // Extract when fields
    WHEN_PATTERN.lastIndex = 0;
    while ((match = WHEN_PATTERN.exec(method.body)) !== null) {
      conditionalFields.push({
        name: match[1] || '',
        conditionType: 'when',
        condition: match[2]?.trim() || '',
        nestedResource: null,
        line: method.line,
      });
    }

    // Extract whenNotNull fields
    WHEN_NOT_NULL_PATTERN.lastIndex = 0;
    while ((match = WHEN_NOT_NULL_PATTERN.exec(method.body)) !== null) {
      conditionalFields.push({
        name: match[1] || '',
        conditionType: 'whenNotNull',
        condition: match[2] || '',
        nestedResource: null,
        line: method.line,
      });
    }

    return conditionalFields;
  }

  /**
   * Extract additional data from toArray method
   */
  private extractAdditionalData(method: PhpMethodInfo): string[] {
    const additional: string[] = [];
    
    if (!method.body) {return additional;}

    ADDITIONAL_PATTERN.lastIndex = 0;

    let match;
    while ((match = ADDITIONAL_PATTERN.exec(method.body)) !== null) {
      const content = match[1] || '';
      // Extract field names from the array
      const fieldMatches = content.matchAll(/['"](\w+)['"]\s*=>/g);
      for (const fieldMatch of fieldMatches) {
        if (fieldMatch[1]) {
          additional.push(fieldMatch[1]);
        }
      }
    }

    return additional;
  }

  /**
   * Infer field type from source and context
   */
  private inferFieldType(source: string, _body: string): string | null {
    // Common type patterns
    if (source === 'id') {return 'number';}
    if (source.endsWith('_id')) {return 'number';}
    if (source.endsWith('_at') || source.includes('date') || source.includes('time')) {return 'string';}
    if (source.startsWith('is_') || source.startsWith('has_') || source.startsWith('can_')) {return 'boolean';}
    if (source === 'email') {return 'string';}
    if (source === 'name' || source === 'title' || source === 'description') {return 'string';}
    if (source === 'price' || source === 'amount' || source === 'total') {return 'number';}
    if (source === 'count' || source === 'quantity') {return 'number';}

    // Check for casts in the body (if available)
    // This is a simplified heuristic

    return null;
  }

  /**
   * Extract namespace from content
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
  }
}

/**
 * Create a new resource extractor instance
 */
export function createResourceExtractor(): ResourceExtractor {
  return new ResourceExtractor();
}
