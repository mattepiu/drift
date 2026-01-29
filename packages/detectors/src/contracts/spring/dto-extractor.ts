/**
 * Spring DTO Extractor
 *
 * Extracts fields from Java classes/records used as DTOs.
 * Maps Java types to contract types for FE↔BE matching.
 *
 * @module contracts/spring/dto-extractor
 */

import type { SpringDtoInfo } from './types.js';
import type { ContractField } from 'driftdetect-core';

// ============================================
// Local Type Mapping (to avoid circular dependency)
// ============================================

/**
 * Map Java primitive and common types to contract types.
 */
const JAVA_TYPE_MAP: Record<string, string> = {
  // Primitive types
  'byte': 'number',
  'short': 'number',
  'int': 'number',
  'long': 'number',
  'float': 'number',
  'double': 'number',
  'boolean': 'boolean',
  'char': 'string',

  // Boxed primitives
  'Byte': 'number',
  'Short': 'number',
  'Integer': 'number',
  'Long': 'number',
  'Float': 'number',
  'Double': 'number',
  'Boolean': 'boolean',
  'Character': 'string',

  // String types
  'String': 'string',
  'CharSequence': 'string',

  // Numeric types
  'BigDecimal': 'number',
  'BigInteger': 'number',
  'Number': 'number',

  // Date/Time types (serialized as ISO strings)
  'Date': 'string',
  'LocalDate': 'string',
  'LocalDateTime': 'string',
  'LocalTime': 'string',
  'ZonedDateTime': 'string',
  'OffsetDateTime': 'string',
  'Instant': 'string',

  // UUID
  'UUID': 'string',

  // Void types
  'void': 'void',
  'Void': 'void',

  // Object types
  'Object': 'any',
};

const JAVA_COLLECTION_TYPES = ['List', 'ArrayList', 'LinkedList', 'Set', 'HashSet', 'Collection'];

/**
 * Map a Java type to a contract type.
 */
function mapJavaType(javaType: string): string {
  if (!javaType) {return 'unknown';}
  const cleanType = javaType.trim();
  const baseType = cleanType.replace(/\?$/, '');

  // Handle arrays
  if (baseType.endsWith('[]')) {return 'array';}

  // Handle Optional<T>
  const optionalMatch = baseType.match(/^Optional<(.+)>$/);
  if (optionalMatch?.[1]) {return `${mapJavaType(optionalMatch[1])} | null`;}

  // Handle ResponseEntity<T>
  const responseMatch = baseType.match(/^ResponseEntity<(.+)>$/);
  if (responseMatch?.[1]) {return mapJavaType(responseMatch[1]);}

  // Handle collections
  for (const collType of JAVA_COLLECTION_TYPES) {
    if (baseType.startsWith(`${collType}<`)) {return 'array';}
  }
  if (JAVA_COLLECTION_TYPES.includes(baseType)) {return 'array';}

  // Direct mapping
  if (JAVA_TYPE_MAP[baseType]) {return JAVA_TYPE_MAP[baseType];}

  // Custom types
  return baseType.toLowerCase();
}

/**
 * Extract the inner type from a generic type.
 */
function extractGenericType(javaType: string): string | null {
  const match = javaType.match(/<(.+)>$/);
  return match?.[1] ?? null;
}

/**
 * Check if a Java type is a collection type.
 */
function isCollectionType(javaType: string): boolean {
  const baseType = javaType.replace(/<.+>$/, '');
  return JAVA_COLLECTION_TYPES.includes(baseType) || javaType.endsWith('[]');
}

/**
 * Unwrap wrapper types.
 */
function unwrapType(javaType: string): string {
  const patterns = [
    /^ResponseEntity<(.+)>$/,
    /^HttpEntity<(.+)>$/,
    /^Mono<(.+)>$/,
    /^CompletableFuture<(.+)>$/,
  ];
  for (const pattern of patterns) {
    const match = javaType.match(pattern);
    if (match?.[1]) {return match[1];}
  }
  return javaType;
}

// ============================================
// DTO Extractor Class
// ============================================

/**
 * Extracts DTO information from Java source code.
 */
export class SpringDtoExtractor {
  /**
   * Extract DTO information from a Java class or record.
   *
   * @param content - Java source code
   * @param typeName - Name of the type to extract
   * @param file - File path
   * @returns DTO info or null if not found
   */
  extractDto(content: string, typeName: string, file: string): SpringDtoInfo | null {
    // Try to find as a record first (Java 16+)
    const recordInfo = this.extractRecord(content, typeName, file);
    if (recordInfo) {return recordInfo;}

    // Try to find as a class
    const classInfo = this.extractClass(content, typeName, file);
    if (classInfo) {return classInfo;}

    return null;
  }

