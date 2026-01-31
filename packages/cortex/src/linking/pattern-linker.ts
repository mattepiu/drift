/**
 * Pattern Linker
 * 
 * Links memories to Drift's pattern system.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory } from '../types/index.js';

/**
 * Pattern linker
 */
export class PatternLinker {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Link a memory to a pattern
   */
  async link(memoryId: string, patternId: string): Promise<void> {
    await this.storage.linkToPattern(memoryId, patternId);
  }

  /**
   * Get memories linked to a pattern
   */
  async getMemoriesForPattern(patternId: string): Promise<Memory[]> {
    return this.storage.findByPattern(patternId);
  }

  /**
   * Auto-link memories based on content analysis
   */
  async autoLink(memory: Memory, patterns: Array<{ id: string; name: string }>): Promise<string[]> {
    const linked: string[] = [];

    // Check if memory mentions any pattern names
    const content = JSON.stringify(memory).toLowerCase();

    for (const pattern of patterns) {
      if (content.includes(pattern.name.toLowerCase())) {
        await this.link(memory.id, pattern.id);
        linked.push(pattern.id);
      }
    }

    return linked;
  }
}
