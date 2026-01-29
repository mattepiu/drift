/**
 * Laravel Mass Assignment Extractor
 *
 * Extracts mass assignment protection patterns from Laravel models.
 * Identifies $fillable, $guarded, and potential vulnerabilities.
 *
 * @module security/laravel/extractors/mass-assignment-extractor
 */

import type { MassAssignmentInfo } from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Model class definition
 */
const MODEL_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+(?:Illuminate\\Database\\Eloquent\\)?Model\s*\{/g;

/**
 * Fillable property
 */
const FILLABLE_PATTERN = /protected\s+\$fillable\s*=\s*\[([\s\S]*?)\]/;

/**
 * Guarded property
 */
const GUARDED_PATTERN = /protected\s+\$guarded\s*=\s*\[([\s\S]*?)\]/;

/**
 * Unguarded call
 */
const UNGUARDED_PATTERN = /Model::unguard\s*\(\s*\)/g;

// Note: Defined for future use in reguard detection
// const REGUARD_PATTERN = /Model::reguard\s*\(\s*\)/g;

/**
 * Create with request->all()
 */
const CREATE_ALL_PATTERN = /::create\s*\(\s*\$request->all\s*\(\s*\)\s*\)/g;

/**
 * Update with request->all()
 */
const UPDATE_ALL_PATTERN = /->update\s*\(\s*\$request->all\s*\(\s*\)\s*\)/g;

/**
 * Fill with request->all()
 */
const FILL_ALL_PATTERN = /->fill\s*\(\s*\$request->all\s*\(\s*\)\s*\)/g;

/**
 * ForceCreate
 */
const FORCE_CREATE_PATTERN = /::forceCreate\s*\(/g;

/**
 * ForceFill
 */
const FORCE_FILL_PATTERN = /->forceFill\s*\(/g;

// ============================================================================
// Extraction Result
// ============================================================================

/**
 * Mass assignment extraction result
 */
export interface MassAssignmentExtractionResult {
  /** Model mass assignment info */
  models: MassAssignmentInfo[];
  /** Potential vulnerabilities */
  vulnerabilities: MassAssignmentVulnerabilityInfo[];
  /** Confidence score */
  confidence: number;
}

/**
 * Mass assignment vulnerability info
 */
export interface MassAssignmentVulnerabilityInfo {
  /** Vulnerability type */
  type: 'unprotected-model' | 'request-all' | 'force-fill' | 'unguarded';
  /** Description */
  description: string;
  /** Severity */
  severity: 'low' | 'medium' | 'high';
  /** File path */
  file: string;
  /** Line number */
  line: number;
}

// ============================================================================
// Mass Assignment Extractor
// ============================================================================

/**
 * Extracts mass assignment patterns from Laravel code
 */
export class MassAssignmentExtractor {
  /**
   * Extract all mass assignment patterns from content
   */
  extract(content: string, file: string): MassAssignmentExtractionResult {
    const models = this.extractModelProtection(content, file);
    const vulnerabilities = this.detectVulnerabilities(content, file);
    const confidence = models.length > 0 || vulnerabilities.length > 0 ? 0.9 : 0;

    return {
      models,
      vulnerabilities,
      confidence,
    };
  }

  /**
   * Check if content contains mass assignment patterns
   */
  hasMassAssignmentPatterns(content: string): boolean {
    return (
      content.includes('$fillable') ||
      content.includes('$guarded') ||
      content.includes('::create(') ||
      content.includes('->fill(')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract model mass assignment protection
   */
  private extractModelProtection(content: string, file: string): MassAssignmentInfo[] {
    const models: MassAssignmentInfo[] = [];
    MODEL_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = MODEL_CLASS_PATTERN.exec(content)) !== null) {
      const model = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      // Extract fillable
      const fillable = this.extractArrayProperty(classBody, FILLABLE_PATTERN);

      // Extract guarded
      const guarded = this.extractArrayProperty(classBody, GUARDED_PATTERN);

      // Determine if model has protection
      const hasProtection = fillable.length > 0 || guarded.length > 0;

      models.push({
        model,
        fillable,
        guarded,
        hasProtection,
        file,
        line,
      });
    }

    return models;
  }

  /**
   * Detect potential mass assignment vulnerabilities
   */
  private detectVulnerabilities(content: string, file: string): MassAssignmentVulnerabilityInfo[] {
    const vulnerabilities: MassAssignmentVulnerabilityInfo[] = [];

    // Check for create with request->all()
    CREATE_ALL_PATTERN.lastIndex = 0;
    let match;
    while ((match = CREATE_ALL_PATTERN.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      vulnerabilities.push({
        type: 'request-all',
        description: 'Using $request->all() with create() bypasses validation',
        severity: 'high',
        file,
        line,
      });
    }

    // Check for update with request->all()
    UPDATE_ALL_PATTERN.lastIndex = 0;
    while ((match = UPDATE_ALL_PATTERN.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      vulnerabilities.push({
        type: 'request-all',
        description: 'Using $request->all() with update() bypasses validation',
        severity: 'high',
        file,
        line,
      });
    }

    // Check for fill with request->all()
    FILL_ALL_PATTERN.lastIndex = 0;
    while ((match = FILL_ALL_PATTERN.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      vulnerabilities.push({
        type: 'request-all',
        description: 'Using $request->all() with fill() bypasses validation',
        severity: 'high',
        file,
        line,
      });
    }

    // Check for forceCreate
    FORCE_CREATE_PATTERN.lastIndex = 0;
    while ((match = FORCE_CREATE_PATTERN.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      vulnerabilities.push({
        type: 'force-fill',
        description: 'forceCreate() bypasses mass assignment protection',
        severity: 'medium',
        file,
        line,
      });
    }

    // Check for forceFill
    FORCE_FILL_PATTERN.lastIndex = 0;
    while ((match = FORCE_FILL_PATTERN.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      vulnerabilities.push({
        type: 'force-fill',
        description: 'forceFill() bypasses mass assignment protection',
        severity: 'medium',
        file,
        line,
      });
    }

    // Check for Model::unguard()
    UNGUARDED_PATTERN.lastIndex = 0;
    while ((match = UNGUARDED_PATTERN.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      vulnerabilities.push({
        type: 'unguarded',
        description: 'Model::unguard() disables mass assignment protection globally',
        severity: 'high',
        file,
        line,
      });
    }

    return vulnerabilities;
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
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new mass assignment extractor
 */
export function createMassAssignmentExtractor(): MassAssignmentExtractor {
  return new MassAssignmentExtractor();
}
