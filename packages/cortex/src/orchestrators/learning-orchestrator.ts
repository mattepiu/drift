/**
 * Learning Orchestrator
 * 
 * Orchestrates learning from feedback and corrections.
 * Coordinates analysis, calibration, and memory creation.
 * 
 * @module orchestrators/learning-orchestrator
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory } from '../types/index.js';
import type {
  AnalyzedCorrection,
  CorrectionCategory,
  ExtractedPrinciple,
  ConfidenceMetrics,
  ValidationCandidate,
  CalculatedConfidence,
  SuggestedMemoryType,
} from '../types/learning.js';
import type { CausalInferenceEngine } from '../causal/inference/engine.js';
import type { ICausalStorage } from '../causal/storage/interface.js';
import type { CreateCausalEdgeRequest } from '../types/causal.js';
import { randomUUID } from 'crypto';

/**
 * Learning result
 */
export interface LearnResult {
  /** Whether learning was successful */
  success: boolean;
  /** Created memory IDs */
  createdMemories: string[];
  /** Extracted principles */
  principles: ExtractedPrinciple[];
  /** Correction category */
  category: CorrectionCategory;
  /** Inferred causal edges */
  causalEdges: string[];
  /** Analysis details */
  analysis: AnalyzedCorrection;
}

/**
 * Feedback type
 */
export type FeedbackType = 'confirmed' | 'rejected' | 'modified';

/**
 * Feedback processing result
 */
export interface FeedbackResult {
  /** Whether processing was successful */
  success: boolean;
  /** Updated confidence */
  newConfidence: number;
  /** Previous confidence */
  previousConfidence: number;
  /** Whether memory was updated */
  memoryUpdated: boolean;
}

/**
 * Confidence calibrator interface
 */
interface IConfidenceCalibrator {
  calculate(metrics: ConfidenceMetrics): CalculatedConfidence;
}

/**
 * Active learning loop interface
 */
interface IActiveLearningLoop {
  identifyValidationCandidates(limit: number): Promise<ValidationCandidate[]>;
}

/**
 * Learning memory factory interface
 */
interface ILearningMemoryFactory {
  createFromCorrection(analysis: AnalyzedCorrection): Promise<Memory[]>;
}

/**
 * Decay integrator interface
 */
interface IDecayIntegrator {
  calculateDecayedConfidence(memory: Memory): number;
}

/**
 * Learning Orchestrator
 * 
 * Coordinates the learning system components:
 * - Correction analysis and categorization
 * - Principle extraction
 * - Confidence calibration
 * - Memory creation
 * - Causal inference
 */
export class LearningOrchestrator {
  private storage: IMemoryStorage;
  private calibrator: IConfidenceCalibrator | null;
  private decayIntegrator: IDecayIntegrator | null;
  private activeLoop: IActiveLearningLoop | null;
  private memoryFactory: ILearningMemoryFactory | null;
  private causalInference: CausalInferenceEngine | null;
  private causalStorage: ICausalStorage | null;

  constructor(
    storage: IMemoryStorage,
    options?: {
      calibrator?: IConfidenceCalibrator;
      decayIntegrator?: IDecayIntegrator;
      activeLoop?: IActiveLearningLoop;
      memoryFactory?: ILearningMemoryFactory;
      causalInference?: CausalInferenceEngine;
      causalStorage?: ICausalStorage;
    }
  ) {
    this.storage = storage;
    this.calibrator = options?.calibrator ?? null;
    this.decayIntegrator = options?.decayIntegrator ?? null;
    this.activeLoop = options?.activeLoop ?? null;
    this.memoryFactory = options?.memoryFactory ?? null;
    this.causalInference = options?.causalInference ?? null;
    this.causalStorage = options?.causalStorage ?? null;
  }

  /**
   * Learn from a correction
   */
  async learnFromCorrection(
    original: string,
    feedback: string,
    correctedCode?: string,
    context?: {
      activeFile?: string;
      intent?: string;
      relatedMemoryIds?: string[];
    }
  ): Promise<LearnResult> {
    // Step 1: Analyze the correction
    const analysis = this.analyzeCorrection(original, feedback, correctedCode);

    // Step 2: Create memories from the correction
    const createdMemories = await this.createMemoriesFromCorrection(
      analysis,
      context
    );

    // Step 3: Infer causal relationships
    const causalEdges = await this.inferCausalRelationships(
      createdMemories,
      context?.relatedMemoryIds
    );

    return {
      success: true,
      createdMemories,
      principles: [analysis.principle],
      category: analysis.category,
      causalEdges,
      analysis,
    };
  }

