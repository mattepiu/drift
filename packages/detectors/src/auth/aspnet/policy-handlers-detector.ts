/**
 * ASP.NET Core Policy Handlers Detector
 *
 * Detects authorization policy patterns:
 * - IAuthorizationHandler implementations
 * - AuthorizationHandler<T> base class usage
 * - IAuthorizationRequirement implementations
 * - Policy registration in AddAuthorization()
 * - Custom policy evaluation
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface PolicyHandlerInfo {
  /** Type of policy component */
  type: 'handler' | 'requirement' | 'policy-registration' | 'policy-builder';
  /** Name of the handler/requirement/policy */
  name: string;
  /** Requirement type being handled (for handlers) */
  requirementType: string | null;
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface PolicyAnalysis {
  /** All policy handlers found */
  handlers: PolicyHandlerInfo[];
  /** Policy names registered */
  policyNames: string[];
  /** Requirements defined */
  requirements: string[];
  /** Whether using policy-based authorization */
  usesPolicyAuth: boolean;
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Detector Implementation
// ============================================================================

export class PolicyHandlersDetector extends BaseDetector {
  readonly id = 'auth/aspnet-policy-handlers';
  readonly category = 'auth' as const;
  readonly subcategory = 'policy';
  readonly name = 'ASP.NET Policy Handlers Detector';
  readonly description = 'Detects authorization policy handler patterns in ASP.NET Core';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzePolicyHandlers(content, file);
    const patterns: PatternMatch[] = [];

    for (const handler of analysis.handlers) {
      patterns.push({
        patternId: `${this.id}/${handler.type}`,
        location: {
          file: handler.file,
          line: handler.line,
          column: 1,
        },
        confidence: analysis.confidence,
        isOutlier: false,
      });
    }

    return this.createResult(patterns, [], analysis.confidence, {
      custom: {
        policyAnalysis: analysis,
      },
    });
  }

  private isRelevantFile(content: string): boolean {
    return (
      content.includes('IAuthorizationHandler') ||
      content.includes('AuthorizationHandler<') ||
      content.includes('IAuthorizationRequirement') ||
      content.includes('AddAuthorization') ||
      content.includes('AuthorizationPolicyBuilder')
    );
  }

  analyzePolicyHandlers(content: string, file: string): PolicyAnalysis {
    const handlers: PolicyHandlerInfo[] = [];
    const policyNames = new Set<string>();
    const requirements = new Set<string>();
    let usesPolicyAuth = false;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect IAuthorizationHandler implementation
      if (line.includes('IAuthorizationHandler')) {
        const classMatch = line.match(/class\s+(\w+)\s*:/);
        if (classMatch?.[1]) {
          handlers.push({
            type: 'handler',
            name: classMatch[1],
            requirementType: null,
            line: lineNum,
            file,
          });
        }
      }

      // Detect AuthorizationHandler<T> inheritance
      const handlerMatch = line.match(/AuthorizationHandler<(\w+)>/);
      if (handlerMatch) {
        const classMatch = line.match(/class\s+(\w+)\s*:/);
        handlers.push({
          type: 'handler',
          name: classMatch?.[1] || 'Unknown',
          requirementType: handlerMatch[1] || null,
          line: lineNum,
          file,
        });
        if (handlerMatch[1]) {
          requirements.add(handlerMatch[1]);
        }
      }

      // Detect IAuthorizationRequirement implementation
      if (line.includes('IAuthorizationRequirement')) {
        const classMatch = line.match(/class\s+(\w+)\s*:/);
        if (classMatch?.[1]) {
          requirements.add(classMatch[1]);
          handlers.push({
            type: 'requirement',
            name: classMatch[1],
            requirementType: null,
            line: lineNum,
            file,
          });
        }
      }

      // Detect policy registration
      if (line.includes('AddAuthorization')) {
        usesPolicyAuth = true;
        handlers.push({
          type: 'policy-registration',
          name: 'AddAuthorization',
          requirementType: null,
          line: lineNum,
          file,
        });
      }

      // Detect policy.AddPolicy
      const policyMatch = line.match(/\.AddPolicy\s*\(\s*["'](\w+)["']/);
      if (policyMatch?.[1]) {
        policyNames.add(policyMatch[1]);
        handlers.push({
          type: 'policy-builder',
          name: policyMatch[1],
          requirementType: null,
          line: lineNum,
          file,
        });
      }

      // Detect RequireRole, RequireClaim, etc.
      if (line.includes('RequireRole') || line.includes('RequireClaim') || 
          line.includes('RequireAssertion') || line.includes('RequireAuthenticatedUser')) {
        const builderMatch = line.match(/\.(RequireRole|RequireClaim|RequireAssertion|RequireAuthenticatedUser)/);
        if (builderMatch) {
          handlers.push({
            type: 'policy-builder',
            name: builderMatch[1] || 'Unknown',
            requirementType: null,
            line: lineNum,
            file,
          });
        }
      }
    }

    return {
      handlers,
      policyNames: Array.from(policyNames),
      requirements: Array.from(requirements),
      usesPolicyAuth,
      confidence: handlers.length > 0 ? 0.9 : 0,
    };
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createPolicyHandlersDetector(): PolicyHandlersDetector {
  return new PolicyHandlersDetector();
}
