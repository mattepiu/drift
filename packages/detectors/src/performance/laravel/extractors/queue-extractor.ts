/**
 * Laravel Queue Extractor
 *
 * Extracts queue and job patterns from Laravel code.
 *
 * @module performance/laravel/extractors/queue-extractor
 */

import type { QueueUsageInfo } from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Job class definition
 */
const JOB_CLASS_PATTERN = /class\s+(\w+)\s+implements\s+ShouldQueue/g;

/**
 * Dispatch helper
 */
const DISPATCH_HELPER_PATTERN = /dispatch\s*\(\s*new\s+(\w+)/g;

/**
 * Static dispatch
 */
const STATIC_DISPATCH_PATTERN = /(\w+)::dispatch\s*\(/g;

// Note: These patterns are defined for future use in delay detection
// const DISPATCH_DELAY_PATTERN = /->delay\s*\(\s*(?:now\s*\(\s*\)\s*->add\w+\s*\(\s*(\d+)|Carbon::now\s*\(\s*\)\s*->add\w+\s*\(\s*(\d+))/g;

/**
 * Queue facade push
 */
const QUEUE_PUSH_PATTERN = /Queue::push\s*\(\s*(?:new\s+)?(\w+)/g;

/**
 * Queue facade later
 */
const QUEUE_LATER_PATTERN = /Queue::later\s*\(\s*(\d+)\s*,\s*(?:new\s+)?(\w+)/g;

/**
 * Job chain
 */
const JOB_CHAIN_PATTERN = /Bus::chain\s*\(\s*\[/g;

/**
 * Job batch
 */
const JOB_BATCH_PATTERN = /Bus::batch\s*\(\s*\[/g;

// Note: These patterns are used internally in extractQueueName
// const ON_QUEUE_PATTERN = /->onQueue\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
// const ON_CONNECTION_PATTERN = /->onConnection\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * ShouldBeUnique interface
 */
const UNIQUE_JOB_PATTERN = /implements\s+[^{]*ShouldBeUnique/g;

// Note: Defined for future use in job middleware detection
// const WITHOUT_OVERLAPPING_PATTERN = /WithoutOverlapping/g;

// ============================================================================
// Extended Types
// ============================================================================

/**
 * Job definition info
 */
export interface JobDefinitionInfo {
  /** Job class name */
  name: string;
  /** Whether it's unique */
  isUnique: boolean;
  /** Queue name */
  queue: string | null;
  /** Connection */
  connection: string | null;
  /** Retry settings */
  tries: number | null;
  /** Timeout */
  timeout: number | null;
  /** File path */
  file: string;
  /** Line number */
  line: number;
}

/**
 * Queue extraction result
 */
export interface QueueExtractionResult {
  /** Queue usages */
  usages: QueueUsageInfo[];
  /** Job definitions */
  jobs: JobDefinitionInfo[];
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Queue Extractor
// ============================================================================

/**
 * Extracts queue and job patterns from Laravel code
 */
export class QueueExtractor {
  /**
   * Extract all queue patterns from content
   */
  extract(content: string, file: string): QueueExtractionResult {
    const usages = this.extractUsages(content, file);
    const jobs = this.extractJobDefinitions(content, file);
    const confidence = usages.length > 0 || jobs.length > 0 ? 0.9 : 0;

    return {
      usages,
      jobs,
      confidence,
    };
  }

  /**
   * Check if content contains queue patterns
   */
  hasQueuePatterns(content: string): boolean {
    return (
      content.includes('ShouldQueue') ||
      content.includes('dispatch(') ||
      content.includes('::dispatch(') ||
      content.includes('Queue::')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract queue usages
   */
  private extractUsages(content: string, file: string): QueueUsageInfo[] {
    const usages: QueueUsageInfo[] = [];

    // Dispatch helper
    DISPATCH_HELPER_PATTERN.lastIndex = 0;
    let match;
    while ((match = DISPATCH_HELPER_PATTERN.exec(content)) !== null) {
      const job = match[1] || null;
      const line = this.getLineNumber(content, match.index);
      const queue = this.extractQueueName(content, match.index);

      usages.push({
        type: 'dispatch',
        job,
        queue,
        delay: null,
        file,
        line,
      });
    }

    // Static dispatch
    STATIC_DISPATCH_PATTERN.lastIndex = 0;
    while ((match = STATIC_DISPATCH_PATTERN.exec(content)) !== null) {
      const job = match[1] || null;
      const line = this.getLineNumber(content, match.index);
      const queue = this.extractQueueName(content, match.index);

      usages.push({
        type: 'dispatch',
        job,
        queue,
        delay: null,
        file,
        line,
      });
    }

    // Queue::push
    QUEUE_PUSH_PATTERN.lastIndex = 0;
    while ((match = QUEUE_PUSH_PATTERN.exec(content)) !== null) {
      const job = match[1] || null;
      const line = this.getLineNumber(content, match.index);

      usages.push({
        type: 'push',
        job,
        queue: null,
        delay: null,
        file,
        line,
      });
    }

    // Queue::later
    QUEUE_LATER_PATTERN.lastIndex = 0;
    while ((match = QUEUE_LATER_PATTERN.exec(content)) !== null) {
      const delay = parseInt(match[1] || '0', 10);
      const job = match[2] || null;
      const line = this.getLineNumber(content, match.index);

      usages.push({
        type: 'later',
        job,
        queue: null,
        delay,
        file,
        line,
      });
    }

    // Bus::chain
    JOB_CHAIN_PATTERN.lastIndex = 0;
    while ((match = JOB_CHAIN_PATTERN.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);

      usages.push({
        type: 'chain',
        job: null,
        queue: null,
        delay: null,
        file,
        line,
      });
    }

    // Bus::batch
    JOB_BATCH_PATTERN.lastIndex = 0;
    while ((match = JOB_BATCH_PATTERN.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);

      usages.push({
        type: 'batch',
        job: null,
        queue: null,
        delay: null,
        file,
        line,
      });
    }

    return usages;
  }

  /**
   * Extract job class definitions
   */
  private extractJobDefinitions(content: string, file: string): JobDefinitionInfo[] {
    const jobs: JobDefinitionInfo[] = [];
    JOB_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = JOB_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index);

      // Check for unique job
      const isUnique = UNIQUE_JOB_PATTERN.test(content.substring(match.index, match.index + 200));

      // Extract queue property
      const queueMatch = classBody.match(/public\s+\$queue\s*=\s*['"]([^'"]+)['"]/);
      const queue = queueMatch ? queueMatch[1] || null : null;

      // Extract connection property
      const connectionMatch = classBody.match(/public\s+\$connection\s*=\s*['"]([^'"]+)['"]/);
      const connection = connectionMatch ? connectionMatch[1] || null : null;

      // Extract tries property
      const triesMatch = classBody.match(/public\s+\$tries\s*=\s*(\d+)/);
      const tries = triesMatch ? parseInt(triesMatch[1] || '0', 10) : null;

      // Extract timeout property
      const timeoutMatch = classBody.match(/public\s+\$timeout\s*=\s*(\d+)/);
      const timeout = timeoutMatch ? parseInt(timeoutMatch[1] || '0', 10) : null;

      jobs.push({
        name,
        isUnique,
        queue,
        connection,
        tries,
        timeout,
        file,
        line,
      });
    }

    return jobs;
  }

  /**
   * Extract queue name from dispatch chain
   */
  private extractQueueName(content: string, startIndex: number): string | null {
    // Look for onQueue in the next 200 characters
    const snippet = content.substring(startIndex, startIndex + 200);
    const match = snippet.match(/->onQueue\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    return match ? match[1] || null : null;
  }

  /**
   * Extract class body
   */
  private extractClassBody(content: string, startIndex: number): string {
    const openBrace = content.indexOf('{', startIndex);
    if (openBrace === -1) {return '';}

    let depth = 1;
    let i = openBrace + 1;

    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }

    return content.substring(openBrace + 1, i - 1);
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new queue extractor
 */
export function createQueueExtractor(): QueueExtractor {
  return new QueueExtractor();
}
