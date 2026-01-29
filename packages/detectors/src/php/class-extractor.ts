/**
 * PHP Class Extractor
 *
 * Extracts PHP class definitions with full metadata including:
 * - Class name, namespace, inheritance
 * - Properties, methods, constants
 * - PHP 8 attributes
 * - PHPDoc blocks
 *
 * @module php/class-extractor
 */

import { AttributeExtractor } from './attribute-extractor.js';
import { DocblockExtractor } from './docblock-extractor.js';
import { MethodExtractor } from './method-extractor.js';

import type {
  PhpClassInfo,
  PhpClassModifiers,
  PhpPropertyInfo,
  PhpConstantInfo,
  PhpAttribute,
  DocblockInfo,
  PhpVisibility,
  ExtractionResult,
} from './types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Pattern to match class declarations
 * Captures: modifiers, class name, extends, implements
 */
const CLASS_PATTERN = /(?:^|\n)((?:abstract\s+|final\s+|readonly\s+)*)\s*class\s+(\w+)(?:\s+extends\s+([\w\\]+))?(?:\s+implements\s+([\w\\,\s]+))?\s*\{/g;

/**
 * Pattern to match trait use statements within a class
 */
const TRAIT_USE_PATTERN = /use\s+([\w\\,\s]+)\s*(?:\{[^}]*\})?;/g;

/**
 * Pattern to match property declarations
 */
