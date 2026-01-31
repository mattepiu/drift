/**
 * Signal Gatherer
 * 
 * Orchestrates gathering of all prediction signals.
 * Coordinates file, temporal, behavioral, and git
 * signal extractors to build complete signal set.
 * 
 * @module prediction/signals/gatherer
 */

import type { PredictionSignals } from '../types.js';
import { FileSignalExtractor, type FileSignalExtractorConfig } from './file-signals.js';
import { TemporalSignalExtractor, type TemporalSignalExtractorConfig } from './temporal-signals.js';
import { BehavioralSignalExtractor, type BehavioralSignalExtractorConfig } from './behavioral-signals.js';
import { GitSignalExtractor, type GitSignalExtractorConfig } from './git-signals.js';

/**
 * Configuration for signal gatherer
 */
export interface SignalGathererConfig {
  /** File signal extractor config */
  file?: Partial<FileSignalExtractorConfig>;
  /** Temporal signal extractor config */
  temporal?: Partial<TemporalSignalExtractorConfig>;
  /** Behavioral signal extractor config */
  behavioral?: Partial<BehavioralSignalExtractorConfig>;
  /** Git signal extractor config */
  git?: Partial<GitSignalExtractorConfig>;
  /** Whether to use git signals */
  useGitSignals: boolean;
  /** Working directory for git */
  workingDirectory?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SignalGathererConfig = {
  useGitSignals: true,
};

/**
 * Signal Gatherer
 * 
 * Orchestrates gathering of all prediction signals.
 */
export class SignalGatherer {
  private config: SignalGathererConfig;
  private fileSignals: FileSignalExtractor;
  private temporalSignals: TemporalSignalExtractor;
  private behavioralSignals: BehavioralSignalExtractor;
  private gitSignals: GitSignalExtractor;

  constructor(config?: Partial<SignalGathererConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.fileSignals = new FileSignalExtractor(this.config.file);
    this.temporalSignals = new TemporalSignalExtractor(this.config.temporal);
    this.behavioralSignals = new BehavioralSignalExtractor(this.config.behavioral);
    this.gitSignals = new GitSignalExtractor(
      this.config.workingDirectory,
      this.config.git
    );
  }

  /**
   * Gather all prediction signals
   */
  async gather(
    activeFile: string,
    recentFiles: string[] = []
  ): Promise<PredictionSignals> {
    // Gather signals from all extractors
    const file = this.fileSignals.extract(activeFile, recentFiles);
    const temporal = this.temporalSignals.extract();
    const behavioral = this.behavioralSignals.extract();

    // Git signals are optional
    let git = this.getDefaultGitSignals();
    if (this.config.useGitSignals && this.gitSignals.isGitRepository()) {
      git = this.gitSignals.extract();
    }

    return {
      file,
      temporal,
      behavioral,
      git,
      gatheredAt: new Date().toISOString(),
    };
  }

  /**
   * Get default git signals when git is not available
   */
  private getDefaultGitSignals(): import('../types.js').GitSignals {
    return {
      currentBranch: 'unknown',
      recentlyModifiedFiles: [] as string[],
      recentCommitMessages: [] as string[],
      uncommittedFiles: [] as string[],
      isFeatureBranch: false,
    };
  }

  /**
   * Record a query for behavioral tracking
   */
  recordQuery(
    query: string,
    intent: import('../types.js').Intent,
    file?: string,
    memoriesUsed: string[] = []
  ): void {
    this.behavioralSignals.recordQuery(query, intent, file, memoriesUsed);
  }

  /**
   * Record memory usage for behavioral tracking
   */
  recordMemoryUsage(memoryId: string, context: string): void {
    this.behavioralSignals.recordMemoryUsage(memoryId, context);
  }

  /**
   * Set current task context
   */
  setCurrentTask(task: string | undefined): void {
    this.behavioralSignals.setCurrentTask(task);
  }

  /**
   * Start a new session
   */
  startSession(): void {
    this.temporalSignals.startSession();
  }

  /**
   * End the current session
   */
  endSession(): void {
    this.temporalSignals.endSession();
  }

  /**
   * Check if session is active
   */
  isSessionActive(): boolean {
    return this.temporalSignals.isSessionActive();
  }

  /**
   * Get file signal extractor for direct access
   */
  getFileSignalExtractor(): FileSignalExtractor {
    return this.fileSignals;
  }

  /**
   * Get temporal signal extractor for direct access
   */
  getTemporalSignalExtractor(): TemporalSignalExtractor {
    return this.temporalSignals;
  }

  /**
   * Get behavioral signal extractor for direct access
   */
  getBehavioralSignalExtractor(): BehavioralSignalExtractor {
    return this.behavioralSignals;
  }

  /**
   * Get git signal extractor for direct access
   */
  getGitSignalExtractor(): GitSignalExtractor {
    return this.gitSignals;
  }

  /**
   * Set working directory for git
   */
  setWorkingDirectory(dir: string): void {
    this.gitSignals.setWorkingDirectory(dir);
  }

  /**
   * Clear all behavioral data
   */
  clearBehavioralData(): void {
    this.behavioralSignals.clear();
  }

  /**
   * Export state for persistence
   */
  export(): {
    behavioral: ReturnType<BehavioralSignalExtractor['export']>;
  } {
    return {
      behavioral: this.behavioralSignals.export(),
    };
  }

  /**
   * Import state from persistence
   */
  import(state: {
    behavioral?: Parameters<BehavioralSignalExtractor['import']>[0];
  }): void {
    if (state.behavioral) {
      this.behavioralSignals.import(state.behavioral);
    }
  }
}