  /**
   * Extract fields from a DTO type.
   *
   * @param content - Java source code
   * @param typeName - Name of the type to extract fields from
   * @returns Array of contract fields
   */
  extractFields(content: string, typeName: string): ContractField[] {
    // Handle generic wrapper types
    const unwrappedType = unwrapType(typeName);
    
    // Handle collection types - extract inner type
    if (isCollectionType(unwrappedType)) {
      const innerType = extractGenericType(unwrappedType);
      if (innerType) {
        return this.extractFields(content, innerType);
      }
      return [];
    }

    // Try record first
    const recordFields = this.extractRecordFields(content, unwrappedType);
    if (recordFields.length > 0) {return recordFields;}

    // Try class
    const classFields = this.extractClassFields(content, unwrappedType);
    if (classFields.length > 0) {return classFields;}

    return [];
  }

  /**
   * Extract a Java record definition.
   */
  private extractRecord(content: string, typeName: string, file: string): SpringDtoInfo | null {
    // Pattern for Java record: public record TypeName(Type field1, Type field2) { ... }
    const recordPattern = new RegExp(
      `(?:public\\s+)?record\\s+${this.escapeRegex(typeName)}\\s*(?:<[^>]+>)?\\s*\\(([^)]+)\\)`,
      'g'
    );

    const match = recordPattern.exec(content);
    if (!match) {return null;}

    const paramsStr = match[1] || '';
    const line = this.getLineNumber(content, match.index);
    const fields = this.parseRecordParameters(paramsStr);

    return {
      name: typeName,
      packageName: this.extractPackage(content),
      fields,
      isRecord: true,
      isEnum: false,
      parentClass: null,
      interfaces: [],
      file,
      line,
    };
  }

  /**
   * Extract a Java class definition.
   */
  private extractClass(content: string, typeName: string, file: string): SpringDtoInfo | null {
    // Pattern for Java class
    const classPattern = new RegExp(
      `(?:public\\s+)?class\\s+${this.escapeRegex(typeName)}\\s*(?:<[^>]+>)?(?:\\s+extends\\s+(\\w+))?(?:\\s+implements\\s+([^{]+))?\\s*\\{`,
      'g'
    );

    const match = classPattern.exec(content);
    if (!match) {return null;}

    const line = this.getLineNumber(content, match.index);
    const parentClass = match[1] || null;
    const implementsStr = match[2] || '';
    const interfaces = implementsStr
      .split(',')
      .map(i => i.trim())
      .filter(i => i.length > 0);

    const fields = this.extractClassFields(content, typeName);

    return {
      name: typeName,
      packageName: this.extractPackage(content),
      fields,
      isRecord: false,
      isEnum: false,
      parentClass,
      interfaces,
      file,
      line,
    };
  }

  /**
   * Extract fields from a record's primary constructor.
   */
  private extractRecordFields(content: string, typeName: string): ContractField[] {
    const recordPattern = new RegExp(
      `(?:public\\s+)?record\\s+${this.escapeRegex(typeName)}\\s*(?:<[^>]+>)?\\s*\\(([^)]+)\\)`,
      'g'
    );

    const match = recordPattern.exec(content);
    if (!match?.[1]) {return [];}

    return this.parseRecordParameters(match[1]);
  }

  /**
   * Extract fields from a class (properties with getters or public fields).
   */
  private extractClassFields(content: string, typeName: string): ContractField[] {
    const fields: ContractField[] = [];

    // Find the class body
    const classBody = this.extractClassBody(content, typeName);
    if (!classBody) {return fields;}

    // Pattern for fields: private Type fieldName;
    const fieldPattern = /(?:private|protected|public)\s+(?:final\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*(?:=|;)/g;
    let fieldMatch;

    while ((fieldMatch = fieldPattern.exec(classBody)) !== null) {
      const javaType = fieldMatch[1] || '';
      const fieldName = fieldMatch[2] || '';

      // Skip common non-DTO fields
      if (this.isSkippableField(fieldName, javaType)) {continue;}

      fields.push({
        name: fieldName,
        type: mapJavaType(javaType),
        optional: this.isOptionalField(classBody, fieldName, javaType),
        nullable: this.isNullableField(classBody, fieldName, javaType),
        line: 0,
      });
    }

    // Also look for Lombok @Data or @Getter annotated classes
    // In this case, all private fields become properties
    if (this.hasLombokAnnotation(content, typeName)) {
      // Fields already extracted above
    }

    return fields;
  }

  /**
   * Parse record constructor parameters into fields.
   */
  private parseRecordParameters(paramsStr: string): ContractField[] {
    const fields: ContractField[] = [];
    const params = this.splitParameters(paramsStr);

    for (const param of params) {
      const trimmed = param.trim();
      if (!trimmed) {continue;}

      // Remove annotations from parameter
      const cleanParam = trimmed.replace(/@\w+(?:\([^)]*\))?\s*/g, '').trim();

      // Parse type and name: Type name
      const paramMatch = cleanParam.match(/^(\w+(?:<[^>]+>)?)\s+(\w+)$/);
      if (paramMatch?.[1] && paramMatch[2]) {
        const javaType = paramMatch[1];
        const fieldName = paramMatch[2];

        // Check for @Nullable annotation
        const isNullable = trimmed.includes('@Nullable') || trimmed.includes('@javax.annotation.Nullable');

        fields.push({
          name: fieldName,
          type: mapJavaType(javaType),
          optional: isNullable,
          nullable: isNullable,
          line: 0,
        });
      }
    }

    return fields;
  }