const PROPERTY_PATTERN = /(?:^|\n)\s*((?:#\[[^\]]+\]\s*)*)(public|protected|private)(?:\s+(static|readonly))?\s+(?:(\??\w+(?:\|[\w\\]+)*)\s+)?\$(\w+)(?:\s*=\s*([^;]+))?;/g;

/**
 * Pattern to match class constants
 */
const CONSTANT_PATTERN = /(?:^|\n)\s*((?:#\[[^\]]+\]\s*)*)(public|protected|private)?\s*(final\s+)?const\s+(?:(\w+)\s+)?(\w+)\s*=\s*([^;]+);/g;

// ============================================================================
// Class Extractor
// ============================================================================

/**
 * Extracts PHP class definitions from source code
 */
export class ClassExtractor {
  private readonly docblockExtractor: DocblockExtractor;
  private readonly attributeExtractor: AttributeExtractor;
  private readonly methodExtractor: MethodExtractor;

  constructor() {
    this.docblockExtractor = new DocblockExtractor();
    this.attributeExtractor = new AttributeExtractor();
    this.methodExtractor = new MethodExtractor();
  }

  /**
   * Extract all classes from PHP content
   *
   * @param content - PHP source code
   * @param file - File path
   * @param namespace - Namespace if already extracted
   * @returns Extraction result with classes
   */
  extract(
    content: string,
    file: string,
    namespace: string | null = null
  ): ExtractionResult<PhpClassInfo> {
    const classes: PhpClassInfo[] = [];
    const errors: string[] = [];

    // Reset regex
    CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = CLASS_PATTERN.exec(content)) !== null) {
      try {
        const classInfo = this.parseClass(match, content, file, namespace);
        if (classInfo) {
          classes.push(classInfo);
        }
      } catch (error) {
        errors.push(`Error parsing class at line ${this.getLineNumber(content, match.index)}: ${error}`);
      }
    }

    return {
      items: classes,
      confidence: classes.length > 0 ? 0.9 : 0,
      errors,
    };
  }

  /**
   * Parse a single class from regex match
   */
  private parseClass(
    match: RegExpExecArray,
    content: string,
    file: string,
    namespace: string | null
  ): PhpClassInfo | null {
    const modifiersStr = match[1] || '';
    const className = match[2];
    const extendsClass = match[3] || null;
    const implementsStr = match[4] || '';

    if (!className) {return null;}

    const line = this.getLineNumber(content, match.index);
    const classBody = this.extractClassBody(content, match.index + match[0].length);
    const endLine = line + classBody.split('\n').length;

    // Parse modifiers
    const modifiers = this.parseModifiers(modifiersStr);

    // Parse implements
    const implementsList = implementsStr
      ? implementsStr.split(',').map(i => i.trim()).filter(Boolean)
      : [];

    // Extract traits
    const traits = this.extractTraits(classBody);

    // Extract docblock before class
    const docblock = this.extractDocblockBefore(content, match.index);

    // Extract attributes before class
    const attributes = this.extractAttributesBefore(content, match.index);

    // Extract properties
    const properties = this.extractProperties(classBody, file);

    // Extract constants
    const constants = this.extractConstants(classBody, file);

    // Extract methods
    const methods = this.methodExtractor.extractFromClassBody(classBody, file, line);

    // Build FQN
    const fqn = namespace ? `${namespace}\\${className}` : className;

    return {
      name: className,
      fqn,
      namespace,
      extends: extendsClass,
      implements: implementsList,
      traits,
      modifiers,
      constants,
      properties,
      methods,
      attributes,
      docblock,
      file,
      line,
      endLine,
    };
  }

  /**
   * Parse class modifiers from string
   */
  private parseModifiers(modifiersStr: string): PhpClassModifiers {
    const lower = modifiersStr.toLowerCase();
    return {
      isAbstract: lower.includes('abstract'),
      isFinal: lower.includes('final'),
      isReadonly: lower.includes('readonly'),
    };
  }

  /**
   * Extract the class body (content between { and matching })
   */
  private extractClassBody(content: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex;
    const start = startIndex;

    while (i < content.length && depth > 0) {
      const char = content[i];
      if (char === '{') {depth++;}
      else if (char === '}') {depth--;}
      i++;
    }

    return content.substring(start, i - 1);
  }

  /**
   * Extract traits used in class
   */
  private extractTraits(classBody: string): string[] {
    const traits: string[] = [];
    TRAIT_USE_PATTERN.lastIndex = 0;

    let match;
    while ((match = TRAIT_USE_PATTERN.exec(classBody)) !== null) {
      const traitList = match[1];
      if (traitList) {
        const parsed = traitList.split(',').map(t => t.trim()).filter(Boolean);
        traits.push(...parsed);
      }
    }

    return traits;
  }

  /**
   * Extract properties from class body
   */
  private extractProperties(classBody: string, _file: string): PhpPropertyInfo[] {
    const properties: PhpPropertyInfo[] = [];
    PROPERTY_PATTERN.lastIndex = 0;

    let match;
    while ((match = PROPERTY_PATTERN.exec(classBody)) !== null) {
      const attributesStr = match[1] || '';
      const visibility = (match[2] || 'public') as PhpVisibility;
      const modifier = match[3] || '';
      const typeStr = match[4] || null;
      const name = match[5];
      const defaultValue = match[6]?.trim() || null;

      if (!name) {continue;}

      const line = this.getLineNumber(classBody, match.index);
      const attributes = this.attributeExtractor.extractFromString(attributesStr);

      properties.push({
        name,
        visibility,
        modifiers: {
          isStatic: modifier === 'static',
          isReadonly: modifier === 'readonly',
        },
        type: typeStr ? this.parseType(typeStr) : null,
        defaultValue,
        hasDefault: defaultValue !== null,
        attributes,
        docblock: null, // Could extract if needed
        line,
      });
    }

    return properties;
  }

  /**
   * Extract constants from class body
   */
  private extractConstants(classBody: string, _file: string): PhpConstantInfo[] {
    const constants: PhpConstantInfo[] = [];
    CONSTANT_PATTERN.lastIndex = 0;

    let match;
    while ((match = CONSTANT_PATTERN.exec(classBody)) !== null) {
      // const _attributesStr = match[1] || '';
      const visibility = (match[2] || 'public') as PhpVisibility;
      const isFinal = !!match[3];
      const typeStr = match[4] || null;
      const name = match[5];
      const value = match[6]?.trim() || '';

      if (!name) {continue;}

      const line = this.getLineNumber(classBody, match.index);

      constants.push({
        name,
        visibility,
        isFinal,
        value,
        type: typeStr ? this.parseType(typeStr) : null,
        docblock: null,
        line,
      });
    }

    return constants;
  }

  /**
   * Extract docblock immediately before a position
   */
  private extractDocblockBefore(content: string, position: number): DocblockInfo | null {
    // Look backwards for /** ... */
    const before = content.substring(0, position);
    const docblockMatch = before.match(/\/\*\*[\s\S]*?\*\/\s*(?:(?:#\[[^\]]+\]\s*)*)$/);
    
    if (docblockMatch) {
      const docblockContent = docblockMatch[0].match(/\/\*\*([\s\S]*?)\*\//);
      if (docblockContent) {
        return this.docblockExtractor.parse(docblockContent[0], this.getLineNumber(content, position - docblockMatch[0].length));
      }
    }

    return null;
  }

  /**
   * Extract attributes immediately before a position
   */
  private extractAttributesBefore(content: string, position: number): PhpAttribute[] {
    const before = content.substring(Math.max(0, position - 500), position);
    return this.attributeExtractor.extractFromString(before);
  }

  /**
   * Parse a type string into PhpTypeInfo
   */
  private parseType(typeStr: string): {
    raw: string;
    isNullable: boolean;
    types: string[];
    mode: 'single' | 'union' | 'intersection';
    isBuiltin: boolean;
  } {
    const raw = typeStr.trim();
    const isNullable = raw.startsWith('?') || raw.toLowerCase().includes('null');
    
    let types: string[];
    let mode: 'single' | 'union' | 'intersection' = 'single';

    if (raw.includes('|')) {
      types = raw.replace(/^\?/, '').split('|').map(t => t.trim());
      mode = 'union';
    } else if (raw.includes('&')) {
      types = raw.split('&').map(t => t.trim());
      mode = 'intersection';
    } else {
      types = [raw.replace(/^\?/, '')];
    }

    const builtins = ['string', 'int', 'float', 'bool', 'array', 'object', 'callable', 'iterable', 'mixed', 'void', 'never', 'null'];
    const isBuiltin = types.every(t => builtins.includes(t.toLowerCase()));

    return { raw, isNullable, types, mode, isBuiltin };
  }

  /**
   * Get line number from character offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new class extractor instance
 */
export function createClassExtractor(): ClassExtractor {
  return new ClassExtractor();
}
