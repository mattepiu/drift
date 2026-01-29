/**
 * ASP.NET Core JWT Patterns Detector
 *
 * Detects JWT authentication patterns:
 * - JwtBearerDefaults.AuthenticationScheme
 * - Token validation parameters
 * - Claims extraction patterns
 * - Token generation patterns
 * - JWT configuration in Startup/Program
 */

import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface JwtPatternInfo {
  /** Type of JWT pattern */
  type: 'bearer-scheme' | 'token-validation' | 'claims-extraction' | 'token-generation' | 'jwt-config' | 'security-key';
  /** Specific pattern detail */
  detail: string;
  /** Line number */
  line: number;
  /** File path */
  file: string;
}

export interface JwtAnalysis {
  /** All JWT patterns found */
  patterns: JwtPatternInfo[];
  /** Whether JWT is configured */
  hasJwtConfig: boolean;
  /** Token validation settings detected */
  validationSettings: string[];
  /** Claims being extracted */
  claimsExtracted: string[];
  /** Security concerns found */
  securityConcerns: string[];
  /** Confidence score */
  confidence: number;
}

// ============================================================================
// Patterns (reserved for future use)
// ============================================================================

// const JWT_CONFIG_PATTERNS = [
//   /AddJwtBearer/g,
//   /JwtBearerDefaults\.AuthenticationScheme/g,
//   /JwtSecurityTokenHandler/g,
//   /TokenValidationParameters/g,
// ];

const TOKEN_VALIDATION_SETTINGS = [
  'ValidateIssuer',
  'ValidateAudience',
  'ValidateLifetime',
  'ValidateIssuerSigningKey',
  'ValidIssuer',
  'ValidAudience',
  'IssuerSigningKey',
  'ClockSkew',
  'RequireExpirationTime',
  'RequireSignedTokens',
];

// const CLAIMS_PATTERNS = [
//   /User\.Claims/g,
//   /ClaimTypes\.\w+/g,
//   /FindFirst(?:Value)?\s*\(/g,
//   /\.GetClaim/g,
//   /ClaimsPrincipal/g,
// ];

// const TOKEN_GENERATION_PATTERNS = [
//   /new\s+JwtSecurityToken/g,
//   /WriteToken/g,
//   /CreateToken/g,
//   /SigningCredentials/g,
//   /SecurityTokenDescriptor/g,
// ];

// const SECURITY_KEY_PATTERNS = [
//   /SymmetricSecurityKey/g,
//   /RsaSecurityKey/g,
//   /X509SecurityKey/g,
//   /JsonWebKey/g,
// ];

// ============================================================================
// Detector Implementation
// ============================================================================

export class JwtPatternsDetector extends BaseDetector {
  readonly id = 'auth/aspnet-jwt-patterns';
  readonly category = 'auth' as const;
  readonly subcategory = 'jwt';
  readonly name = 'ASP.NET JWT Patterns Detector';
  readonly description = 'Detects JWT authentication patterns in ASP.NET Core';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (!this.isRelevantFile(content)) {
      return this.createEmptyResult();
    }

    const analysis = this.analyzeJwtPatterns(content, file);
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

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

    violations.push(...this.detectViolations(analysis, content, file));