  /**
   * Extract the body of a class.
   */
  private extractClassBody(content: string, typeName: string): string | null {
    const classPattern = new RegExp(
      `(?:public\\s+)?class\\s+${this.escapeRegex(typeName)}\\s*(?:<[^>]+>)?[^{]*\\{`,
      'g'
    );

    const match = classPattern.exec(content);
    if (!match) {return null;}

    const startIndex = match.index + match[0].length;
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
   * Split parameters handling nested generics.
   */
  private splitParameters(paramsStr: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of paramsStr) {
      if (char === '<') {depth++;}
      else if (char === '>') {depth--;}
      else if (char === ',' && depth === 0) {
        result.push(current);
        current = '';
        continue;
      }
      current += char;
    }

    if (current.trim()) {
      result.push(current);
    }

    return result;
  }

  /**
   * Extract package name from content.
   */
  private extractPackage(content: string): string | null {
    const packageMatch = content.match(/package\s+([\w.]+)\s*;/);
    return packageMatch?.[1] ? packageMatch[1] : null;
  }

  /**
   * Get line number for a position in content.
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Check if a field should be skipped (not part of DTO).
   */
  private isSkippableField(fieldName: string, fieldType: string): boolean {
    // Skip common non-DTO fields
    const skipNames = ['serialVersionUID', 'logger', 'log', 'LOG'];
    const skipTypes = ['Logger', 'Log'];

    return skipNames.includes(fieldName) || skipTypes.includes(fieldType);
  }

  /**
   * Check if a field is optional based on annotations.
   */
  private isOptionalField(classBody: string, fieldName: string, javaType: string): boolean {
    // Check for Optional type
    if (javaType.startsWith('Optional<')) {return true;}

    // Check for @Nullable annotation on the field
    const fieldPattern = new RegExp(`@Nullable[^;]*${fieldName}\\s*[;=]`);
    return fieldPattern.test(classBody);
  }

  /**
   * Check if a field is nullable based on annotations.
   */
  private isNullableField(classBody: string, fieldName: string, javaType: string): boolean {
    // Check for Optional type
    if (javaType.startsWith('Optional<')) {return true;}

    // Check for @Nullable annotation
    const fieldPattern = new RegExp(`@Nullable[^;]*${fieldName}\\s*[;=]`);
    if (fieldPattern.test(classBody)) {return true;}

    // Check for @NotNull annotation (means NOT nullable)
    const notNullPattern = new RegExp(`@NotNull[^;]*${fieldName}\\s*[;=]`);
    if (notNullPattern.test(classBody)) {return false;}

    // Default: reference types are potentially nullable
    return !this.isPrimitiveType(javaType);
  }

  /**
   * Check if a type is a Java primitive.
   */
  private isPrimitiveType(javaType: string): boolean {
    const primitives = ['byte', 'short', 'int', 'long', 'float', 'double', 'boolean', 'char'];
    return primitives.includes(javaType);
  }

  /**
   * Check if a class has Lombok annotations.
   */
  private hasLombokAnnotation(content: string, typeName: string): boolean {
    // Look for @Data, @Getter, @Value before the class
    const classPattern = new RegExp(
      `(@Data|@Getter|@Value|@Builder)[\\s\\S]*?class\\s+${this.escapeRegex(typeName)}`,
      'g'
    );
    return classPattern.test(content);
  }

  /**
   * Escape special regex characters.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new Spring DTO extractor.
 */
export function createSpringDtoExtractor(): SpringDtoExtractor {
  return new SpringDtoExtractor();
}
