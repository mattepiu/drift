/**
 * PHP 8 Attribute Extractor
 *
 * Extracts PHP 8 attributes (annotations) from source code.
 * Handles both simple and complex attribute syntax.
 *
 * @example #[Route('/api/users')]
 * @example #[Route('/api/users', methods: ['GET', 'POST'])]
 * @example #[Attribute1, Attribute2]
 *
 * @module php/attribute-extractor
 */

import type { PhpAttribute, PhpAttributeArgument } from './types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Pattern to match attribute blocks
 * Handles single and multiple attributes, including multiline
 */
const ATTRIBUTE_BLOCK_PATTERN = /#\[([^\]]+)\]/g;

/**
 * Pattern to match individual attribute within a block
 */
const SINGLE_ATTRIBUTE_PATTERN = /(\w+(?:\\\w+)*)(?:\s*\(([^)]*)\))?/g;

/**
 * Pattern to match named arguments
 */
const NAMED_ARG_PATTERN = /(\w+)\s*:\s*(.+)/;

// ============================================================================
// Attribute Extractor
// ============================================================================

/**
 * Extracts PHP 8 attributes from source code
 */
export class AttributeExtractor {
  /**
   * Extract all attributes from PHP content
   *
   * @param content - PHP source code
   * @returns Array of extracted attributes with positions
   */
  extractAll(content: string): Array<{ attribute: PhpAttribute; position: number }> {
    const results: Array<{ attribute: PhpAttribute; position: number }> = [];
    ATTRIBUTE_BLOCK_PATTERN.lastIndex = 0;

    let match;
    while ((match = ATTRIBUTE_BLOCK_PATTERN.exec(content)) !== null) {
      const blockContent = match[1];
      if (!blockContent) {continue;}

      const line = this.getLineNumber(content, match.index);
      const attributes = this.parseAttributeBlock(blockContent, line, match.index);
      
      for (const attr of attributes) {
        results.push({ attribute: attr, position: match.index });
      }
    }

    return results;
  }

  /**
   * Extract attributes from a string (e.g., content before a class/method)
   *
   * @param content - String that may contain attributes
   * @returns Array of extracted attributes
   */
  extractFromString(content: string): PhpAttribute[] {
    const results: PhpAttribute[] = [];
    ATTRIBUTE_BLOCK_PATTERN.lastIndex = 0;

    let match;
    while ((match = ATTRIBUTE_BLOCK_PATTERN.exec(content)) !== null) {
      const blockContent = match[1];
      if (!blockContent) {continue;}

      const line = this.getLineNumber(content, match.index);
      const attributes = this.parseAttributeBlock(blockContent, line, match.index);
      results.push(...attributes);
    }

    return results;
  }

  /**
   * Extract attributes immediately before a position
   *
   * @param content - Full PHP content
   * @param position - Character position to look before
   * @returns Array of attributes found before position
   */
  extractBefore(content: string, position: number): PhpAttribute[] {
    // Look backwards for attribute blocks
    const lookbackSize = 500;
    const start = Math.max(0, position - lookbackSize);
    const before = content.substring(start, position);
    
    return this.extractFromString(before);
  }

  /**
   * Check if content has a specific attribute
   *
   * @param content - PHP content to search
   * @param attributeName - Attribute name to find
   * @returns True if attribute is present
   */
  hasAttribute(content: string, attributeName: string): boolean {
    const attributes = this.extractFromString(content);
    return attributes.some(attr => 
      attr.name === attributeName || 
      attr.fqn === attributeName ||
      attr.name.endsWith(`\\${attributeName}`)
    );
  }

