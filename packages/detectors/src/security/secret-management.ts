/**
 * Secret Management Detector - Secret and credential handling pattern detection
 *
 * Detects secret management patterns including:
 * - Hardcoded secrets and credentials
 * - Environment variable usage
 * - Secret manager integrations
 * - API key patterns
 * - Credential rotation patterns
 *
 * @requirements 16.6 - Secret management patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type SecretPatternType =
  | 'env-variable'
  | 'secret-manager'
  | 'vault-integration'
  | 'key-rotation'
  | 'credential-store'
  | 'config-encryption';

export type SecretViolationType =
  | 'hardcoded-secret'
  | 'hardcoded-api-key'
  | 'hardcoded-password'
  | 'hardcoded-token'
  | 'exposed-credential'
  | 'insecure-storage';

export interface SecretPatternInfo {
  type: SecretPatternType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  provider?: string | undefined;
  context?: string | undefined;
}

export interface SecretViolationInfo {
  type: SecretViolationType;
  file: string;
  line: number;
  column: number;
  matchedText: string;
  issue: string;
  suggestedFix?: string | undefined;
  severity: 'critical' | 'high' | 'medium' | 'low';
  secretType?: string | undefined;
}

export interface SecretManagementAnalysis {
  patterns: SecretPatternInfo[];
  violations: SecretViolationInfo[];
  usesEnvVariables: boolean;
  usesSecretManager: boolean;
  usesVault: boolean;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const ENV_VARIABLE_PATTERNS = [
  /process\.env\.[A-Z_][A-Z0-9_]*/gi,
  /process\.env\[['"`][A-Z_][A-Z0-9_]*['"`]\]/gi,
  /import\.meta\.env\.[A-Z_][A-Z0-9_]*/gi,
  /Deno\.env\.get\s*\(\s*['"`][A-Z_][A-Z0-9_]*['"`]\s*\)/gi,
  /os\.environ\[['"`][A-Z_][A-Z0-9_]*['"`]\]/gi,
  /os\.getenv\s*\(\s*['"`][A-Z_][A-Z0-9_]*['"`]\s*\)/gi,
  /ENV\[['"`][A-Z_][A-Z0-9_]*['"`]\]/gi,
  /\$\{[A-Z_][A-Z0-9_]*\}/gi,
] as const;

export const SECRET_MANAGER_PATTERNS = [
  /SecretsManager/gi,
  /SecretManagerServiceClient/gi,
  /getSecretValue/gi,
  /secretsmanager/gi,
  /aws-sdk.*secrets/gi,
  /@aws-sdk\/client-secrets-manager/gi,
  /google-cloud.*secret/gi,
  /azure.*keyvault/gi,
  /KeyVaultClient/gi,
  /SecretClient/gi,
] as const;

export const VAULT_PATTERNS = [
  /hashicorp.*vault/gi,
  /vault\.read/gi,
  /vault\.write/gi,
  /VaultClient/gi,
  /hvac\./gi,
  /vault-client/gi,
  /node-vault/gi,
  /VAULT_ADDR/gi,
  /VAULT_TOKEN/gi,
] as const;

export const KEY_ROTATION_PATTERNS = [
  /rotateSecret/gi,
  /keyRotation/gi,
  /rotate.*key/gi,
  /key.*rotation/gi,
  /credential.*rotation/gi,
  /rotate.*credential/gi,
  /refreshToken/gi,
  /renewToken/gi,
] as const;

export const CREDENTIAL_STORE_PATTERNS = [
  /CredentialStore/gi,
  /KeychainAccess/gi,
  /SecureStorage/gi,
  /EncryptedSharedPreferences/gi,
  /keytar/gi,
  /node-keytar/gi,
  /credential-manager/gi,
  /windows-credential/gi,
] as const;

export const CONFIG_ENCRYPTION_PATTERNS = [
  /encryptConfig/gi,
  /decryptConfig/gi,
  /sealed.*secret/gi,
  /SealedSecret/gi,
  /sops/gi,
  /age.*encrypt/gi,
  /gpg.*encrypt/gi,
  /kms.*encrypt/gi,
] as const;

// Hardcoded secret patterns - these are violations
export const HARDCODED_SECRET_PATTERNS = [
  /['"`](?:sk|pk|api|secret|key)[-_]?[a-zA-Z0-9]{20,}['"`]/gi,
  /['"`][a-zA-Z0-9+/]{40,}={0,2}['"`]/gi, // Base64 encoded secrets
  /password\s*[=:]\s*['"`][^'"`]{8,}['"`]/gi,
  /secret\s*[=:]\s*['"`][^'"`]{8,}['"`]/gi,
  /apiKey\s*[=:]\s*['"`][^'"`]{16,}['"`]/gi,
  /api_key\s*[=:]\s*['"`][^'"`]{16,}['"`]/gi,
  /privateKey\s*[=:]\s*['"`][^'"`]{20,}['"`]/gi,
  /private_key\s*[=:]\s*['"`][^'"`]{20,}['"`]/gi,
] as const;

export const HARDCODED_API_KEY_PATTERNS = [
  /['"`]AIza[0-9A-Za-z-_]{35}['"`]/gi, // Google API key
  /['"`]AKIA[0-9A-Z]{16}['"`]/gi, // AWS Access Key
  /['"`]sk-[a-zA-Z0-9]{48}['"`]/gi, // OpenAI API key
  /['"`]ghp_[a-zA-Z0-9]{36}['"`]/gi, // GitHub Personal Access Token
  /['"`]gho_[a-zA-Z0-9]{36}['"`]/gi, // GitHub OAuth Token
  /['"`]xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}['"`]/gi, // Slack token
  /['"`]sk_live_[a-zA-Z0-9]{24,}['"`]/gi, // Stripe live key
  /['"`]sk_test_[a-zA-Z0-9]{24,}['"`]/gi, // Stripe test key
  /['"`]SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}['"`]/gi, // SendGrid API key
] as const;

export const HARDCODED_PASSWORD_PATTERNS = [
  /password\s*[=:]\s*['"`](?!process\.env|import\.meta\.env|\$\{)[^'"`]{4,}['"`]/gi,
  /passwd\s*[=:]\s*['"`](?!process\.env|import\.meta\.env|\$\{)[^'"`]{4,}['"`]/gi,
  /pwd\s*[=:]\s*['"`](?!process\.env|import\.meta\.env|\$\{)[^'"`]{4,}['"`]/gi,
  /DB_PASSWORD\s*[=:]\s*['"`](?!process\.env|import\.meta\.env|\$\{)[^'"`]{4,}['"`]/gi,
  /DATABASE_PASSWORD\s*[=:]\s*['"`](?!process\.env|import\.meta\.env|\$\{)[^'"`]{4,}['"`]/gi,
] as const;

export const HARDCODED_TOKEN_PATTERNS = [
  /token\s*[=:]\s*['"`](?!process\.env|import\.meta\.env|\$\{)[a-zA-Z0-9_-]{20,}['"`]/gi,
  /bearer\s+[a-zA-Z0-9_-]{20,}/gi,
  /authorization\s*[=:]\s*['"`]Bearer\s+[a-zA-Z0-9_-]{20,}['"`]/gi,
  /jwt\s*[=:]\s*['"`]eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+['"`]/gi,
] as const;

export const EXPOSED_CREDENTIAL_PATTERNS = [
  /console\.log\s*\([^)]*(?:password|secret|token|apiKey|api_key|credential)/gi,
  /console\.debug\s*\([^)]*(?:password|secret|token|apiKey|api_key|credential)/gi,
  /logger\.[a-z]+\s*\([^)]*(?:password|secret|token|apiKey|api_key|credential)/gi,
  /print\s*\([^)]*(?:password|secret|token|apiKey|api_key|credential)/gi,
] as const;

export const INSECURE_STORAGE_PATTERNS = [
  /localStorage\.setItem\s*\([^)]*(?:token|secret|password|apiKey|api_key)/gi,
  /sessionStorage\.setItem\s*\([^)]*(?:token|secret|password|apiKey|api_key)/gi,
  /document\.cookie\s*=.*(?:token|secret|password|apiKey|api_key)/gi,
  /window\.__[A-Z_]*(?:TOKEN|SECRET|KEY)/gi,
] as const;

// ============================================================================
// Analysis Functions
// ============================================================================

export function shouldExcludeFile(filePath: string): boolean {
  const excludePatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /\.d\.ts$/,
    /node_modules\//,
    /\.min\.[jt]s$/,
    /\.example$/,
    /\.sample$/,
    /\.template$/,
  ];
  return excludePatterns.some((p) => p.test(filePath));
}

export function detectEnvVariables(
  content: string,
  filePath: string
): SecretPatternInfo[] {
  const results: SecretPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of ENV_VARIABLE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'env-variable',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectSecretManager(
  content: string,
  filePath: string
): SecretPatternInfo[] {
  const results: SecretPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SECRET_MANAGER_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let provider = 'unknown';
        if (/aws|secretsmanager/i.test(match[0])) {provider = 'aws';}
        else if (/google|gcp/i.test(match[0])) {provider = 'gcp';}
        else if (/azure|keyvault/i.test(match[0])) {provider = 'azure';}

        results.push({
          type: 'secret-manager',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          provider,
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectVaultIntegration(
  content: string,
  filePath: string
): SecretPatternInfo[] {
  const results: SecretPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of VAULT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'vault-integration',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          provider: 'hashicorp',
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectKeyRotation(
  content: string,
  filePath: string
): SecretPatternInfo[] {
  const results: SecretPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of KEY_ROTATION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'key-rotation',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectCredentialStore(
  content: string,
  filePath: string
): SecretPatternInfo[] {
  const results: SecretPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CREDENTIAL_STORE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'credential-store',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectConfigEncryption(
  content: string,
  filePath: string
): SecretPatternInfo[] {
  const results: SecretPatternInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of CONFIG_ENCRYPTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'config-encryption',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          context: line.trim(),
        });
      }
    }
  }

  return results;
}

export function detectHardcodedSecrets(
  content: string,
  filePath: string
): SecretViolationInfo[] {
  const results: SecretViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comments
    if (/^\s*\/\/|^\s*\/\*|^\s*\*|^\s*#/.test(line)) {continue;}

    for (const pattern of HARDCODED_SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'hardcoded-secret',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0].substring(0, 20) + '...',
          issue: 'Potential hardcoded secret detected',
          suggestedFix: 'Use environment variables or a secret manager',
          severity: 'critical',
          secretType: 'generic',
        });
      }
    }
  }

  return results;
}

export function detectHardcodedApiKeys(
  content: string,
  filePath: string
): SecretViolationInfo[] {
  const results: SecretViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*\/\/|^\s*\/\*|^\s*\*|^\s*#/.test(line)) {continue;}

    for (const pattern of HARDCODED_API_KEY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let secretType = 'api-key';
        if (/AIza/.test(match[0])) {secretType = 'google-api-key';}
        else if (/AKIA/.test(match[0])) {secretType = 'aws-access-key';}
        else if (/sk-/.test(match[0])) {secretType = 'openai-api-key';}
        else if (/ghp_|gho_/.test(match[0])) {secretType = 'github-token';}
        else if (/xox/.test(match[0])) {secretType = 'slack-token';}
        else if (/sk_live|sk_test/.test(match[0])) {secretType = 'stripe-key';}
        else if (/SG\./.test(match[0])) {secretType = 'sendgrid-key';}

        results.push({
          type: 'hardcoded-api-key',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0].substring(0, 15) + '...',
          issue: `Hardcoded ${secretType} detected`,
          suggestedFix: 'Store API keys in environment variables or secret manager',
          severity: 'critical',
          secretType,
        });
      }
    }
  }

  return results;
}

export function detectHardcodedPasswords(
  content: string,
  filePath: string
): SecretViolationInfo[] {
  const results: SecretViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*\/\/|^\s*\/\*|^\s*\*|^\s*#/.test(line)) {continue;}
    // Skip type definitions and interfaces
    if (/:\s*string|interface\s+|type\s+/.test(line)) {continue;}

    for (const pattern of HARDCODED_PASSWORD_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'hardcoded-password',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: '[REDACTED]',
          issue: 'Hardcoded password detected',
          suggestedFix: 'Use environment variables for passwords',
          severity: 'critical',
          secretType: 'password',
        });
      }
    }
  }

  return results;
}

export function detectHardcodedTokens(
  content: string,
  filePath: string
): SecretViolationInfo[] {
  const results: SecretViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*\/\/|^\s*\/\*|^\s*\*|^\s*#/.test(line)) {continue;}

    for (const pattern of HARDCODED_TOKEN_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        let secretType = 'token';
        if (/jwt|eyJ/.test(match[0])) {secretType = 'jwt';}
        else if (/bearer/i.test(match[0])) {secretType = 'bearer-token';}

        results.push({
          type: 'hardcoded-token',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0].substring(0, 15) + '...',
          issue: `Hardcoded ${secretType} detected`,
          suggestedFix: 'Tokens should be retrieved dynamically, not hardcoded',
          severity: 'high',
          secretType,
        });
      }
    }
  }

  return results;
}

export function detectExposedCredentials(
  content: string,
  filePath: string
): SecretViolationInfo[] {
  const results: SecretViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of EXPOSED_CREDENTIAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'exposed-credential',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Credential may be exposed in logs',
          suggestedFix: 'Remove sensitive data from log statements',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function detectInsecureStorage(
  content: string,
  filePath: string
): SecretViolationInfo[] {
  const results: SecretViolationInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of INSECURE_STORAGE_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          type: 'insecure-storage',
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          matchedText: match[0],
          issue: 'Sensitive data stored in insecure browser storage',
          suggestedFix: 'Use httpOnly cookies or secure storage mechanisms',
          severity: 'high',
        });
      }
    }
  }

  return results;
}

export function analyzeSecretManagement(
  content: string,
  filePath: string
): SecretManagementAnalysis {
  if (shouldExcludeFile(filePath)) {
    return {
      patterns: [],
      violations: [],
      usesEnvVariables: false,
      usesSecretManager: false,
      usesVault: false,
      confidence: 1.0,
    };
  }

  const patterns: SecretPatternInfo[] = [
    ...detectEnvVariables(content, filePath),
    ...detectSecretManager(content, filePath),
    ...detectVaultIntegration(content, filePath),
    ...detectKeyRotation(content, filePath),
    ...detectCredentialStore(content, filePath),
    ...detectConfigEncryption(content, filePath),
  ];

  const violations: SecretViolationInfo[] = [
    ...detectHardcodedSecrets(content, filePath),
    ...detectHardcodedApiKeys(content, filePath),
    ...detectHardcodedPasswords(content, filePath),
    ...detectHardcodedTokens(content, filePath),
    ...detectExposedCredentials(content, filePath),
    ...detectInsecureStorage(content, filePath),
  ];

  const usesEnvVariables = patterns.some((p) => p.type === 'env-variable');
  const usesSecretManager = patterns.some((p) => p.type === 'secret-manager');
  const usesVault = patterns.some((p) => p.type === 'vault-integration');

  let confidence = 0.7;
  if (usesEnvVariables) {confidence += 0.1;}
  if (usesSecretManager || usesVault) {confidence += 0.15;}
  if (violations.length === 0) {confidence += 0.05;}
  confidence = Math.min(confidence, 0.95);

  return {
    patterns,
    violations,
    usesEnvVariables,
    usesSecretManager,
    usesVault,
    confidence,
  };
}

// ============================================================================
// Detector Class
// ============================================================================

export class SecretManagementDetector extends RegexDetector {
  readonly id = 'security/secret-management';
  readonly name = 'Secret Management Detector';
  readonly description =
    'Detects secret management patterns and identifies hardcoded credentials';
  readonly category: PatternCategory = 'security';
  readonly subcategory = 'secret-management';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language)) {
      return this.createEmptyResult();
    }

    const analysis = analyzeSecretManagement(context.content, context.file);

    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {
      return this.createEmptyResult();
    }

    // Convert internal violations to standard Violation format
    // Map severity: critical/high -> error, medium -> warning, low -> info
    const violations = analysis.violations.map(v => this.convertViolationInfo({
      file: v.file,
      line: v.line,
      column: v.column,
      type: v.type,
      value: v.matchedText,
      issue: v.issue,
      suggestedFix: v.suggestedFix,
      severity: (v.severity === 'critical' || v.severity === 'high') ? 'error' : v.severity === 'medium' ? 'warning' : 'info',
    }));

    return this.createResult([], violations, analysis.confidence, {
      custom: {
        patterns: analysis.patterns,
        usesEnvVariables: analysis.usesEnvVariables,
        usesSecretManager: analysis.usesSecretManager,
        usesVault: analysis.usesVault,
      },
    });
  }

  generateQuickFix(_violation: Violation): QuickFix | null {
    return null;
  }
}

export function createSecretManagementDetector(): SecretManagementDetector {
  return new SecretManagementDetector();
}
