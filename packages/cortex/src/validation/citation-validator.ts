/**
 * Citation Validator
 * 
 * Validates that code citations in memories still match the actual code.
 * Uses content hashing to detect drift.
 */

import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import type { Memory, MemoryCitation } from '../types/index.js';
import type { ValidationIssue } from './engine.js';

/**
 * Citation validator
 */
export class CitationValidator {
  /**
   * Validate citations in a memory
   */
  async validate(memory: Memory): Promise<ValidationIssue[]> {
    const citations = this.getCitations(memory);
    if (citations.length === 0) return [];

    const issues: ValidationIssue[] = [];
    let validCount = 0;

    for (const citation of citations) {
      try {
        const isValid = await this.validateCitation(citation);
        if (isValid) {
          validCount++;
        } else {
          issues.push({
            dimension: 'citation',
            severity: 'moderate',
            description: `Citation in ${citation.file}:${citation.lineStart} has drifted`,
            suggestion: 'Update citation or verify memory is still accurate',
          });
        }
      } catch {
        issues.push({
          dimension: 'citation',
          severity: 'severe',
          description: `File ${citation.file} not found or unreadable`,
          suggestion: 'File may have been deleted or moved',
        });
      }
    }

    // If more than half of citations are invalid, it's severe
    if (validCount < citations.length / 2 && citations.length > 1) {
      const firstIssue = issues[0];
      if (firstIssue) {
        firstIssue.severity = 'severe';
      }
    }

    return issues;
  }

  /**
   * Validate a single citation
   */
  private async validateCitation(citation: MemoryCitation): Promise<boolean> {
    const content = await readFile(citation.file, 'utf-8');
    const lines = content.split('\n');

    // Extract section with context
    const start = Math.max(0, citation.lineStart - 3);
    const end = Math.min(lines.length, citation.lineEnd + 3);
    const section = lines.slice(start, end).join('\n');

    // Compare hash
    const currentHash = this.hash(section);
    return currentHash === citation.hash;
  }

  /**
   * Hash content for comparison
   */
  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get citations from a memory
   */
  private getCitations(memory: Memory): MemoryCitation[] {
    // Different memory types store citations differently
    if ('citations' in memory && Array.isArray(memory.citations)) {
      return memory.citations;
    }
    return [];
  }
}
