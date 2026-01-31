/**
 * Level 3 Compressor
 * 
 * Full context compression (variable tokens).
 * Includes complete knowledge, all examples, evidence,
 * related memories, and causal chains.
 * 
 * @module compression/compressor/level-3
 */

import type {
  Level3Output,
  CodeSnippet,
  Evidence,
} from '../../types/compressed-memory.js';
import type { Memory } from '../../types/memory.js';
import { Level2Compressor } from './level-2.js';

/**
 * Level 3 Compressor
 * 
 * Produces full output containing:
 * - Level 2 fields
 * - Complete knowledge
 * - All examples
 * - All evidence
 * - Related memory IDs
 * - Causal chain summary
 * - Linked entities
 */
export class Level3Compressor {
  /** Target tokens for level 3 (minimum) */
  private readonly TARGET_TOKENS = 500;
  /** Maximum tokens for level 3 */
  private readonly MAX_TOKENS = 1000;

  private level2Compressor: Level2Compressor;

  constructor() {
    this.level2Compressor = new Level2Compressor();
  }

  /**
   * Compress a memory to level 3
   */
  compress(memory: Memory): Level3Output {
    const level2 = this.level2Compressor.compress(memory);
    const fullContext = this.extractFullContext(memory);

    return {
      ...level2,
      full: fullContext,
      tokens: this.estimateTokens(level2.tokens, fullContext),
    };
  }

  /**
   * Compress multiple memories to level 3
   */
  compressBatch(memories: Memory[]): Level3Output[] {
    return memories.map(m => this.compress(m));
  }

  /**
   * Extract full context from memory
   */
  extractFullContext(memory: Memory): Level3Output['full'] {
    const m = memory as unknown as Record<string, unknown>;

    const full: Level3Output['full'] = {
      completeKnowledge: this.extractCompleteKnowledge(memory),
      allExamples: this.extractAllExamples(memory),
      allEvidence: this.extractAllEvidence(memory),
      relatedMemories: this.extractRelatedMemories(memory),
      causalChain: this.extractCausalChain(memory),
    };

    // Add optional linked entities
    const linkedPatterns = m['linkedPatterns'];
    if (linkedPatterns && Array.isArray(linkedPatterns)) {
      full.linkedPatterns = linkedPatterns as string[];
    }
    
    const linkedConstraints = m['linkedConstraints'];
    if (linkedConstraints && Array.isArray(linkedConstraints)) {
      full.linkedConstraints = linkedConstraints as string[];
    }
    
    const linkedFiles = m['linkedFiles'];
    if (linkedFiles && Array.isArray(linkedFiles)) {
      full.linkedFiles = linkedFiles as string[];
    }
    
    const linkedFunctions = m['linkedFunctions'];
    if (linkedFunctions && Array.isArray(linkedFunctions)) {
      full.linkedFunctions = linkedFunctions as string[];
    }

    return full;
  }

  /**
   * Estimate token count for level 3 output
   */
  estimateTokens(
    level2Tokens: number,
    fullContext: Level3Output['full']
  ): number {
    let tokens = level2Tokens;

    // Complete knowledge
    tokens += Math.ceil(fullContext.completeKnowledge.length / 4);

    // All examples
    for (const ex of fullContext.allExamples) {
      tokens += Math.ceil(ex.code.length / 4);
      if (ex.description) tokens += Math.ceil(ex.description.length / 4);
    }

    // All evidence
    for (const ev of fullContext.allEvidence) {
      tokens += Math.ceil(ev.content.length / 4);
    }

    // Related memories (IDs)
    tokens += fullContext.relatedMemories.length * 2;

    // Causal chain
    for (const step of fullContext.causalChain) {
      tokens += Math.ceil(step.length / 4);
    }

    // Linked entities
    if (fullContext.linkedPatterns) {
      tokens += fullContext.linkedPatterns.length * 2;
    }
    if (fullContext.linkedConstraints) {
      tokens += fullContext.linkedConstraints.length * 2;
    }
    if (fullContext.linkedFiles) {
      tokens += fullContext.linkedFiles.length * 3;
    }
    if (fullContext.linkedFunctions) {
      tokens += fullContext.linkedFunctions.length * 3;
    }

    return Math.max(this.TARGET_TOKENS, Math.min(tokens, this.MAX_TOKENS));
  }