  /**
   * Process feedback on a memory
   */
  async processFeedback(
    memoryId: string,
    feedback: FeedbackType,
    _details?: string
  ): Promise<FeedbackResult> {
    // Get the memory
    const memory = await this.storage.read(memoryId);
    if (!memory) {
      return {
        success: false,
        newConfidence: 0,
        previousConfidence: 0,
        memoryUpdated: false,
      };
    }

    const previousConfidence = memory.confidence;

    // Calculate new confidence based on feedback
    let newConfidence: number;
    if (this.calibrator) {
      const metrics: ConfidenceMetrics = {
        baseConfidence: memory.confidence,
        supportingEvidenceCount: memory.accessCount + 1,
        contradictingEvidenceCount: feedback === 'rejected' ? 1 : 0,
        successfulUses: feedback === 'confirmed' ? 1 : 0,
        rejectedUses: feedback === 'rejected' ? 1 : 0,
        ageInDays: this.calculateAgeInDays(memory.createdAt),
        userConfirmations: feedback === 'confirmed' ? 1 : 0,
        userRejections: feedback === 'rejected' ? 1 : 0,
      };
      const result = this.calibrator.calculate(metrics);
      newConfidence = result.confidence;
    } else {
      // Simple confidence adjustment
      switch (feedback) {
        case 'confirmed':
          newConfidence = Math.min(1.0, previousConfidence + 0.1);
          break;
        case 'rejected':
          newConfidence = Math.max(0.1, previousConfidence - 0.2);
          break;
        case 'modified':
          newConfidence = Math.max(0.3, previousConfidence - 0.1);
          break;
        default:
          newConfidence = previousConfidence;
      }
    }

    // Update the memory
    await this.storage.update(memoryId, {
      confidence: newConfidence,
      lastAccessed: new Date().toISOString(),
      accessCount: memory.accessCount + 1,
    });

    return {
      success: true,
      newConfidence,
      previousConfidence,
      memoryUpdated: true,
    };
  }

  /**
   * Get memories that need validation
   */
  async getValidationCandidates(limit: number = 10): Promise<ValidationCandidate[]> {
    if (this.activeLoop) {
      return this.activeLoop.identifyValidationCandidates(limit);
    }

    // Fallback: find low-confidence memories
    const allMemories = await this.storage.search({ limit: 100 });
    const candidates: ValidationCandidate[] = [];

    for (const memory of allMemories) {
      if (memory.confidence < 0.5) {
        candidates.push({
          memoryId: memory.id,
          memoryType: memory.type,
          summary: memory.summary,
          currentConfidence: memory.confidence,
          reason: 'low_confidence',
          priority: 1 - memory.confidence,
          suggestedPrompt: `Is this still accurate? "${memory.summary}"`,
        });
      }
    }

    return candidates
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  /**
   * Apply decay to all memories
   */
  async applyDecay(): Promise<{ updated: number; decayed: number }> {
    if (!this.decayIntegrator) {
      return { updated: 0, decayed: 0 };
    }

    const allMemories = await this.storage.search({ limit: 1000 });
    let updated = 0;
    let decayed = 0;

    for (const memory of allMemories) {
      const newConfidence = this.decayIntegrator.calculateDecayedConfidence(memory);
      
      if (newConfidence !== memory.confidence) {
        await this.storage.update(memory.id, { confidence: newConfidence });
        updated++;
        
        if (newConfidence < memory.confidence) {
          decayed++;
        }
      }
    }

    return { updated, decayed };
  }

  // Private helper methods

  private analyzeCorrection(
    original: string,
    feedback: string,
    correctedCode?: string
  ): AnalyzedCorrection {
    const category = this.inferCategory(feedback);
    const principle = this.extractPrinciple(feedback, category);
    
    const result: AnalyzedCorrection = {
      id: randomUUID(),
      original,
      feedback,
      category,
      categoryConfidence: 0.7,
      principle,
      suggestedMemoryType: this.categoryToMemoryType(category),
      relatedMemories: [],
      analyzedAt: new Date().toISOString(),
    };

    if (correctedCode !== undefined) {
      result.correctedCode = correctedCode;
    }

    return result;
  }

  private extractPrinciple(feedback: string, category: CorrectionCategory): ExtractedPrinciple {
    return {
      statement: `Avoid: ${feedback.slice(0, 100)}`,
      explanation: feedback,
      scope: { projectWide: true },
      confidence: 0.7,
      keywords: this.extractKeywords(feedback),
      isHardRule: category === 'security_issue',
    };
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5);
  }

