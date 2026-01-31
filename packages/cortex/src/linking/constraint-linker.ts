/**
 * Constraint Linker
 * 
 * Links memories to Drift's constraint system.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory } from '../types/index.js';

/**
 * Constraint linker
 */
export class ConstraintLinker {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Link a memory to a constraint
   */
  async link(memoryId: string, constraintId: string): Promise<void> {
    await this.storage.linkToConstraint(memoryId, constraintId);
  }

  /**
   * Get memories linked to a constraint
   */
  async getMemoriesForConstraint(constraintId: string): Promise<Memory[]> {
    return this.storage.findByConstraint(constraintId);
  }

  /**
   * Auto-link memories based on content analysis
   */
  async autoLink(memory: Memory, constraints: Array<{ id: string; description: string }>): Promise<string[]> {
    const linked: string[] = [];

    // Check if memory mentions any constraint descriptions
    const content = JSON.stringify(memory).toLowerCase();

    for (const constraint of constraints) {
      const keywords = constraint.description.toLowerCase().split(/\s+/).slice(0, 5);
      const matches = keywords.filter(k => content.includes(k)).length;

      if (matches >= 3) {
        await this.link(memory.id, constraint.id);
        linked.push(constraint.id);
      }
    }

    return linked;
  }
}