  /**
   * Get target token count for this level
   */
  getTargetTokens(): number {
    return this.TARGET_TOKENS;
  }

  /**
   * Get maximum token count for this level
   */
  getMaxTokens(): number {
    return this.MAX_TOKENS;
  }

  /**
   * Format level 3 output as string
   */
  format(output: Level3Output): string {
    const parts: string[] = [
      `=== ${output.type.toUpperCase()} MEMORY ===`,
      `ID: ${output.id}`,
      `Importance: ${output.importance}`,
      `Confidence: ${output.confidence.toFixed(2)}`,
      `Tags: ${output.tags.join(', ')}`,
      '',
      '--- Summary ---',
      output.oneLiner,
      '',
      '--- Knowledge ---',
      output.full.completeKnowledge,
    ];

    if (output.full.allExamples.length > 0) {
      parts.push('', '--- Examples ---');
      for (const ex of output.full.allExamples) {
        if (ex.description) {
          parts.push(`// ${ex.description}`);
        }
        parts.push(ex.code);
        parts.push('');
      }
    }

    if (output.full.allEvidence.length > 0) {
      parts.push('--- Evidence ---');
      for (const ev of output.full.allEvidence) {
        parts.push(`[${ev.type}] ${ev.content}`);
      }
    }

    if (output.full.causalChain.length > 0) {
      parts.push('', '--- Causal Chain ---');
      parts.push(output.full.causalChain.join(' → '));
    }

    if (output.full.relatedMemories.length > 0) {
      parts.push('', `Related: ${output.full.relatedMemories.join(', ')}`);
    }

    return parts.join('\n');
  }

  // Private helper methods

  private extractCompleteKnowledge(memory: Memory): string {
    const m = memory as unknown as Record<string, unknown>;
    const parts: string[] = [];

    // Gather all knowledge-related fields
    const knowledgeFields = [
      'knowledge',
      'content',
      'rationale',
      'explanation',
      'description',
      'statement',
      'reason',
    ];

    for (const field of knowledgeFields) {
      const value = m[field];
      if (value && typeof value === 'string') {
        parts.push(value);
      }
    }

    // Add summary if not already included
    if (memory.summary && !parts.includes(memory.summary)) {
      parts.unshift(memory.summary);
    }

    return parts.join('\n\n');
  }

  private extractAllExamples(memory: Memory): CodeSnippet[] {
    const m = memory as unknown as Record<string, unknown>;
    const examples: CodeSnippet[] = [];

    // Check examples array
    const examplesArr = m['examples'];
    if (examplesArr && Array.isArray(examplesArr)) {
      for (const ex of examplesArr) {
        const snippet = this.toCodeSnippet(ex);
        if (snippet) examples.push(snippet);
      }
    }

    // Check individual example fields
    const exampleFields = [
      'example',
      'correctExample',
      'exampleGood',
      'exampleBad',
      'incorrectExample',
    ];

    for (const field of exampleFields) {
      const value = m[field];
      if (value) {
        const snippet = this.toCodeSnippet(value, field);
        if (snippet) examples.push(snippet);
      }
    }

    return examples;
  }

  private extractAllEvidence(memory: Memory): Evidence[] {
    const m = memory as unknown as Record<string, unknown>;
    const evidence: Evidence[] = [];

    // Check evidence array
    const evidenceArr = m['evidence'];
    if (evidenceArr && Array.isArray(evidenceArr)) {
      for (const ev of evidenceArr) {
        const item = this.toEvidence(ev);
        if (item) evidence.push(item);
      }
    }

    // Check source
    const source = m['source'];
    if (source && typeof source === 'object') {
      const sourceObj = source as Record<string, unknown>;
      const reference = sourceObj['reference'];
      const sourceType = sourceObj['type'];
      const evidenceItem: Evidence = {
        type: 'user',
        content: String(reference || sourceType || 'User provided'),
      };
      if (typeof reference === 'string') {
        evidenceItem.reference = reference;
      }
      evidence.push(evidenceItem);
    }

    // Add metadata-based evidence
    if (memory.confidence >= 0.9) {
      evidence.push({
        type: 'user',
        content: `Very high confidence (${(memory.confidence * 100).toFixed(0)}%)`,
      });
    }

    if (memory.accessCount && memory.accessCount > 10) {
      evidence.push({
        type: 'user',
        content: `Heavily used (${memory.accessCount} accesses)`,
      });
    }

    return evidence;
  }

