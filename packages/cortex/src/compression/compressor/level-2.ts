/**
 * Level 2 Compressor
 * 
 * Compresses memories with one example (~200 tokens).
 * Includes knowledge, best example, and key evidence.
 * 
 * @module compression/compressor/level-2
 */

import type { Level2Output } from '../../types/compressed-memory.js';
import type { Memory } from '../../types/memory.js';
import { Level1Compressor } from './level-1.js';

/**
 * Level 2 Compressor
 * 
 * Produces output containing:
 * - Level 1 fields (ID, type, importance, oneLiner, tags, confidence)
 * - Core knowledge/content
 * - Single best example
 * - Key evidence points (max 2)
 */
export class Level2Compressor {
  /** Target tokens for level 2 */
  private readonly TARGET_TOKENS = 200;
  /** Maximum knowledge length in characters */
  private readonly MAX_KNOWLEDGE_CHARS = 400;
  /** Maximum example length in characters */
  private readonly MAX_EXAMPLE_CHARS = 300;
  /** Maximum evidence items */
  private readonly MAX_EVIDENCE = 2;
  /** Maximum evidence item length */
  private readonly MAX_EVIDENCE_CHARS = 100;

  private level1Compressor: Level1Compressor;

  constructor() {
    this.level1Compressor = new Level1Compressor();
  }

  /**
   * Compress a memory to level 2
   */
  compress(memory: Memory): Level2Output {
    const level1 = this.level1Compressor.compress(memory);
    const knowledge = this.extractKnowledge(memory);
    const example = this.selectBestExample(memory);
    const evidence = this.selectEvidence(memory, this.MAX_EVIDENCE);

    const details: Level2Output['details'] = {
      knowledge,
      evidence,
    };

    // Only add example if it exists
    if (example) {
      details.example = example;
    }

    return {
      ...level1,
      details,
      tokens: this.estimateTokens(level1.tokens, knowledge, example, evidence),
    };
  }

  /**
   * Compress multiple memories to level 2
   */
  compressBatch(memories: Memory[]): Level2Output[] {
    return memories.map(m => this.compress(m));
  }

  /**
   * Extract core knowledge from memory
   */
  extractKnowledge(memory: Memory): string {
    // Try type-specific knowledge extraction
    const typeKnowledge = this.extractTypeSpecificKnowledge(memory);
    if (typeKnowledge) {
      return this.truncate(typeKnowledge, this.MAX_KNOWLEDGE_CHARS);
    }

    // Fall back to summary or generic
    if (memory.summary) {
      return this.truncate(memory.summary, this.MAX_KNOWLEDGE_CHARS);
    }

    return `${memory.type} memory with importance ${memory.importance}`;
  }

  /**
   * Select the best example from memory
   */
  selectBestExample(memory: Memory): string | undefined {
    // Try to get examples from memory
    const examples = this.getExamples(memory);
    
    if (examples.length === 0) {
      return undefined;
    }

    // Select the best example based on:
    // 1. Length (prefer medium-length examples)
    // 2. Completeness (has code, not just description)
    const scored = examples.map(ex => ({
      example: ex,
      score: this.scoreExample(ex),
    }));

    scored.sort((a, b) => b.score - a.score);
    
    const best = scored[0]?.example;
    return best ? this.truncate(best, this.MAX_EXAMPLE_CHARS) : undefined;
  }

  /**
   * Select key evidence points
   */
  selectEvidence(memory: Memory, maxItems: number): string[] {
    const evidence: string[] = [];

    // Extract evidence from memory
    const memoryEvidence = this.getEvidence(memory);
    
    for (const ev of memoryEvidence) {
      if (evidence.length >= maxItems) break;
      evidence.push(this.truncate(ev, this.MAX_EVIDENCE_CHARS));
    }

    // If no explicit evidence, generate from context
    if (evidence.length === 0) {
      const generated = this.generateEvidence(memory);
      for (const ev of generated) {
        if (evidence.length >= maxItems) break;
        evidence.push(this.truncate(ev, this.MAX_EVIDENCE_CHARS));
      }
    }

    return evidence;
  }

  /**
   * Estimate token count for level 2 output
   */
  estimateTokens(
    level1Tokens: number,
    knowledge: string,
    example: string | undefined,
    evidence: string[]
  ): number {
    const knowledgeTokens = Math.ceil(knowledge.length / 4);
    const exampleTokens = example ? Math.ceil(example.length / 4) : 0;
    const evidenceTokens = evidence.reduce(
      (sum, e) => sum + Math.ceil(e.length / 4),
      0
    );

    return Math.max(
      this.TARGET_TOKENS,
      level1Tokens + knowledgeTokens + exampleTokens + evidenceTokens
    );
  }

