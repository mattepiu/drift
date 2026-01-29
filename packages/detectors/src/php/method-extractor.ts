/**
 * PHP Method Extractor
 *
 * Extracts method definitions from PHP classes including:
 * - Method signatures (name, visibility, modifiers)
 * - Parameters with types and defaults
 * - Return types
 * - PHP 8 attributes
 * - PHPDoc blocks
 *
 * @module php/method-extractor
 */

import { AttributeExtractor } from './attribute-extractor.js';
import { DocblockExtractor } from './docblock-extractor.js';

import type {
  PhpMethodInfo,
  PhpMethodModifiers,
  PhpParameterInfo,
  PhpTypeInfo,
  PhpVisibility,
  DocblockInfo,
  ExtractionResult,
} from './types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Pattern to match method declarations
 * Captures: attributes, visibility, modifiers, function keyword, name, params, return type
 */
const METHOD_PATTERN = /(?:^|\n)((?:\s*#\[[^\]]+\]\s*)*)\s*(public|protected|private)?\s*(static|abstract|final)?\s*(static|abstract|final)?\s*function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\??\s*[\w\\|&]+))?\s*(?:\{|;)/g;

/**
 * Pattern to match individual parameters
 */
const PARAM_PATTERN = /(?:(public|protected|private)\s+)?(?:(readonly)\s+)?(?:(\??\s*[\w\\|&]+)\s+)?(&)?(\.\.\.)?\$(\w+)(?:\s*=\s*([^,)]+))?/g;

// ============================================================================
// Method Extractor
// ============================================================================

/**
 * Extracts PHP method definitions
 */
export class MethodExtractor {
  private readonly docblockExtractor: DocblockExtractor;
  private readonly attributeExtractor: AttributeExtractor;

  constructor() {
    this.docblockExtractor = new DocblockExtractor();
    this.attributeExtractor = new AttributeExtractor();
  }

  /**
   * Extract methods from a class body
   *
   * @param classBody - Content between class { and }
   * @param file - File path
   * @param classStartLine - Line number where class starts
   * @returns Array of extracted methods
   */
  extractFromClassBody(
    classBody: string,
    file: string,
    classStartLine: number = 1
  ): PhpMethodInfo[] {
    const methods: PhpMethodInfo[] = [];
    METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = METHOD_PATTERN.exec(classBody)) !== null) {
      const method = this.parseMethod(match, classBody, file, classStartLine);
      if (method) {
        methods.push(method);
      }
    }

    return methods;
  }

  /**
   * Extract all methods from PHP content (including standalone functions)
   *
   * @param content - PHP source code
   * @param file - File path
   * @returns Extraction result with methods
   */
  extract(content: string, file: string): ExtractionResult<PhpMethodInfo> {
    const methods: PhpMethodInfo[] = [];
    const errors: string[] = [];

    METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = METHOD_PATTERN.exec(content)) !== null) {
      try {
        const method = this.parseMethod(match, content, file, 1);
        if (method) {
          methods.push(method);
        }
      } catch (error) {
        errors.push(`Error parsing method at position ${match.index}: ${error}`);
      }
    }

    return {
      items: methods,
      confidence: methods.length > 0 ? 0.9 : 0,
      errors,
    };
  }

  /**
   * Get method by name from content
   *
   * @param content - PHP content
   * @param methodName - Method name to find
   * @param file - File path
   * @returns Method info or null
   */
  getMethodByName(content: string, methodName: string, file: string): PhpMethodInfo | null {
    const result = this.extract(content, file);
    return result.items.find(m => m.name === methodName) || null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Parse a single method from regex match
   */
  private parseMethod(
    match: RegExpExecArray,
    content: string,
    _file: string,
    baseLineOffset: number
  ): PhpMethodInfo | null {
    const attributesStr = match[1] || '';
    const visibility = (match[2] || 'public') as PhpVisibility;
    const modifier1 = match[3] || '';
    const modifier2 = match[4] || '';
    const methodName = match[5];
    const paramsStr = match[6] || '';
    const returnTypeStr = match[7] || null;

    if (!methodName) {return null;}

    const line = baseLineOffset + this.getLineNumber(content, match.index) - 1;
    
    // Parse modifiers
    const modifiers = this.parseModifiers(modifier1, modifier2);

    // Parse parameters
    const parameters = this.parseParameters(paramsStr);

    // Parse return type
    const returnType = returnTypeStr ? this.parseType(returnTypeStr) : null;

    // Extract attributes
    const attributes = this.attributeExtractor.extractFromString(attributesStr);

    // Extract docblock before method
    const docblock = this.extractDocblockBefore(content, match.index);

    // Extract method body
    const { body, endLine } = this.extractMethodBody(content, match.index + match[0].length, line);

    return {
      name: methodName,
      visibility,
      modifiers,
      parameters,
      returnType,
      attributes,
      docblock,
      body,
      line,
      endLine,
    };
  }

  /**
   * Parse method modifiers
   */
  private parseModifiers(mod1: string, mod2: string): PhpMethodModifiers {
    const combined = `${mod1} ${mod2}`.toLowerCase();
    return {
      isStatic: combined.includes('static'),
      isAbstract: combined.includes('abstract'),
      isFinal: combined.includes('final'),
    };
  }

  /**
   * Parse method parameters
   */
  private parseParameters(paramsStr: string): PhpParameterInfo[] {
    const parameters: PhpParameterInfo[] = [];
    
    if (!paramsStr.trim()) {
      return parameters;
    }

    PARAM_PATTERN.lastIndex = 0;

    let match;
    while ((match = PARAM_PATTERN.exec(paramsStr)) !== null) {
      const promotedVisibility = match[1] as PhpVisibility | undefined;
      const isReadonly = !!match[2];
      const typeStr = match[3] || null;
      const isByReference = !!match[4];
      const isVariadic = !!match[5];
      const name = match[6];
      const defaultValue = match[7]?.trim() || null;

      if (!name) {continue;}

      parameters.push({
        name,
        type: typeStr ? this.parseType(typeStr) : null,
        defaultValue,
        hasDefault: defaultValue !== null,
        isVariadic,
        isByReference,
        isPromoted: !!promotedVisibility || isReadonly,
        promotedVisibility: promotedVisibility || null,
        attributes: [], // Could extract parameter attributes if needed
        line: 0, // Line within method signature
      });
    }

    return parameters;
  }

  /**
   * Parse a type string into PhpTypeInfo
   */
  private parseType(typeStr: string): PhpTypeInfo {
    const raw = typeStr.trim();
    const isNullable = raw.startsWith('?') || raw.toLowerCase().includes('null');
    
    let types: string[];
    let mode: 'single' | 'union' | 'intersection' = 'single';

    if (raw.includes('|')) {
      types = raw.replace(/^\?\s*/, '').split('|').map(t => t.trim());
      mode = 'union';
    } else if (raw.includes('&')) {
      types = raw.split('&').map(t => t.trim());
      mode = 'intersection';
    } else {
      types = [raw.replace(/^\?\s*/, '')];
    }

    const builtins = ['string', 'int', 'float', 'bool', 'array', 'object', 'callable', 'iterable', 'mixed', 'void', 'never', 'null', 'self', 'static', 'parent'];
    const isBuiltin = types.every(t => builtins.includes(t.toLowerCase()));

    return { raw, isNullable, types, mode, isBuiltin };
  }

  /**
   * Extract docblock immediately before a position
   */
  private extractDocblockBefore(content: string, position: number): DocblockInfo | null {
    return this.docblockExtractor.extractBefore(content, position);
  }

  /**
   * Extract method body
   */
  private extractMethodBody(
    content: string,
    startIndex: number,
    startLine: number
  ): { body: string | null; endLine: number } {
    // Check if this is an abstract method (ends with ;)
    const beforeStart = content.substring(startIndex - 10, startIndex);
    if (beforeStart.trim().endsWith(';')) {
      return { body: null, endLine: startLine };
    }

    // Find the opening brace
    const braceIndex = content.indexOf('{', startIndex - 1);
    if (braceIndex === -1) {
      return { body: null, endLine: startLine };
    }

    // Find matching closing brace
    let depth = 1;
    let i = braceIndex + 1;
    const bodyStart = i;

    while (i < content.length && depth > 0) {
      const char = content[i];
      
      // Skip strings
      if (char === '"' || char === "'") {
        const quote = char;
        i++;
        while (i < content.length && content[i] !== quote) {
          if (content[i] === '\\') {i++;} // Skip escaped chars
          i++;
        }
      }
      
      // Skip comments
      if (char === '/' && content[i + 1] === '/') {
        while (i < content.length && content[i] !== '\n') {i++;}
      }
      if (char === '/' && content[i + 1] === '*') {
        i += 2;
        while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) {i++;}
        i++;
      }

      if (char === '{') {depth++;}
      else if (char === '}') {depth--;}
      
      i++;
    }

    const body = content.substring(bodyStart, i - 1);
    const endLine = startLine + body.split('\n').length;

    return { body, endLine };
  }

  /**
   * Get line number from character offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new method extractor instance
 */
export function createMethodExtractor(): MethodExtractor {
  return new MethodExtractor();
}
