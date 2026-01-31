/**
 * Decision Linker
 * 
 * Links memories to Drift's decision mining system.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory } from '../types/index.js';

/**
 * Decision linker
 */
export class DecisionLinker {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Link a memory to a decision
   */
  async link(memoryId: string, decisionId: string): Promise<void> {
    // Decisions are linked via memory_relationships
    await this.storage.addRelationship(memoryId, decisionId, 'related');
  }

  /**
   * Get memories linked to a decision
   */
  async getMemoriesForDecision(decisionId: string): Promise<Memory[]> {
    return this.storage.getRelated(decisionId, 'related');
  }

  /**
   * Auto-link decision context memories to mined decisions
   */
  async autoLink(memory: Memory, decisions: Array<{ id: string; summary: string }>): Promise<string[]> {
    if (memory.type !== 'decision_context') return [];

    const linked: string[] = [];
    const decisionContext = memory as any;

    // Check if memory references any decision
    for (const decision of decisions) {
      if (decisionContext.decisionId === decision.id) {
        await this.link(memory.id, decision.id);
        linked.push(decision.id);
      }
    }

    return linked;
  }
}