  private async createMemoriesFromCorrection(
    analysis: AnalyzedCorrection,
    context?: {
      activeFile?: string;
      intent?: string;
      relatedMemoryIds?: string[];
    }
  ): Promise<string[]> {
    const createdIds: string[] = [];

    if (this.memoryFactory) {
      const memories = await this.memoryFactory.createFromCorrection(analysis);
      for (const memory of memories) {
        const id = await this.storage.create(memory);
        createdIds.push(id);

        // Link to file if provided
        if (context?.activeFile) {
          await this.storage.linkToFile(id, context.activeFile);
        }
      }
    } else {
      // Fallback: create a tribal memory
      const memoryType = analysis.suggestedMemoryType;
      const memory: Partial<Memory> = {
        type: memoryType,
        summary: `Learned: ${analysis.feedback.slice(0, 100)}`,
        confidence: analysis.categoryConfidence,
        importance: this.categoryToImportance(analysis.category),
        tags: [analysis.category, 'learned'],
      };

      const id = await this.storage.create(memory as Memory);
      createdIds.push(id);

      if (context?.activeFile) {
        await this.storage.linkToFile(id, context.activeFile);
      }
    }

    return createdIds;
  }

  private async inferCausalRelationships(
    createdMemoryIds: string[],
    relatedMemoryIds?: string[]
  ): Promise<string[]> {
    if (!this.causalInference || !this.causalStorage) {
      return [];
    }

    const edgeIds: string[] = [];

    for (const memoryId of createdMemoryIds) {
      const memory = await this.storage.read(memoryId);
      if (!memory) continue;

      // Infer causes from related memories
      if (relatedMemoryIds) {
        for (const relatedId of relatedMemoryIds) {
          const edgeRequest: CreateCausalEdgeRequest = {
            sourceId: relatedId,
            targetId: memoryId,
            relation: 'triggered_by',
            strength: 0.7,
            evidence: [{ 
              type: 'explicit', 
              description: 'Correction context',
              confidence: 0.7,
              gatheredAt: new Date().toISOString(),
            }],
            createdBy: 'learning_orchestrator',
          };
          
          const edgeId = await this.causalStorage.createEdge(edgeRequest);
          edgeIds.push(edgeId);
        }
      }

      // Use inference engine for additional relationships
      const inferenceResult = await this.causalInference.inferCauses(memory);
      for (const edge of inferenceResult.inferredEdges) {
        const edgeRequest: CreateCausalEdgeRequest = {
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          relation: edge.relation,
          strength: edge.strength,
          evidence: edge.evidence,
          inferred: true,
          createdBy: 'causal_inference',
        };
        const edgeId = await this.causalStorage.createEdge(edgeRequest);
        edgeIds.push(edgeId);
      }
    }

    return edgeIds;
  }

  private inferCategory(feedback: string): CorrectionCategory {
    const lower = feedback.toLowerCase();
    
    if (lower.includes('style') || lower.includes('format')) {
      return 'style_preference';
    }
    if (lower.includes('pattern') || lower.includes('convention')) {
      return 'pattern_violation';
    }
    if (lower.includes('security') || lower.includes('vulnerability')) {
      return 'security_issue';
    }
    if (lower.includes('performance') || lower.includes('slow')) {
      return 'performance_issue';
    }
    if (lower.includes('api') || lower.includes('deprecated')) {
      return 'api_misuse';
    }
    if (lower.includes('naming') || lower.includes('name')) {
      return 'naming_convention';
    }
    if (lower.includes('architecture') || lower.includes('structure')) {
      return 'architecture_mismatch';
    }
    if (lower.includes('tribal') || lower.includes('team')) {
      return 'tribal_miss';
    }
    if (lower.includes('constraint')) {
      return 'constraint_violation';
    }
    
    return 'other';
  }

  private categoryToMemoryType(category: CorrectionCategory): SuggestedMemoryType {
    switch (category) {
      case 'pattern_violation':
        return 'pattern_rationale';
      case 'security_issue':
      case 'performance_issue':
      case 'api_misuse':
        return 'code_smell';
      case 'constraint_violation':
        return 'constraint_override';
      default:
        return 'tribal';
    }
  }

  private categoryToImportance(category: CorrectionCategory): 'low' | 'normal' | 'high' | 'critical' {
    switch (category) {
      case 'security_issue':
        return 'critical';
      case 'pattern_violation':
      case 'architecture_mismatch':
        return 'high';
      case 'performance_issue':
      case 'api_misuse':
        return 'normal';
      default:
        return 'low';
    }
  }

  private calculateAgeInDays(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
