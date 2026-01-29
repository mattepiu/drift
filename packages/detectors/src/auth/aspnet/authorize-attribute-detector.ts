/**
 * ASP.NET Core Authorize Attribute Detector
 *
 * Detects authorization patterns in ASP.NET Core applications:
 * - [Authorize] attribute usage
 * - [Authorize(Roles = "...")] role-based authorization
 * - [Authorize(Policy = "...")] policy-based authorization
 * - [AllowAnonymous] exceptions
 * - Authorization at controller vs action level
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface AuthorizeAttributeInfo {
  /** Type of authorization */
  type: 'authorize' | 'allow-anonymous' | 'authorize-roles' | 'authorize-policy';
  /** Roles if specified */
  roles: string[];
  /** Policy name if specified */
  policy: string | null;
  /** Authentication schemes if specified */
  authenticationSchemes: string[];
  /** Whether this is at controller level */
  isControllerLevel: boolean;
  /** The target (controller name or action name) */
  target: string;
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface AuthorizationAnalysis {
  /** All authorization attributes found */
  attributes: AuthorizeAttributeInfo[];
  /** Controllers with authorization */
  authorizedControllers: string[];
  /** Actions with authorization */
  authorizedActions: string[];
  /** Actions with AllowAnonymous */
  anonymousActions: string[];
  /** Unique roles used */
  roles: string[];
  /** Unique policies used */
  policies: string[];
  /** Whether authorization is consistent */
  isConsistent: boolean;
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Detector Implementation
// ============================================================================

export class AuthorizeAttributeDetector extends BaseDetector {
  readonly id = 'auth/aspnet-authorize-attribute';
  readonly category = 'auth' as const;
  readonly subcategory = 'authorization';
  readonly name = 'ASP.NET Authorize Attribute Detector';
  readonly description = 'Detects [Authorize] and [AllowAnonymous] attribute patterns in ASP.NET Core';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    // Only process C# files that look like controllers or have auth attributes
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeAuthorization(content, file);
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Create pattern matches for each authorization attribute
    for (const attr of analysis.attributes) {
      patterns.push({
        patternId: `${this.id}/${attr.type}`,
        location: {
          file: attr.file,
          line: attr.line,
          column: 1,
        },
        confidence: analysis.confidence,
        isOutlier: false,
      });
    }

    // Check for potential issues
    violations.push(...this.detectViolations(analysis, file));

    return this.createResult(patterns, violations, analysis.confidence, {
      custom: {
        authorizationAnalysis: analysis,
      },
    });
  }

  /**
   * Check if file is relevant for authorization detection
   */
  private isRelevantFile(content: string): boolean {
    return (
      content.includes('[Authorize') ||
      content.includes('[AllowAnonymous]') ||
      content.includes('ControllerBase') ||
      content.includes(': Controller')
    );
  }

  /**
   * Analyze authorization patterns in the file
   */
  analyzeAuthorization(content: string, file: string): AuthorizationAnalysis {
    const attributes: AuthorizeAttributeInfo[] = [];
    const authorizedControllers: string[] = [];
    const authorizedActions: string[] = [];
    const anonymousActions: string[] = [];
    const roles = new Set<string>();
    const policies = new Set<string>();

    const lines = content.split('\n');
    let currentController: string | null = null;
    let pendingAttributes: Array<{ type: string; roles: string[]; policy: string | null; schemes: string[]; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect [Authorize] attributes
      const authorizeMatch = line.match(/\[Authorize(?:\s*\(([^)]*)\))?\]/);
      if (authorizeMatch) {
        const args = authorizeMatch[1] || '';
        const attrInfo = this.parseAuthorizeArgs(args);
        
        // Add roles and policies to sets
        attrInfo.roles.forEach(r => roles.add(r));
        if (attrInfo.policy) {policies.add(attrInfo.policy);}

        pendingAttributes.push({
          type: attrInfo.roles.length > 0 ? 'authorize-roles' : 
                attrInfo.policy ? 'authorize-policy' : 'authorize',
          roles: attrInfo.roles,
          policy: attrInfo.policy,
          schemes: attrInfo.schemes,
          line: lineNum,
        });
      }

      // Detect [AllowAnonymous]
      if (line.includes('[AllowAnonymous]')) {
        pendingAttributes.push({
          type: 'allow-anonymous',
          roles: [],
          policy: null,
          schemes: [],
          line: lineNum,
        });
      }

      // Detect controller class
      const controllerMatch = line.match(/public\s+class\s+(\w+Controller)\s*:/);
      if (controllerMatch?.[1]) {
        currentController = controllerMatch[1];
        
        // Apply pending attributes to controller
        for (const attr of pendingAttributes) {
          attributes.push({
            type: attr.type as AuthorizeAttributeInfo['type'],
            roles: attr.roles,
            policy: attr.policy,
            authenticationSchemes: attr.schemes,
            isControllerLevel: true,
            target: currentController,
            line: attr.line,
            file,
          });

          if (attr.type !== 'allow-anonymous') {
            authorizedControllers.push(currentController);
          }
        }
        pendingAttributes = [];
      }

      // Detect action methods
      const actionMatch = line.match(/public\s+(?:async\s+)?(?:Task<)?(?:ActionResult|IActionResult|[\w<>]+)\s+(\w+)\s*\(/);
      if (actionMatch?.[1] && currentController) {
        const actionName = actionMatch[1];
        
        // Apply pending attributes to action
        for (const attr of pendingAttributes) {
          attributes.push({
            type: attr.type as AuthorizeAttributeInfo['type'],
            roles: attr.roles,
            policy: attr.policy,
            authenticationSchemes: attr.schemes,
            isControllerLevel: false,
            target: actionName,
            line: attr.line,
            file,
          });

          if (attr.type === 'allow-anonymous') {
            anonymousActions.push(`${currentController}.${actionName}`);
          } else {
            authorizedActions.push(`${currentController}.${actionName}`);
          }
        }
        pendingAttributes = [];
      }
    }

    // Calculate consistency
    const isConsistent = this.checkConsistency(attributes);
    const confidence = attributes.length > 0 ? 0.9 : 0;

    return {
      attributes,
      authorizedControllers: [...new Set(authorizedControllers)],
      authorizedActions: [...new Set(authorizedActions)],
      anonymousActions: [...new Set(anonymousActions)],
      roles: Array.from(roles),
      policies: Array.from(policies),
      isConsistent,
      confidence,
    };
  }

  /**
   * Parse [Authorize(...)] arguments
   */
  private parseAuthorizeArgs(args: string): { roles: string[]; policy: string | null; schemes: string[] } {
    const roles: string[] = [];
    let policy: string | null = null;
    const schemes: string[] = [];

    if (!args) {return { roles, policy, schemes };}

    // Extract Roles
    const rolesMatch = args.match(/Roles\s*=\s*["']([^"']+)["']/);
    if (rolesMatch?.[1]) {
      roles.push(...rolesMatch[1].split(',').map(r => r.trim()));
    }

    // Extract Policy
    const policyMatch = args.match(/Policy\s*=\s*["']([^"']+)["']/);
    if (policyMatch?.[1]) {
      policy = policyMatch[1];
    }

    // Extract AuthenticationSchemes
    const schemesMatch = args.match(/AuthenticationSchemes\s*=\s*["']([^"']+)["']/);
    if (schemesMatch?.[1]) {
      schemes.push(...schemesMatch[1].split(',').map(s => s.trim()));
    }

    return { roles, policy, schemes };
  }

  /**
   * Check if authorization patterns are consistent
   */
  private checkConsistency(attributes: AuthorizeAttributeInfo[]): boolean {
    if (attributes.length < 2) {return true;}

    // Check if mixing roles and policies inconsistently
    const hasRoles = attributes.some(a => a.roles.length > 0);
    const hasPolicies = attributes.some(a => a.policy !== null);
    
    // Mixing roles and policies is fine in ASP.NET Core
    // Consider inconsistent only if there's a clear anti-pattern
    // For now, having both is acceptable
    if (hasRoles && hasPolicies) {
      // Both approaches used - this is actually fine in ASP.NET Core
      return true;
    }
    
    return true;
  }

  /**
   * Detect potential authorization violations
   */
  private detectViolations(analysis: AuthorizationAnalysis, file: string): Violation[] {
    const violations: Violation[] = [];

    // Check for controllers without any authorization
    const controllerAttrs = analysis.attributes.filter(a => a.isControllerLevel);
    const actionAttrs = analysis.attributes.filter(a => !a.isControllerLevel);

    // If some actions have auth but controller doesn't, might be inconsistent
    if (controllerAttrs.length === 0 && actionAttrs.length > 0) {
      // Check if all actions have auth or if some are missing
      // This is informational, not necessarily a violation
    }

    // Check for [AllowAnonymous] on sensitive-looking endpoints
    for (const attr of analysis.attributes) {
      if (attr.type === 'allow-anonymous') {
        const target = attr.target.toLowerCase();
        if (target.includes('admin') || target.includes('delete') || target.includes('update')) {
          violations.push({
            id: `${this.id}-${file}-${attr.line}-sensitive-anonymous`,
            patternId: this.id,
            severity: 'warning',
            file,
            range: {
              start: { line: attr.line - 1, character: 0 },
              end: { line: attr.line - 1, character: 100 },
            },
            message: `[AllowAnonymous] on potentially sensitive endpoint: ${attr.target}`,
            expected: '[Authorize]',
            actual: '[AllowAnonymous]',
            explanation: `The endpoint '${attr.target}' appears to be sensitive based on its name, ` +
              `but is marked as [AllowAnonymous]. Consider if this is intentional.`,
            aiExplainAvailable: true,
            aiFixAvailable: false,
            firstSeen: new Date(),
            occurrences: 1,
          });
        }
      }
    }

    return violations;
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createAuthorizeAttributeDetector(): AuthorizeAttributeDetector {
  return new AuthorizeAttributeDetector();
}

