/**
 * Integration Phase
 * 
 * Phase 3 of consolidation: Merge abstractions with existing semantic memory.
 * Creates new semantic memories or updates existing ones.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { SemanticMemory } from '../types/index.js';
import type { AbstractedKnowledge } from './abstraction.js';
import { generateId } from '../utils/id-generator.js';

/**
 * Integration phase
 */
export class IntegrationPhase {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Merge abstractions with existing semantic memory
   */
  async merge(abstractions: AbstractedKnowledge[]): Promise<{
    created: number;
    updated: number;
  }> {
    let created = 0;
    let updated = 0;

    for (const abstraction of abstractions) {
      // Check for existing semantic memory on same topic
      const existing = await this.findExisting(abstraction.topic, abstraction.knowledge);

      if (existing) {
        // Update existing memory
        await this.storage.update(existing.id, {
          confidence: Math.max(existing.confidence, abstraction.confidence),
          supportingEvidence: existing.supportingEvidence + abstraction.supportingEvidence,
          lastReinforced: new Date().toISOString(),
          consolidatedFrom: {
            episodicMemoryIds: [
              ...(existing.consolidatedFrom?.episodicMemoryIds || []),
              ...abstraction.sourceEpisodes,
            ],
            consolidationDate: new Date().toISOString(),
            consolidationMethod: 'automatic',
          },
        });
        updated++;
      } else {
        // Create new semantic memory
        const memory: SemanticMemory = {
          id: generateId(),
          type: 'semantic',
          topic: abstraction.topic,
          knowledge: abstraction.knowledge,
          summary: `💡 ${abstraction.topic}: ${abstraction.knowledge.slice(0, 50)}...`,
          confidence: abstraction.confidence,
          importance: 'normal',
          accessCount: 0,
          supportingEvidence: abstraction.supportingEvidence,
          contradictingEvidence: 0,
          consolidatedFrom: {
            episodicMemoryIds: abstraction.sourceEpisodes,
            consolidationDate: new Date().toISOString(),
            consolidationMethod: 'automatic',
          },
          transactionTime: {
            recordedAt: new Date().toISOString(),
            recordedBy: 'consolidation',
          },
          validTime: {
            validFrom: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await this.storage.create(memory);
        created++;
      }
    }

    return { created, updated };
  }

  /**
   * Find existing semantic memory with similar topic/knowledge
   */
  private async findExisting(topic: string, knowledge: string): Promise<SemanticMemory | null> {
    const candidates = await this.storage.search({
      types: ['semantic'],
      topics: [topic],
      limit: 10,
    });

    // Find one with similar knowledge
    for (const candidate of candidates as SemanticMemory[]) {
      if (this.isSimilar(candidate.knowledge, knowledge)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Check if two pieces of knowledge are similar
   */
  private isSimilar(a: string, b: string): boolean {
    // Simple similarity check (could use embeddings for better accuracy)
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.size / union.size > 0.5;
  }
}
