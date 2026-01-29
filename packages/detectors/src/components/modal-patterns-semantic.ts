/**
 * Modal/Dialog Patterns Detector - SEMANTIC VERSION
 * 
 * Language-agnostic detector that finds modal/dialog patterns including:
 * - Callback props (onSave, onClose, onAdd, onOpenChange)
 * - State reset on close
 * - Form validation
 * - Dialog accessibility patterns
 */

import {
  SemanticDetector,
  type SemanticMatch,
  type UsagePattern,
} from '../base/semantic-detector.js';

import type { Violation, Language } from 'driftdetect-core';

export class ModalPatternsSemanticDetector extends SemanticDetector {
  readonly id = 'components/modal-patterns';
  readonly name = 'Modal Patterns Detector';
  readonly description = 'Learns modal/dialog patterns from your codebase';
  readonly category = 'components' as const;
  readonly subcategory = 'modal-patterns';

  override readonly supportedLanguages: Language[] = [
    'typescript', 'javascript', 'python', 'css', 'scss'
  ];

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
      // Modal/Dialog components
      'Modal',
      'Dialog',
      'DialogContent',
      'DialogHeader',
      'DialogTitle',
      'DialogDescription',
      'DialogFooter',
      'Drawer',
      'Sheet',
      'Popover',
      
      // Callback props pattern
      'onOpenChange',
      'onClose',
      'onSave',
      'onAdd',
      'onSubmit',
      'onCancel',
      'onConfirm',
      'onDismiss',
      
      // State management
      'handleClose',
      'handleSave',
      'handleSubmit',
      'handleCancel',
      'setIsOpen',
      'setOpen',
      
      // Reset patterns
      'clearForm',
      'resetForm',
      'clearSearch',
      'resetState',
      
      // Loading states in modals
      'isSaving',
      'isSubmitting',
      
      // Modal-specific validation
      'validateModal',
      'validateDialog',
    ];
  }

  protected getSemanticCategory(): string {
    return 'components';
  }

  protected override isRelevantMatch(match: SemanticMatch): boolean {
    // Skip URLs and API paths
    if (/https?:\/\/|\/api\/|\/v\d+\//.test(match.lineContent)) {
      return false;
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
      message: `Inconsistent modal pattern: using '${match.contextType}' but project primarily uses '${dominantPattern.contextType}'`,
      expected: dominantPattern.contextType,
      actual: match.contextType,
      explanation: `Your project uses '${dominantPattern.contextType}' for modal patterns in ${dominantPattern.percentage.toFixed(0)}% of cases ` +
        `(${dominantPattern.count} occurrences across ${dominantPattern.files.length} files). ` +
        `This usage of '${match.contextType}' is inconsistent with the established pattern.\n\n` +
        `Examples of the dominant pattern:\n${dominantPattern.examples.slice(0, 3).map(e => `  • ${e}`).join('\n')}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  override generateQuickFix(_violation: Violation): null {
    return null;
  }
}

export function createModalPatternsSemanticDetector(): ModalPatternsSemanticDetector {
  return new ModalPatternsSemanticDetector();
}
