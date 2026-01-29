/**
 * ASP.NET Core Resource-Based Authorization Detector
 *
 * Detects resource-based authorization patterns:
 * - IAuthorizationService.AuthorizeAsync() usage
 * - Resource-based policy checks
 * - Ownership validation patterns
 * - Document/entity-level authorization
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface ResourceAuthInfo {
  /** Type of resource authorization */
  type: 'authorization-service' | 'resource-check' | 'ownership-check' | 'document-auth';
  /** Resource type being authorized */
  resourceType: string | null;
  /** Policy/requirement being checked */
  policy: string | null;
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface ResourceAuthAnalysis {
  /** All resource authorization patterns found */
  patterns: ResourceAuthInfo[];
  /** Resource types being authorized */
  resourceTypes: string[];
  /** Policies used for resource auth */
  policies: string[];
  /** Whether using IAuthorizationService */
  usesAuthorizationService: boolean;
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Detector Implementation
// ============================================================================

export class ResourceAuthorizationDetector extends BaseDetector {
  readonly id = 'auth/aspnet-resource-authorization';
  readonly category = 'auth' as const;
  readonly subcategory = 'resource-auth';
  readonly name = 'ASP.NET Resource Authorization Detector';
  readonly description = 'Detects resource-based authorization patterns in ASP.NET Core';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeResourceAuth(content, file);
    const patterns: PatternMatch[] = [];

    for (const pattern of analysis.patterns) {
      patterns.push({
        patternId: `${this.id}/${pattern.type}`,
        location: {
          file: pattern.file,
          line: pattern.line,
          column: 1,
        },
        confidence: analysis.confidence,
        isOutlier: false,
      });
    }

    return this.createResult(patterns, [], analysis.confidence, {
      custom: {
        resourceAuthAnalysis: analysis,
      },
    });
  }

  private isRelevantFile(content: string): boolean {
    return (
      content.includes('IAuthorizationService') ||
      content.includes('AuthorizeAsync') ||
      content.includes('AuthorizationResult') ||
      (content.includes('ControllerBase') && content.includes('User.'))
    );
  }

  analyzeResourceAuth(content: string, file: string): ResourceAuthAnalysis {
    const patterns: ResourceAuthInfo[] = [];
    const resourceTypes = new Set<string>();
    const policies = new Set<string>();
    let usesAuthorizationService = false;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect IAuthorizationService injection
      if (line.includes('IAuthorizationService')) {
        usesAuthorizationService = true;
        patterns.push({
          type: 'authorization-service',
          resourceType: null,
          policy: null,
          line: lineNum,
          file,
        });
      }

      // Detect AuthorizeAsync calls
      const authorizeMatch = line.match(/AuthorizeAsync\s*\(\s*(?:User|_user|\w+)\s*,\s*(\w+)\s*,\s*["']?(\w+)["']?\s*\)/);
      if (authorizeMatch) {
        const resourceVar = authorizeMatch[1];
        const policy = authorizeMatch[2];
        
        if (resourceVar) {resourceTypes.add(resourceVar);}
        if (policy) {policies.add(policy);}
        
        patterns.push({
          type: 'resource-check',
          resourceType: resourceVar || null,
          policy: policy || null,
          line: lineNum,
          file,
        });
      }

      // Detect simpler AuthorizeAsync pattern
      if (line.includes('AuthorizeAsync') && !authorizeMatch) {
        patterns.push({
          type: 'resource-check',
          resourceType: null,
          policy: null,
          line: lineNum,
          file,
        });
      }

      // Detect ownership checks (common pattern)
      if (line.match(/\.\s*(?:UserId|OwnerId|CreatedBy|AuthorId)\s*==\s*(?:User|userId|currentUser)/i) ||
          line.match(/(?:User|userId|currentUser)\s*==\s*\w+\.\s*(?:UserId|OwnerId|CreatedBy|AuthorId)/i)) {
        patterns.push({
          type: 'ownership-check',
          resourceType: null,
          policy: null,
          line: lineNum,
          file,
        });
      }

      // Detect User.FindFirst for ownership
      if (line.includes('User.FindFirst') && (line.includes('UserId') || line.includes('NameIdentifier'))) {
        patterns.push({
          type: 'ownership-check',
          resourceType: null,
          policy: null,
          line: lineNum,
          file,
        });
      }

      // Detect document-level authorization patterns
      if (line.match(/\.Where\s*\(\s*\w+\s*=>\s*\w+\.(?:UserId|OwnerId|TenantId)\s*==/)) {
        patterns.push({
          type: 'document-auth',
          resourceType: null,
          policy: null,
          line: lineNum,
          file,
        });
      }
    }

    return {
      patterns,
      resourceTypes: Array.from(resourceTypes),
      policies: Array.from(policies),
      usesAuthorizationService,
      confidence: patterns.length > 0 ? 0.85 : 0,
    };
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createResourceAuthorizationDetector(): ResourceAuthorizationDetector {
  return new ResourceAuthorizationDetector();
}
