/**
 * ASP.NET Core Identity Patterns Detector
 *
 * Detects ASP.NET Identity usage patterns:
 * - UserManager<T> usage
 * - SignInManager<T> usage
 * - RoleManager<T> usage
 * - IdentityUser extensions
 * - Password hashing patterns
 * - User/role store patterns
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface IdentityUsageInfo {
  /** Type of identity component */
  type: 'user-manager' | 'signin-manager' | 'role-manager' | 'identity-user' | 'password-hasher' | 'user-store' | 'role-store';
  /** Generic type parameter if any */
  genericType: string | null;
  /** Method being called */
  method: string | null;
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface IdentityAnalysis {
  /** All identity usages found */
  usages: IdentityUsageInfo[];
  /** Custom user type if extended */
  customUserType: string | null;
  /** Custom role type if extended */
  customRoleType: string | null;
  /** Whether using custom stores */
  hasCustomStores: boolean;
  /** Identity methods used */
  methodsUsed: string[];
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Patterns (reserved for future use)
// ============================================================================

// const IDENTITY_PATTERNS = {
//   userManager: /UserManager<(\w+)>/g,
//   signInManager: /SignInManager<(\w+)>/g,
//   roleManager: /RoleManager<(\w+)>/g,
//   identityUser: /:\s*IdentityUser(?:<[^>]+>)?/g,
//   identityRole: /:\s*IdentityRole(?:<[^>]+>)?/g,
//   passwordHasher: /IPasswordHasher<(\w+)>/g,
//   userStore: /IUserStore<(\w+)>/g,
//   roleStore: /IRoleStore<(\w+)>/g,
// };

const USER_MANAGER_METHODS = [
  'CreateAsync', 'DeleteAsync', 'UpdateAsync', 'FindByIdAsync', 'FindByNameAsync',
  'FindByEmailAsync', 'AddToRoleAsync', 'RemoveFromRoleAsync', 'GetRolesAsync',
  'IsInRoleAsync', 'AddClaimAsync', 'RemoveClaimAsync', 'GetClaimsAsync',
  'SetLockoutEndDateAsync', 'ResetAccessFailedCountAsync', 'GeneratePasswordResetTokenAsync',
  'ResetPasswordAsync', 'ChangePasswordAsync', 'CheckPasswordAsync',
];

const SIGNIN_MANAGER_METHODS = [
  'PasswordSignInAsync', 'SignInAsync', 'SignOutAsync', 'RefreshSignInAsync',
  'ExternalLoginSignInAsync', 'TwoFactorSignInAsync', 'IsSignedIn',
  'CanSignInAsync', 'ValidateSecurityStampAsync',
];

// ============================================================================
// Detector Implementation
// ============================================================================

export class IdentityPatternsDetector extends BaseDetector {
  readonly id = 'auth/aspnet-identity-patterns';
  readonly category = 'auth' as const;
  readonly subcategory = 'identity';
  readonly name = 'ASP.NET Identity Patterns Detector';
  readonly description = 'Detects ASP.NET Core Identity usage patterns (UserManager, SignInManager, etc.)';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeIdentityUsage(content, file);
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    for (const usage of analysis.usages) {
      patterns.push({
        patternId: `${this.id}/${usage.type}`,
        location: {
          file: usage.file,
          line: usage.line,
          column: 1,
        },
        confidence: analysis.confidence,
        isOutlier: false,
      });
    }

    violations.push(...this.detectViolations(analysis, file));

    return this.createResult(patterns, violations, analysis.confidence, {
      custom: {
        identityAnalysis: analysis,
      },
    });
  }

  private isRelevantFile(content: string): boolean {
    return (
      content.includes('UserManager') ||
      content.includes('SignInManager') ||
      content.includes('RoleManager') ||
      content.includes('IdentityUser') ||
      content.includes('IPasswordHasher') ||
      content.includes('Microsoft.AspNetCore.Identity')
    );
  }

  analyzeIdentityUsage(content: string, file: string): IdentityAnalysis {
    const usages: IdentityUsageInfo[] = [];
    const methodsUsed = new Set<string>();
    let customUserType: string | null = null;
    let customRoleType: string | null = null;
    let hasCustomStores = false;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect UserManager<T>
      const userManagerMatch = line.match(/UserManager<(\w+)>/);
      if (userManagerMatch) {
        usages.push({
          type: 'user-manager',
          genericType: userManagerMatch[1] || null,
          method: this.extractMethod(line, USER_MANAGER_METHODS),
          line: lineNum,
          file,
        });
        if (userManagerMatch[1] && userManagerMatch[1] !== 'IdentityUser') {
          customUserType = userManagerMatch[1];
        }
        const method = this.extractMethod(line, USER_MANAGER_METHODS);
        if (method) {methodsUsed.add(method);}
      }

      // Detect SignInManager<T>
      const signInManagerMatch = line.match(/SignInManager<(\w+)>/);
      if (signInManagerMatch) {
        usages.push({
          type: 'signin-manager',
          genericType: signInManagerMatch[1] || null,
          method: this.extractMethod(line, SIGNIN_MANAGER_METHODS),
          line: lineNum,
          file,
        });
        const method = this.extractMethod(line, SIGNIN_MANAGER_METHODS);
        if (method) {methodsUsed.add(method);}
      }

      // Detect RoleManager<T>
      const roleManagerMatch = line.match(/RoleManager<(\w+)>/);
      if (roleManagerMatch) {
        usages.push({
          type: 'role-manager',
          genericType: roleManagerMatch[1] || null,
          method: null,
          line: lineNum,
          file,
        });
        if (roleManagerMatch[1] && roleManagerMatch[1] !== 'IdentityRole') {
          customRoleType = roleManagerMatch[1];
        }
      }

      // Detect custom IdentityUser
      if (line.includes(': IdentityUser')) {
        const classMatch = line.match(/class\s+(\w+)\s*:\s*IdentityUser/);
        if (classMatch?.[1]) {
          customUserType = classMatch[1];
          usages.push({
            type: 'identity-user',
            genericType: classMatch[1],
            method: null,
            line: lineNum,
            file,
          });
        }
      }

      // Detect password hasher
      if (line.includes('IPasswordHasher')) {
        usages.push({
          type: 'password-hasher',
          genericType: null,
          method: null,
          line: lineNum,
          file,
        });
      }

      // Detect custom stores
      if (line.includes('IUserStore') || line.includes('IRoleStore')) {
        hasCustomStores = true;
        usages.push({
          type: line.includes('IUserStore') ? 'user-store' : 'role-store',
          genericType: null,
          method: null,
          line: lineNum,
          file,
        });
      }
    }

    return {
      usages,
      customUserType,
      customRoleType,
      hasCustomStores,
      methodsUsed: Array.from(methodsUsed),
      confidence: usages.length > 0 ? 0.9 : 0,
    };
  }

  private extractMethod(line: string, methods: string[]): string | null {
    for (const method of methods) {
      if (line.includes(`.${method}`)) {
        return method;
      }
    }
    return null;
  }

  private detectViolations(_analysis: IdentityAnalysis, _file: string): Violation[] {
    const violations: Violation[] = [];

    // Check for direct password comparison (security issue)
    // This would need more sophisticated analysis

    return violations;
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createIdentityPatternsDetector(): IdentityPatternsDetector {
  return new IdentityPatternsDetector();
}
