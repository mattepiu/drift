/**
 * Secret Management Detector - LEARNING VERSION
 *
 * Learns secret management patterns from the user's codebase:
 * - Secret storage method (env vars, vault, AWS Secrets Manager)
 * - Naming conventions for secrets
 * - Access patterns
 *
 * @requirements DRIFT-CORE - Learn patterns from user's code, not enforce arbitrary rules
 */

import {
  LearningDetector,
  ValueDistribution,
  type DetectionContext,
  type DetectionResult,
  type LearningResult,
} from '../base/index.js';

import type { PatternMatch, Violation, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export type SecretStorage = 'env' | 'vault' | 'aws-secrets' | 'azure-keyvault' | 'gcp-secrets';
export type SecretNaming = 'screaming-snake' | 'camel' | 'prefix-based';

export interface SecretManagementConventions {
  [key: string]: unknown;
  storageMethod: SecretStorage;
  namingConvention: SecretNaming;
  usesPrefix: boolean;
  secretPrefix: string | null;
}

interface SecretInfo {
  storage: SecretStorage;
  name: string;
  line: number;
  column: number;
  file: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const STORAGE_PATTERNS: Array<{ pattern: RegExp; storage: SecretStorage }> = [
  { pattern: /process\.env\.|import\.meta\.env\./g, storage: 'env' },
  { pattern: /vault\.read|@hashicorp\/vault/gi, storage: 'vault' },
  { pattern: /SecretsManager|@aws-sdk\/client-secrets-manager/gi, storage: 'aws-secrets' },
  { pattern: /KeyVaultClient|@azure\/keyvault-secrets/gi, storage: 'azure-keyvault' },
  { pattern: /SecretManagerServiceClient|@google-cloud\/secret-manager/gi, storage: 'gcp-secrets' },
];

function extractSecretPatterns(content: string, file: string): SecretInfo[] {
  const secrets: SecretInfo[] = [];
  
  for (const { pattern, storage } of STORAGE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      secrets.push({ storage, name: match[0], line: lineNumber, column, file });
    }
  }
  
  return secrets;
}

function detectNamingConvention(content: string): SecretNaming | null {
  const envMatches = content.match(/process\.env\.([A-Z_]+)/g);
  if (envMatches && envMatches.length > 0) {
    const hasScreamingSnake = envMatches.some(m => /[A-Z]+_[A-Z]+/.test(m));
    if (hasScreamingSnake) {return 'screaming-snake';}
  }
  return null;
}

// ============================================================================
// Learning Secret Management Detector
// ============================================================================

export class SecretManagementLearningDetector extends LearningDetector<SecretManagementConventions> {
  readonly id = 'security/secret-management';
  readonly category = 'security' as const;
  readonly subcategory = 'secret-management';
  readonly name = 'Secret Management Detector (Learning)';
  readonly description = 'Learns secret management patterns from your codebase';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  protected getConventionKeys(): Array<keyof SecretManagementConventions> {
    return ['storageMethod', 'namingConvention', 'usesPrefix', 'secretPrefix'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof SecretManagementConventions, ValueDistribution>
  ): void {
    const secrets = extractSecretPatterns(context.content, context.file);
    const naming = detectNamingConvention(context.content);
    
    const storageDist = distributions.get('storageMethod')!;
    const namingDist = distributions.get('namingConvention')!;
    
    for (const secret of secrets) {
      storageDist.add(secret.storage, context.file);
    }
    
    if (naming) {namingDist.add(naming, context.file);}
  }

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<SecretManagementConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const secrets = extractSecretPatterns(context.content, context.file);
    const learnedStorage = conventions.conventions.storageMethod?.value;
    
    for (const secret of secrets) {
      if (learnedStorage && secret.storage !== learnedStorage) {
        violations.push(this.createConventionViolation(
          secret.file, secret.line, secret.column,
          'secret storage', secret.storage, learnedStorage,
          `Using '${secret.storage}' but your project uses '${learnedStorage}'`
        ));
      }
      
      patterns.push({
        patternId: `${this.id}/${secret.storage}`,
        location: { file: context.file, line: secret.line, column: secret.column },
        confidence: 1.0, isOutlier: false,
      });
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }
}

export function createSecretManagementLearningDetector(): SecretManagementLearningDetector {
  return new SecretManagementLearningDetector();
}