  /**
   * Get target token count for this level
   */
  getTargetTokens(): number {
    return this.TARGET_TOKENS;
  }

  /**
   * Format level 2 output as string
   */
  format(output: Level2Output): string {
    const parts: string[] = [
      this.level1Compressor.format(output),
      '',
      `Knowledge: ${output.details.knowledge}`,
    ];

    if (output.details.example) {
      parts.push(`Example: ${output.details.example}`);
    }

    if (output.details.evidence.length > 0) {
      parts.push(`Evidence: ${output.details.evidence.join('; ')}`);
    }

    return parts.join('\n');
  }

  // Private helper methods

  private extractTypeSpecificKnowledge(memory: Memory): string | undefined {
    const m = memory as unknown as Record<string, unknown>;

    switch (memory.type) {
      case 'tribal':
        return (m['knowledge'] as string | undefined) || (m['content'] as string | undefined);
      case 'pattern_rationale':
        return (m['rationale'] as string | undefined) || (m['explanation'] as string | undefined);
      case 'code_smell':
        return (m['description'] as string | undefined) || (m['reason'] as string | undefined);
      default:
        return (m['content'] as string | undefined) || (m['knowledge'] as string | undefined);
    }
  }

  private getExamples(memory: Memory): string[] {
    const m = memory as unknown as Record<string, unknown>;
    const examples: string[] = [];

    // Check various example fields
    const examplesArr = m['examples'];
    if (examplesArr && Array.isArray(examplesArr)) {
      for (const ex of examplesArr) {
        if (typeof ex === 'string') {
          examples.push(ex);
        } else if (ex && typeof ex === 'object') {
          const exObj = ex as Record<string, unknown>;
          const code = exObj['code'];
          const content = exObj['content'];
          if (code && typeof code === 'string') examples.push(code);
          else if (content && typeof content === 'string') examples.push(content);
        }
      }
    }

    const example = m['example'];
    if (example && typeof example === 'string') {
      examples.push(example);
    }

    const correctExample = m['correctExample'];
    if (correctExample && typeof correctExample === 'string') {
      examples.push(correctExample);
    }

    const exampleGood = m['exampleGood'];
    if (exampleGood && typeof exampleGood === 'string') {
      examples.push(exampleGood);
    }

    return examples;
  }

  private getEvidence(memory: Memory): string[] {
    const m = memory as unknown as Record<string, unknown>;
    const evidence: string[] = [];

    const evidenceArr = m['evidence'];
    if (evidenceArr && Array.isArray(evidenceArr)) {
      for (const ev of evidenceArr) {
        if (typeof ev === 'string') {
          evidence.push(ev);
        } else if (ev && typeof ev === 'object') {
          const evObj = ev as Record<string, unknown>;
          const content = evObj['content'];
          const description = evObj['description'];
          if (content && typeof content === 'string') evidence.push(content);
          else if (description && typeof description === 'string') evidence.push(description);
        }
      }
    }

    const source = m['source'];
    if (source && typeof source === 'object') {
      const sourceObj = source as Record<string, unknown>;
      const reference = sourceObj['reference'];
      if (reference && typeof reference === 'string') {
        evidence.push(`Source: ${reference}`);
      }
    }

    return evidence;
  }

  private generateEvidence(memory: Memory): string[] {
    const evidence: string[] = [];

    // Generate evidence from metadata
    if (memory.confidence >= 0.8) {
      evidence.push(`High confidence (${(memory.confidence * 100).toFixed(0)}%)`);
    }

    if (memory.accessCount && memory.accessCount > 5) {
      evidence.push(`Frequently accessed (${memory.accessCount} times)`);
    }

    const m = memory as unknown as Record<string, unknown>;
    const linkedFiles = m['linkedFiles'];
    if (linkedFiles && Array.isArray(linkedFiles) && linkedFiles.length > 0) {
      evidence.push(`Linked to ${linkedFiles.length} file(s)`);
    }

    return evidence;
  }

  private scoreExample(example: string): number {
    let score = 0;

    // Prefer medium length (50-200 chars)
    if (example.length >= 50 && example.length <= 200) {
      score += 10;
    } else if (example.length > 200) {
      score += 5;
    }

    // Prefer code-like content
    if (example.includes('function') || example.includes('const') || example.includes('class')) {
      score += 5;
    }

    // Prefer examples with structure
    if (example.includes('\n')) {
      score += 3;
    }

    return score;
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + '...';
  }
}
