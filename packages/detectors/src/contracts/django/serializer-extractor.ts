/**
 * Django Serializer Extractor
 *
 * Extracts serializer definitions from Django REST Framework code.
 * Handles ModelSerializer, Serializer, and nested serializers.
 *
 * @module contracts/django/serializer-extractor
 */

import type {
  DjangoSerializerInfo,
  DjangoSerializerFieldInfo,
  DjangoFieldKwargs,
} from './types.js';

// ============================================
// Regex Patterns
// ============================================

/**
 * Pattern to match serializer class definitions.
 */
const SERIALIZER_CLASS_PATTERN = /class\s+(\w+)\s*\(\s*([\w.,\s]+)\s*\)\s*:/g;

/**
 * Pattern to match serializer field definitions.
 */
const SERIALIZER_FIELD_PATTERN = /^\s+(\w+)\s*=\s*(?:serializers\.)?(\w+)\s*\(([^)]*)\)/gm;

/**
 * Pattern to match Meta class.
 */
const META_CLASS_PATTERN = /class\s+Meta\s*:/g;

/**
 * Pattern to match model assignment in Meta.
 */
const META_MODEL_PATTERN = /model\s*=\s*(\w+)/;

/**
 * Pattern to match fields assignment in Meta.
 */
const META_FIELDS_PATTERN = /fields\s*=\s*(?:'__all__'|"__all__"|(\[[^\]]+\]|\([^)]+\)))/;

/**
 * Pattern to match exclude assignment in Meta.
 */
const META_EXCLUDE_PATTERN = /exclude\s*=\s*(\[[^\]]+\]|\([^)]+\))/;

/**
 * Pattern to match read_only_fields in Meta.
 */
const META_READ_ONLY_PATTERN = /read_only_fields\s*=\s*(\[[^\]]+\]|\([^)]+\))/;

/**
 * Pattern to match extra_kwargs in Meta.
 */
const META_EXTRA_KWARGS_PATTERN = /extra_kwargs\s*=\s*\{([^}]+)\}/;

// ============================================
// Serializer Extractor Class
// ============================================

/**
 * Extracts Django REST Framework serializer definitions.
 */
export class DjangoSerializerExtractor {
  /**
   * Extract all serializers from Python content.
   *
   * @param content - Python source code
   * @param file - File path
   * @returns Array of serializer information
   */
  extractSerializers(content: string, file: string): DjangoSerializerInfo[] {
    const serializers: DjangoSerializerInfo[] = [];

    // Reset regex
    SERIALIZER_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = SERIALIZER_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1];
      const bases = match[2];

      if (!name || !bases) {continue;}

      // Check if this is a serializer class
      if (!this.isSerializerClass(bases)) {continue;}

