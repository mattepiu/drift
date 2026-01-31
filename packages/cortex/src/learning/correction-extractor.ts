/**
 * Correction Extractor
 * 
 * Extracts corrections from rejected/modified interactions
 * and prepares them for analysis.
 * 
 * @module learning/correction-extractor
 */

import type { EpisodicMemory } from '../types/index.js';
import type { CorrectionMetadata } from '../types/learning.js';

/**
 * Extracted correction
 */
export interface ExtractedCorrection {
  /** Original code/content */
  original: string;
  /** User's feedback */
  feedback: string;
  /** Corrected code if available */
  correctedCode?: string;
  /** Confidence in extraction */
  confidence: number;
  /** Metadata about the correction */
  metadata?: CorrectionMetadata;
}

/**
 * Extraction options
 */
export interface ExtractionOptions {
  /** Minimum confidence to include */
  minConfidence?: number;
  /** Include only rejected episodes */
  rejectedOnly?: boolean;
  /** Include modified episodes */
  includeModified?: boolean;
  /** Maximum corrections to extract */
  limit?: number;
}

/**
 * Default extraction options
 */
const DEFAULT_OPTIONS: ExtractionOptions = {
  minConfidence: 0.5,
  rejectedOnly: false,
  includeModified: true,
  limit: 100,
};

/**
 * Correction Extractor
 * 
 * Extracts corrections from episodic memories for analysis
 * by the learning system.
 */
export class CorrectionExtractor {
  /**
   * Extract corrections from episodes
   */
  extract(
    episodes: EpisodicMemory[],
    options: ExtractionOptions = {}
  ): ExtractedCorrection[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const corrections: ExtractedCorrection[] = [];

    for (const episode of episodes) {
      // Filter by outcome
      if (opts.rejectedOnly && episode.interaction.outcome !== 'rejected') {
        continue;
      }

      if (
        !opts.includeModified &&
        episode.interaction.outcome === 'modified'
      ) {
        continue;
      }

      // Only process rejected or modified episodes
      if (
        episode.interaction.outcome !== 'rejected' &&
        episode.interaction.outcome !== 'modified'
      ) {
        continue;
      }

      // Extract correction
      const correction = this.extractFromEpisode(episode);

      // Filter by confidence
      if (correction.confidence >= (opts.minConfidence || 0)) {
        corrections.push(correction);
      }

      // Check limit
      if (corrections.length >= (opts.limit || 100)) {
        break;
      }
    }

    return corrections;
  }

  /**
   * Extract a single correction from an episode
   */
  extractFromEpisode(episode: EpisodicMemory): ExtractedCorrection {
    const original = this.extractOriginal(episode);
    const feedback = this.extractFeedback(episode);
    const correctedCode = this.extractCorrectedCode(episode);
    const confidence = this.calculateConfidence(episode);
    const metadata = this.extractMetadata(episode);

    const result: ExtractedCorrection = {
      original,
      feedback,
      confidence,
    };

    // Add optional properties only if they have values
    if (correctedCode) {
      result.correctedCode = correctedCode;
    }
    if (metadata.filePath || metadata.sessionId || metadata.relatedPatterns || metadata.relatedConstraints) {
      result.metadata = metadata;
    }

    return result;
  }

  /**
   * Extract original content from episode
   */
  private extractOriginal(episode: EpisodicMemory): string {
    // Use agent response as original
    return episode.interaction.agentResponse;
  }

  /**
   * Extract feedback from episode
   */
  private extractFeedback(episode: EpisodicMemory): string {
    // Build feedback from various sources
    const parts: string[] = [];

    // Add outcome-based feedback
    if (episode.interaction.outcome === 'rejected') {
      parts.push('User rejected this response.');
    } else if (episode.interaction.outcome === 'modified') {
      parts.push('User modified this response.');
    }

    // Add context focus
    if (episode.context.focus) {
      parts.push(`Focus area: ${episode.context.focus}`);
    }

    // Add extracted facts
    if (episode.extractedFacts?.length) {
      for (const fact of episode.extractedFacts) {
        if (fact.type === 'correction' || fact.type === 'warning') {
          parts.push(fact.fact);
        }
      }
    }

    // Add user query for context
    if (episode.interaction.userQuery) {
      parts.push(`Original query: ${episode.interaction.userQuery}`);
    }

    return parts.join('\n');
  }

  /**
   * Extract corrected code from episode
   */
  private extractCorrectedCode(episode: EpisodicMemory): string | undefined {
    // Look for corrected code in extracted facts
    if (episode.extractedFacts?.length) {
      for (const fact of episode.extractedFacts) {
        if (fact.type === 'correction' && fact.fact.includes('```')) {
          // Extract code block
          const codeMatch = fact.fact.match(/```[\s\S]*?```/);
          if (codeMatch) {
            return codeMatch[0].replace(/```\w*\n?/g, '').trim();
          }
        }
      }
    }

    // No corrected code available
    return undefined;
  }

  /**
   * Calculate confidence in the extraction
   */
  private calculateConfidence(episode: EpisodicMemory): number {
    let confidence = 0.5;

    // Higher confidence for explicit rejections
    if (episode.interaction.outcome === 'rejected') {
      confidence += 0.2;
    }

    // Higher confidence if we have extracted facts
    if (episode.extractedFacts?.length) {
      confidence += 0.1;
    }

    // Higher confidence if we have context
    if (episode.context.focus) {
      confidence += 0.1;
    }

    // Higher confidence for longer responses (more context)
    if (episode.interaction.agentResponse.length > 200) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Extract metadata from episode
   */
  private extractMetadata(episode: EpisodicMemory): CorrectionMetadata {
    const metadata: CorrectionMetadata = {
      sessionId: episode.id,
    };
    
    if (episode.linkedFiles?.[0]) {
      metadata.filePath = episode.linkedFiles[0];
    }
    if (episode.linkedPatterns) {
      metadata.relatedPatterns = episode.linkedPatterns;
    }
    if (episode.linkedConstraints) {
      metadata.relatedConstraints = episode.linkedConstraints;
    }
    
    return metadata;
  }

  /**
   * Extract corrections from a batch of episodes grouped by focus
   */
  extractByFocus(
    episodes: EpisodicMemory[]
  ): Map<string, ExtractedCorrection[]> {
    const byFocus = new Map<string, ExtractedCorrection[]>();

    const corrections = this.extract(episodes);

    for (const correction of corrections) {
      const focus = correction.metadata?.filePath || 'unknown';
      const existing = byFocus.get(focus) || [];
      existing.push(correction);
      byFocus.set(focus, existing);
    }

    return byFocus;
  }

  /**
   * Get correction statistics
   */
  getStats(episodes: EpisodicMemory[]): {
    total: number;
    rejected: number;
    modified: number;
    withCorrectedCode: number;
    averageConfidence: number;
  } {
    const corrections = this.extract(episodes, { minConfidence: 0 });

    const rejected = corrections.filter(c =>
      c.feedback.includes('rejected')
    ).length;

    const modified = corrections.filter(c =>
      c.feedback.includes('modified')
    ).length;

    const withCorrectedCode = corrections.filter(c =>
      c.correctedCode !== undefined
    ).length;

    const totalConfidence = corrections.reduce(
      (sum, c) => sum + c.confidence,
      0
    );

    return {
      total: corrections.length,
      rejected,
      modified,
      withCorrectedCode,
      averageConfidence:
        corrections.length > 0 ? totalConfidence / corrections.length : 0,
    };
  }
}