  /**
   * Get attributes by name
   *
   * @param content - PHP content to search
   * @param attributeName - Attribute name to find
   * @returns Array of matching attributes
   */
  getAttributesByName(content: string, attributeName: string): PhpAttribute[] {
    const attributes = this.extractFromString(content);
    return attributes.filter(attr => 
      attr.name === attributeName || 
      attr.fqn === attributeName ||
      attr.name.endsWith(`\\${attributeName}`)
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Parse an attribute block (content between #[ and ])
   */
  private parseAttributeBlock(blockContent: string, line: number, column: number): PhpAttribute[] {
    const attributes: PhpAttribute[] = [];
    SINGLE_ATTRIBUTE_PATTERN.lastIndex = 0;

    let match;
    while ((match = SINGLE_ATTRIBUTE_PATTERN.exec(blockContent)) !== null) {
      const name = match[1];
      const argsStr = match[2] || '';

      if (!name) {continue;}

      const { positional, named } = this.parseArguments(argsStr);

      attributes.push({
        name: this.getShortName(name),
        fqn: name.includes('\\') ? name : null,
        arguments: positional,
        namedArguments: named,
        line,
        column,
      });
    }

    return attributes;
  }

  /**
   * Parse attribute arguments
   */
  private parseArguments(argsStr: string): {
    positional: PhpAttributeArgument[];
    named: Record<string, PhpAttributeArgument>;
  } {
    const positional: PhpAttributeArgument[] = [];
    const named: Record<string, PhpAttributeArgument> = {};

    if (!argsStr.trim()) {
      return { positional, named };
    }

    // Split by comma, but respect nested structures
    const args = this.splitArguments(argsStr);

    for (const arg of args) {
      const trimmed = arg.trim();
      if (!trimmed) {continue;}

      // Check if named argument
      const namedMatch = trimmed.match(NAMED_ARG_PATTERN);
      if (namedMatch?.[1] && namedMatch[2]) {
        named[namedMatch[1]] = this.parseArgumentValue(namedMatch[2].trim());
      } else {
        positional.push(this.parseArgumentValue(trimmed));
      }
    }

    return { positional, named };
  }

  /**
   * Split arguments respecting nested structures
   */
  private splitArguments(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      const prevChar = i > 0 ? argsStr[i - 1] : '';

      // Handle string boundaries
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      // Handle nesting
      if (!inString) {
        if (char === '[' || char === '(' || char === '{') {depth++;}
        if (char === ']' || char === ')' || char === '}') {depth--;}

        // Split on comma at depth 0
        if (char === ',' && depth === 0) {
          args.push(current);
          current = '';
          continue;
        }
      }

      current += char;
    }

    if (current.trim()) {
      args.push(current);
    }

    return args;
  }

  /**
   * Parse a single argument value
   */
  private parseArgumentValue(valueStr: string): PhpAttributeArgument {
    const trimmed = valueStr.trim();

    // String literal
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return {
        raw: trimmed,
        value: trimmed.slice(1, -1),
        type: 'string',
      };
    }

    // Array literal
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const arrayContent = trimmed.slice(1, -1);
      const elements = this.splitArguments(arrayContent)
        .map(e => e.trim())
        .filter(Boolean)
        .map(e => {
          // Remove quotes from string elements
          if ((e.startsWith('"') && e.endsWith('"')) ||
              (e.startsWith("'") && e.endsWith("'"))) {
            return e.slice(1, -1);
          }
          return e;
        });
      
      return {
        raw: trimmed,
        value: elements,
        type: 'array',
      };
    }

    // Boolean
    if (trimmed.toLowerCase() === 'true') {
      return { raw: trimmed, value: true, type: 'boolean' };
    }
    if (trimmed.toLowerCase() === 'false') {
      return { raw: trimmed, value: false, type: 'boolean' };
    }

    // Null
    if (trimmed.toLowerCase() === 'null') {
      return { raw: trimmed, value: null, type: 'constant' };
    }

    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return {
        raw: trimmed,
        value: parseFloat(trimmed),
        type: 'number',
      };
    }

    // Constant or expression
    if (/^[A-Z_][A-Z0-9_]*(::[A-Z_][A-Z0-9_]*)?$/i.test(trimmed)) {
      return { raw: trimmed, value: trimmed, type: 'constant' };
    }

    // Expression (anything else)
    return { raw: trimmed, value: trimmed, type: 'expression' };
  }

  /**
   * Get short name from potentially fully qualified name
   */
  private getShortName(name: string): string {
    const parts = name.split('\\');
    return parts[parts.length - 1] || name;
  }

  /**
   * Get line number from character offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new attribute extractor instance
 */
export function createAttributeExtractor(): AttributeExtractor {
  return new AttributeExtractor();
}