      const line = this.getLineNumber(content, match.index);
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      const serializer = this.parseSerializer(name, bases, classBody, file, line);
      if (serializer) {
        serializers.push(serializer);
      }
    }

    return serializers;
  }

  /**
   * Get serializer by name.
   */
  getSerializerByName(
    serializers: DjangoSerializerInfo[],
    name: string
  ): DjangoSerializerInfo | null {
    return serializers.find((s) => s.name === name) ?? null;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Check if base classes indicate a serializer.
   */
  private isSerializerClass(bases: string): boolean {
    const serializerBases = [
      'Serializer',
      'ModelSerializer',
      'HyperlinkedModelSerializer',
      'ListSerializer',
      'serializers.Serializer',
      'serializers.ModelSerializer',
      'serializers.HyperlinkedModelSerializer',
      'serializers.ListSerializer',
    ];

    return serializerBases.some((base) => bases.includes(base));
  }

  /**
   * Extract the class body (until next class or end of indentation).
   */
  private extractClassBody(content: string, startIndex: number): string {
    const lines = content.substring(startIndex).split('\n');
    const bodyLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) {continue;}

      // Stop at next class definition at same or lower indentation
      if (i > 0 && /^class\s+\w+/.test(line)) {break;}

      // Stop at unindented non-empty line (except first line)
      if (i > 0 && line.trim() && !line.startsWith(' ') && !line.startsWith('\t')) {break;}

      bodyLines.push(line);

      // Limit to reasonable size
      if (bodyLines.length > 200) {break;}
    }

    return bodyLines.join('\n');
  }

  /**
   * Parse a serializer class.
   */
  private parseSerializer(
    name: string,
    bases: string,
    classBody: string,
    file: string,
    line: number
  ): DjangoSerializerInfo {
    const baseClass = this.extractPrimaryBase(bases);
    const fields = this.extractFields(classBody);
    const meta = this.extractMeta(classBody);
    const nestedSerializers = this.extractNestedSerializers(classBody);

    return {
      name,
      baseClass,
      modelClass: meta.model,
      fields,
      metaFields: meta.fields,
      excludeFields: meta.exclude,
      readOnlyFields: meta.readOnlyFields,
      extraKwargs: meta.extraKwargs,
      nestedSerializers,
      file,
      line,
    };
  }

  /**
   * Extract the primary base class.
   */
  private extractPrimaryBase(bases: string): string {
    const parts = bases.split(',').map((b) => b.trim());
    for (const part of parts) {
      if (part.includes('Serializer')) {
        return part.replace('serializers.', '');
      }
    }
    return parts[0]?.replace('serializers.', '') ?? 'Serializer';
  }

  /**
   * Extract field definitions from class body.
   */
  private extractFields(classBody: string): DjangoSerializerFieldInfo[] {
    const fields: DjangoSerializerFieldInfo[] = [];

    // Reset regex
    SERIALIZER_FIELD_PATTERN.lastIndex = 0;

    let match;
    while ((match = SERIALIZER_FIELD_PATTERN.exec(classBody)) !== null) {
      const fieldName = match[1];
      const fieldClass = match[2];
      const argsStr = match[3];

      if (!fieldName || !fieldClass) {continue;}

      // Skip Meta class and methods
      if (fieldName === 'Meta' || fieldName === 'class') {continue;}

      const field = this.parseField(fieldName, fieldClass, argsStr ?? '', match.index);
      fields.push(field);
    }

    return fields;
  }

  /**
   * Parse a single field definition.
   */
  private parseField(
    name: string,
    fieldClass: string,
    argsStr: string,
    offset: number
  ): DjangoSerializerFieldInfo {
    const kwargs = this.parseFieldKwargs(argsStr);

    return {
      name,
      fieldClass,
      required: typeof kwargs['required'] === 'boolean' ? kwargs['required'] : true,
      readOnly: typeof kwargs['readOnly'] === 'boolean' ? kwargs['readOnly'] : false,
      writeOnly: typeof kwargs['writeOnly'] === 'boolean' ? kwargs['writeOnly'] : false,
      allowNull: typeof kwargs['allowNull'] === 'boolean' ? kwargs['allowNull'] : false,
      allowBlank: typeof kwargs['allowBlank'] === 'boolean' ? kwargs['allowBlank'] : false,
      defaultValue: typeof kwargs['default'] === 'string' ? kwargs['default'] : null,
      source: typeof kwargs['source'] === 'string' ? kwargs['source'] : null,
      helpText: typeof kwargs['helpText'] === 'string' ? kwargs['helpText'] : null,
      maxLength: typeof kwargs['maxLength'] === 'number' ? kwargs['maxLength'] : null,
      minLength: typeof kwargs['minLength'] === 'number' ? kwargs['minLength'] : null,
      choices: Array.isArray(kwargs['choices']) ? kwargs['choices'] as string[] : null,
      line: offset, // Will be adjusted later
    };
  }

  /**
   * Parse field keyword arguments.
   */
  private parseFieldKwargs(argsStr: string): Record<string, unknown> {
    const kwargs: Record<string, unknown> = {};

    // Match keyword arguments
    const kwargPattern = /(\w+)\s*=\s*([^,]+?)(?:,|$)/g;
    let match;

    while ((match = kwargPattern.exec(argsStr)) !== null) {
      const key = match[1];
      const value = match[2]?.trim();

      if (!key || !value) {continue;}

      // Parse the value
      kwargs[this.camelCase(key)] = this.parseValue(value);
    }

    return kwargs;
  }

  /**
   * Parse a Python value string.
   */
  private parseValue(value: string): unknown {
    const trimmed = value.trim();

    if (trimmed === 'True') {return true;}
    if (trimmed === 'False') {return false;}
    if (trimmed === 'None') {return null;}

    // Number
    const num = parseFloat(trimmed);
    if (!isNaN(num) && /^-?\d+\.?\d*$/.test(trimmed)) {
      return num;
    }

    // String
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    // List of choices
    if (trimmed.startsWith('[') || trimmed.startsWith('(')) {
      return this.parseList(trimmed);
    }

    return trimmed;
  }

  /**
   * Parse a Python list/tuple.
   */
  private parseList(value: string): string[] {
    const inner = value.slice(1, -1);
    const items: string[] = [];

    // Simple parsing - split by comma and clean up
    const parts = inner.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) {continue;}

      // Remove quotes
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
          (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        items.push(trimmed.slice(1, -1));
      } else {
        items.push(trimmed);
      }
    }

    return items;
  }

  /**
   * Extract Meta class information.
   */
  private extractMeta(classBody: string): {
    model: string | null;
    fields: string[] | 'all';
    exclude: string[];
    readOnlyFields: string[];
    extraKwargs: Record<string, DjangoFieldKwargs>;
  } {
    const result = {
      model: null as string | null,
      fields: [] as string[] | 'all',
      exclude: [] as string[],
      readOnlyFields: [] as string[],
      extraKwargs: {} as Record<string, DjangoFieldKwargs>,
    };

    // Find Meta class
    META_CLASS_PATTERN.lastIndex = 0;
    const metaMatch = META_CLASS_PATTERN.exec(classBody);
    if (!metaMatch) {return result;}

    const metaStart = metaMatch.index + metaMatch[0].length;
    const metaBody = this.extractMetaBody(classBody, metaStart);

    // Extract model
    const modelMatch = META_MODEL_PATTERN.exec(metaBody);
    if (modelMatch?.[1]) {
      result.model = modelMatch[1];
    }

    // Extract fields
    const fieldsMatch = META_FIELDS_PATTERN.exec(metaBody);
    if (fieldsMatch) {
      if (metaBody.includes("'__all__'") || metaBody.includes('"__all__"')) {
        result.fields = 'all';
      } else if (fieldsMatch[1]) {
        result.fields = this.parseList(fieldsMatch[1]);
      }
    }

    // Extract exclude
    const excludeMatch = META_EXCLUDE_PATTERN.exec(metaBody);
    if (excludeMatch?.[1]) {
      result.exclude = this.parseList(excludeMatch[1]);
    }

    // Extract read_only_fields
    const readOnlyMatch = META_READ_ONLY_PATTERN.exec(metaBody);
    if (readOnlyMatch?.[1]) {
      result.readOnlyFields = this.parseList(readOnlyMatch[1]);
    }

    // Extract extra_kwargs
    const extraKwargsMatch = META_EXTRA_KWARGS_PATTERN.exec(metaBody);
    if (extraKwargsMatch?.[1]) {
      result.extraKwargs = this.parseExtraKwargs(extraKwargsMatch[1]);
    }

    return result;
  }

  /**
   * Extract Meta class body.
   */
  private extractMetaBody(classBody: string, startIndex: number): string {
    const lines = classBody.substring(startIndex).split('\n');
    const bodyLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) {continue;}

      // Stop at next class or method definition
      if (i > 0 && /^\s{0,4}(?:class|def)\s+/.test(line)) {break;}

      // Stop at field definition (not indented enough for Meta)
      if (i > 0 && /^\s{4}\w+\s*=/.test(line)) {break;}

      bodyLines.push(line);

      if (bodyLines.length > 50) {break;}
    }

    return bodyLines.join('\n');
  }

  /**
   * Parse extra_kwargs dictionary.
   */
  private parseExtraKwargs(content: string): Record<string, DjangoFieldKwargs> {
    const result: Record<string, DjangoFieldKwargs> = {};

    // Match field entries: 'field_name': {...}
    const fieldPattern = /['"](\w+)['"]\s*:\s*\{([^}]+)\}/g;
    let match;

    while ((match = fieldPattern.exec(content)) !== null) {
      const fieldName = match[1];
      const kwargsStr = match[2];

      if (!fieldName || !kwargsStr) {continue;}

      result[fieldName] = this.parseFieldKwargs(kwargsStr) as DjangoFieldKwargs;
    }

    return result;
  }

  /**
   * Extract nested serializer references.
   */
  private extractNestedSerializers(classBody: string): Map<string, string> {
    const nested = new Map<string, string>();

    // Pattern: field_name = SomeSerializer(...)
    const nestedPattern = /^\s+(\w+)\s*=\s*(\w+Serializer)\s*\(/gm;
    let match;

    while ((match = nestedPattern.exec(classBody)) !== null) {
      const fieldName = match[1];
      const serializerName = match[2];

      if (fieldName && serializerName) {
        nested.set(fieldName, serializerName);
      }
    }

    return nested;
  }

  /**
   * Convert snake_case to camelCase.
   */
  private camelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Get line number from character offset.
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}