  private extractRelatedMemories(memory: Memory): string[] {
    const m = memory as unknown as Record<string, unknown>;
    const related: string[] = [];

    // Check various relationship fields
    const relationFields = [
      'relatedMemories',
      'relatedIds',
      'linkedMemories',
      'supersedes',
      'supersededBy',
    ];

    for (const field of relationFields) {
      const value = m[field];
      if (value && Array.isArray(value)) {
        for (const id of value) {
          if (typeof id === 'string' && !related.includes(id)) {
            related.push(id);
          }
        }
      }
    }

    return related;
  }

  private extractCausalChain(memory: Memory): string[] {
    const m = memory as unknown as Record<string, unknown>;
    const chain: string[] = [];

    // Check for explicit causal chain
    const causalChain = m['causalChain'];
    if (causalChain && Array.isArray(causalChain)) {
      return causalChain as string[];
    }

    // Generate from context
    const cause = m['cause'];
    if (cause && typeof cause === 'string') {
      chain.push(`Cause: ${cause}`);
    }

    chain.push(`Memory: ${memory.summary || memory.type}`);

    const effect = m['effect'];
    if (effect && typeof effect === 'string') {
      chain.push(`Effect: ${effect}`);
    }

    return chain.length > 1 ? chain : [];
  }

  private toCodeSnippet(
    value: unknown,
    fieldName?: string
  ): CodeSnippet | null {
    if (typeof value === 'string') {
      const snippet: CodeSnippet = { code: value };
      if (fieldName) {
        snippet.description = this.fieldToDescription(fieldName);
      }
      return snippet;
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const code = obj['code'];
      if (code && typeof code === 'string') {
        const snippet: CodeSnippet = { code };
        
        const language = obj['language'];
        if (language && typeof language === 'string') {
          snippet.language = language;
        }
        
        const filePath = obj['filePath'];
        if (filePath && typeof filePath === 'string') {
          snippet.filePath = filePath;
        }
        
        const lineStart = obj['lineStart'];
        if (typeof lineStart === 'number') {
          snippet.lineStart = lineStart;
        }
        
        const lineEnd = obj['lineEnd'];
        if (typeof lineEnd === 'number') {
          snippet.lineEnd = lineEnd;
        }
        
        const description = obj['description'];
        if (description && typeof description === 'string') {
          snippet.description = description;
        }
        
        return snippet;
      }
    }

    return null;
  }

  private toEvidence(value: unknown): Evidence | null {
    if (typeof value === 'string') {
      return {
        type: 'user',
        content: value,
      };
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const content = obj['content'] || obj['description'];
      
      const evidence: Evidence = {
        type: (obj['type'] as Evidence['type']) || 'user',
        content: String(content || ''),
      };
      
      const reference = obj['reference'];
      if (reference && typeof reference === 'string') {
        evidence.reference = reference;
      }
      
      const gatheredAt = obj['gatheredAt'];
      if (gatheredAt && typeof gatheredAt === 'string') {
        evidence.gatheredAt = gatheredAt;
      }
      
      return evidence;
    }

    return null;
  }

  private fieldToDescription(fieldName: string): string {
    const descriptions: Record<string, string> = {
      example: 'Example usage',
      correctExample: 'Correct approach',
      exampleGood: 'Good example',
      exampleBad: 'Anti-pattern to avoid',
      incorrectExample: 'Incorrect approach',
    };
    return descriptions[fieldName] || fieldName;
  }
}
