/**
 * Healing Engine
 * 
 * Auto-healing strategies for memory validation issues.
 * Can update citations, refresh timestamps, and adjust confidence.
 */

import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory, MemoryCitation } from '../types/index.js';
import type { ValidationIssue } from './engine.js';

/**
 * Healing result
 */
export interface HealResult {
  /** Whether healing was successful */
  success: boolean;
  /** New confidence after healing */
  newConfidence?: number;
  /** Actions taken */
  actions: string[];
}

/**
 * Healing engine
 */
export class HealingEngine {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Attempt to heal a memory
   */
  async heal(memory: Memory, issues: ValidationIssue[]): Promise<HealResult> {
    const actions: string[] = [];
    let success = true;

    for (const issue of issues) {
      switch (issue.dimension) {
        case 'citation': {
          const citationHealed = await this.healCitation(memory);
          if (citationHealed) {
            actions.push('Updated citation hashes');
          } else {
            success = false;
          }
          break;
        }

        case 'temporal':
          // Just update last validated timestamp
          await this.storage.update(memory.id, {
            lastValidated: new Date().toISOString(),
          });
          actions.push('Updated validation timestamp');
          break;

        default:
          // Can't auto-heal contradictions or pattern issues
          success = false;
      }
    }

    if (success) {
      // Slight confidence boost for successful healing
      const newConfidence = Math.min(1.0, memory.confidence + 0.05);
      await this.storage.update(memory.id, { confidence: newConfidence });
      return { success: true, newConfidence, actions };
    }

    return { success: false, actions };
  }

  /**
   * Heal citation hashes
   */
  private async healCitation(memory: Memory): Promise<boolean> {
    if (!('citations' in memory) || !Array.isArray(memory.citations)) {
      return false;
    }

    const updatedCitations: MemoryCitation[] = [];

    for (const citation of memory.citations) {
      try {
        const content = await readFile(citation.file, 'utf-8');
        const lines = content.split('\n');

        const start = Math.max(0, citation.lineStart - 3);
        const end = Math.min(lines.length, citation.lineEnd + 3);
        const section = lines.slice(start, end).join('\n');

        updatedCitations.push({
          ...citation,
          hash: createHash('sha256').update(section).digest('hex').slice(0, 16),
          validatedAt: new Date().toISOString(),
          valid: true,
        });
      } catch {
        // File not found, can't heal
        return false;
      }
    }

    await this.storage.update(memory.id, {
      citations: updatedCitations,
    } as Partial<Memory>);

    return true;
  }
}
