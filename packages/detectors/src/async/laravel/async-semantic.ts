/**
 * Laravel Async Patterns Detector - SEMANTIC VERSION
 *
 * Learns async patterns from your Laravel codebase:
 * - Job patterns (dispatch, queues)
 * - Event patterns (listeners, subscribers)
 * - Broadcasting patterns
 * - Scheduled tasks
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

const ASYNC_FILE_PATTERNS = [
  /jobs\//i, /events\//i, /listeners\//i,
  /subscribers\//i, /broadcasting\//i,
  /console\/kernel/i,
];

const ASYNC_CONTEXT_KEYWORDS = [
  'illuminate\\contracts\\queue',
  'illuminate\\bus\\queueable',
  'illuminate\\queue\\interactswithqueue',
  'shouldqueue', 'dispatchable', 'queueable',
  'dispatch(', 'event(', 'broadcast(',
];


export class LaravelAsyncSemanticDetector extends SemanticDetector {
  readonly id = 'async/laravel-async-semantic';
  readonly name = 'Laravel Async Patterns Detector';
  readonly description = 'Learns async patterns (jobs, events, queues) from your Laravel codebase';
  readonly category = 'performance' as const;
  readonly subcategory = 'laravel';

  override readonly supportedLanguages: Language[] = ['php'];

  constructor() {
    super({
      minOccurrences: 2,
      dominanceThreshold: 0.3,
      minFiles: 1,
      includeComments: false,
      includeStrings: false,
    });
  }

  protected getSemanticKeywords(): string[] {
    return [
      // Jobs
      'Job', 'ShouldQueue', 'Dispatchable', 'Queueable', 'InteractsWithQueue',
      'SerializesModels', 'dispatch', 'dispatchSync', 'dispatchNow',
      'dispatchAfterResponse', 'handle', 'failed', 'retryUntil',
      'tries', 'timeout', 'backoff', 'maxExceptions',
      'onQueue', 'onConnection', 'delay', 'afterCommit',
      
      // Batches
      'Bus', 'batch', 'chain', 'Batch', 'PendingBatch',
      'allowFailures', 'then', 'catch', 'finally',
      
      // Events
      'Event', 'event', 'Listener', 'listen', 'subscribe',
      'ShouldBroadcast', 'ShouldBroadcastNow', 'broadcastOn',
      'broadcastAs', 'broadcastWith', 'broadcastWhen',
      
      // Broadcasting
      'broadcast', 'Channel', 'PrivateChannel', 'PresenceChannel',
      'Pusher', 'Echo', 'whisper', 'here', 'joining', 'leaving',
      
      // Scheduling
      'schedule', 'command', 'call', 'job', 'exec',
      'everyMinute', 'hourly', 'daily', 'weekly', 'monthly',
      'cron', 'timezone', 'withoutOverlapping', 'runInBackground',
      
      // Notifications
      'Notification', 'notify', 'notifyNow', 'Notifiable',
      'via', 'toMail', 'toDatabase', 'toArray', 'toBroadcast',
    ];
  }

  protected getSemanticCategory(): string {
    return 'async';
  }


  protected override isRelevantMatch(match: SemanticMatch): boolean {
    const { file, lineContent, surroundingContext, keyword } = match;
    const contextLower = surroundingContext.toLowerCase();

    const highConfidenceKeywords = [
      'Job', 'ShouldQueue', 'Dispatchable', 'dispatch',
      'Event', 'Listener', 'ShouldBroadcast', 'broadcast',
      'Notification', 'schedule', 'Bus', 'batch',
    ];
    
    if (highConfidenceKeywords.includes(keyword)) {
      return true;
    }

    if (/^\s*\/\//.test(lineContent) || /^\s*\/\*/.test(lineContent)) {
      return false;
    }

    const ambiguousKeywords = ['handle', 'event', 'listen', 'call', 'job'];
    if (ambiguousKeywords.includes(keyword.toLowerCase())) {
      const hasContext = ASYNC_CONTEXT_KEYWORDS.some(k => contextLower.includes(k));
      if (!hasContext) {
        const inAsyncFile = ASYNC_FILE_PATTERNS.some(p => p.test(file));
        if (!inAsyncFile) {return false;}
      }
    }

    return true;
  }

  protected createPatternViolation(
    match: SemanticMatch,
    dominantPattern: UsagePattern
  ): Violation {
    return {
      id: `${this.id}-${match.file}-${match.line}-${match.column}`,
      patternId: this.id,
      severity: 'warning',
      file: match.file,
      range: {
        start: { line: match.line - 1, character: match.column - 1 },
        end: { line: match.line - 1, character: match.column + match.matchedText.length - 1 },
      },
      message: `Inconsistent async pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your Laravel project uses '${dominantPattern.contextType}' for async patterns in ${dominantPattern.percentage.toFixed(0)}% of cases.`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

export function createLaravelAsyncSemanticDetector(): LaravelAsyncSemanticDetector {
  return new LaravelAsyncSemanticDetector();
}