    return this.createResult(patterns, violations, analysis.confidence, {
      custom: {
        jwtAnalysis: analysis,
      },
    });
  }

  private isRelevantFile(content: string): boolean {
    return (
      content.includes('Jwt') ||
      content.includes('JWT') ||
      content.includes('Bearer') ||
      content.includes('TokenValidation') ||
      content.includes('SecurityToken') ||
      content.includes('ClaimTypes')
    );
  }

  analyzeJwtPatterns(content: string, file: string): JwtAnalysis {
    const patterns: JwtPatternInfo[] = [];
    const validationSettings: string[] = [];
    const claimsExtracted: string[] = [];
    const securityConcerns: string[] = [];
    let hasJwtConfig = false;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Detect JWT configuration
      if (line.includes('AddJwtBearer') || line.includes('JwtBearerDefaults')) {
        hasJwtConfig = true;
        patterns.push({
          type: 'jwt-config',
          detail: 'JWT Bearer authentication configured',
          line: lineNum,
          file,
        });
      }

      // Detect token validation parameters
      for (const setting of TOKEN_VALIDATION_SETTINGS) {
        if (line.includes(setting)) {
          validationSettings.push(setting);
          patterns.push({
            type: 'token-validation',
            detail: setting,
            line: lineNum,
            file,
          });
        }
      }

      // Detect claims extraction
      if (line.includes('User.Claims') || line.includes('FindFirst') || line.includes('ClaimTypes')) {
        const claimMatch = line.match(/ClaimTypes\.(\w+)/);
        if (claimMatch?.[1]) {
          claimsExtracted.push(claimMatch[1]);
        }
        patterns.push({
          type: 'claims-extraction',
          detail: claimMatch ? claimMatch[1] || 'unknown' : 'claims access',
          line: lineNum,
          file,
        });
      }

      // Detect token generation
      if (line.includes('JwtSecurityToken') || line.includes('WriteToken') || line.includes('CreateToken')) {
        patterns.push({
          type: 'token-generation',
          detail: 'JWT token generation',
          line: lineNum,
          file,
        });
      }

      // Detect security keys
      if (line.includes('SecurityKey') || line.includes('SigningCredentials')) {
        patterns.push({
          type: 'security-key',
          detail: 'Security key configuration',
          line: lineNum,
          file,
        });

        // Check for hardcoded secrets
        if (line.match(/["'][A-Za-z0-9+/=]{20,}["']/)) {
          securityConcerns.push('Possible hardcoded secret key');
        }
      }

      // Check for insecure patterns
      if (line.includes('ValidateIssuer = false') || line.includes('ValidateIssuer=false')) {
        securityConcerns.push('Issuer validation disabled');
      }
      if (line.includes('ValidateAudience = false') || line.includes('ValidateAudience=false')) {
        securityConcerns.push('Audience validation disabled');
      }
      if (line.includes('ValidateLifetime = false') || line.includes('ValidateLifetime=false')) {
        securityConcerns.push('Lifetime validation disabled');
      }
    }

    return {
      patterns,
      hasJwtConfig,
      validationSettings: [...new Set(validationSettings)],
      claimsExtracted: [...new Set(claimsExtracted)],
      securityConcerns: [...new Set(securityConcerns)],
      confidence: patterns.length > 0 ? 0.9 : 0,
    };
  }

  private detectViolations(analysis: JwtAnalysis, content: string, file: string): Violation[] {
    const violations: Violation[] = [];

    // Warn about disabled validation
    for (const concern of analysis.securityConcerns) {
      const lineNum = this.findLineWithPattern(content, concern.includes('Issuer') ? 'ValidateIssuer = false' : 
                                                        concern.includes('Audience') ? 'ValidateAudience = false' :
                                                        concern.includes('Lifetime') ? 'ValidateLifetime = false' : '');
      
      violations.push({
        id: `${this.id}-${file}-${lineNum}-security`,
        patternId: this.id,
        severity: concern.includes('hardcoded') ? 'error' : 'warning',
        file,
        range: {
          start: { line: lineNum - 1, character: 0 },
          end: { line: lineNum - 1, character: 100 },
        },
        message: `JWT Security Concern: ${concern}`,
        expected: 'Secure JWT configuration',
        actual: concern,
        explanation: this.getSecurityExplanation(concern),
        aiExplainAvailable: true,
        aiFixAvailable: true,
        firstSeen: new Date(),
        occurrences: 1,
      });
    }

    return violations;
  }

  private findLineWithPattern(content: string, pattern: string): number {
    if (!pattern) {return 1;}
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(pattern)) {
        return i + 1;
      }
    }
    return 1;
  }

  private getSecurityExplanation(concern: string): string {
    if (concern.includes('Issuer')) {
      return 'Disabling issuer validation allows tokens from any issuer to be accepted. ' +
             'This can lead to token forgery attacks. Always validate the issuer in production.';
    }
    if (concern.includes('Audience')) {
      return 'Disabling audience validation allows tokens intended for other applications. ' +
             'This can lead to confused deputy attacks. Always validate the audience.';
    }
    if (concern.includes('Lifetime')) {
      return 'Disabling lifetime validation allows expired tokens to be accepted. ' +
             'This significantly increases the window for token theft attacks.';
    }
    if (concern.includes('hardcoded')) {
      return 'Hardcoded secret keys in source code are a security risk. ' +
             'Use environment variables, Azure Key Vault, or other secure configuration.';
    }
    return 'Review this JWT configuration for security best practices.';
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createJwtPatternsDetector(): JwtPatternsDetector {
  return new JwtPatternsDetector();
}
