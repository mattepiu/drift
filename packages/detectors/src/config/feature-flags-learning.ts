/**
 * Feature Flags Detector - LEARNING VERSION
 *
 * Learns feature flag patterns from the user's codebase:
 * - Feature flag function names (isFeatureEnabled, useFeature, etc.)
 * - Feature flag services used (LaunchDarkly, Unleash, etc.)
 * - Environment variable naming patterns
 * - Flag naming conventions
 *
 * Flags violations only when code deviates from the PROJECT'S established patterns.
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

import type { PatternMatch, Violation, QuickFix, Language } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Conventions this detector learns
 */
export interface FeatureFlagConventions {
  [key: string]: unknown;
  /** Primary function name used for checking flags */
  checkFunction: string;
  
  /** Hook name used for flags (React) */
  hookName: string | null;
  
  /** Feature flag service used */
  service: string | null;
  
  /** Environment variable prefix for flags */
  envPrefix: string;
  
  /** Flag naming convention (camelCase, SCREAMING_SNAKE, etc.) */
  flagNaming: 'camelCase' | 'SCREAMING_SNAKE_CASE' | 'kebab-case' | 'mixed';
  
  /** Whether hardcoded flags are used (vs service/env) */
  usesHardcodedFlags: boolean;
}

/**
 * Feature flag usage info
 */
interface FlagUsageInfo {
  type: 'function' | 'hook' | 'env' | 'service' | 'hardcoded';
  name: string;
  line: number;
  column: number;
  flagName?: string | undefined;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract feature flag usages from content
 */
function extractFlagUsages(content: string, _file: string): FlagUsageInfo[] {
  const usages: FlagUsageInfo[] = [];
  
  // Function call patterns - capture the function name
  const functionPatterns = [
    /\b(isFeatureEnabled|featureEnabled|isEnabled|hasFeature|checkFeature|getFeatureFlag|isFeatureOn|featureIsEnabled)\s*\(/gi,
    /\b(is_feature_enabled|feature_enabled|is_enabled|has_feature|check_feature|get_feature_flag)\s*\(/gi,
  ];
  
  // Hook patterns
  const hookPatterns = [
    /\b(useFeatureFlag|useFeature|useFlag|useExperiment)\s*\(/gi,
  ];
  
  // Environment variable patterns - capture the prefix
  const envPatterns = [
    /process\.env\.(FEATURE_[A-Z0-9_]+|FF_[A-Z0-9_]+|ENABLE_[A-Z0-9_]+)/gi,
    /import\.meta\.env\.(VITE_FEATURE_[A-Z0-9_]+|VITE_FF_[A-Z0-9_]+)/gi,
    /os\.environ\[['"]?(FEATURE_[A-Z0-9_]+|ENABLE_[A-Z0-9_]+)['"]?\]/gi,
    /os\.getenv\s*\(\s*['"]?(FEATURE_[A-Z0-9_]+|ENABLE_[A-Z0-9_]+)['"]?/gi,
  ];
  
  // Service patterns
  const servicePatterns = [
    /\b(LaunchDarkly|ldClient|Unleash|ConfigCat|Split|Flagsmith|GrowthBook|PostHog|Statsig)\b/gi,
  ];
  
  // Hardcoded flag patterns
  const hardcodedPatterns = [
    /(?:const|let|var)\s+(\w*[Ff]eature\w*|\w*[Ff]lag\w*|ENABLE_\w+)\s*=\s*(?:true|false)/gi,
  ];
  
  // Process function patterns
  for (const pattern of functionPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      // Try to extract flag name from arguments
      const argMatch = content.slice(match.index).match(/\(\s*['"`]([^'"`]+)['"`]/);
      const funcName = match[1];
      if (!funcName) {continue;}
      
      usages.push({
        type: 'function',
        name: funcName,
        line: lineNumber,
        column,
        flagName: argMatch?.[1],
      });
    }
  }
  
  // Process hook patterns
  for (const pattern of hookPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      const argMatch = content.slice(match.index).match(/\(\s*['"`]([^'"`]+)['"`]/);
      const hookName = match[1];
      if (!hookName) {continue;}
      
      usages.push({
        type: 'hook',
        name: hookName,
        line: lineNumber,
        column,
        flagName: argMatch?.[1],
      });
    }
  }
  
  // Process env patterns
  for (const pattern of envPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      
      // Extract prefix (FEATURE_, FF_, ENABLE_, etc.)
      const envName = match[1];
      if (!envName) {continue;}
      const prefixMatch = envName.match(/^(FEATURE_|FF_|ENABLE_|VITE_FEATURE_|VITE_FF_)/);
      
      usages.push({
        type: 'env',
        name: prefixMatch?.[1] || 'FEATURE_',
        line: lineNumber,
        column,
        flagName: envName,
      });
    }
  }
  
  // Process service patterns
  for (const pattern of servicePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      const serviceName = match[1];
      if (!serviceName) {continue;}
      
      usages.push({
        type: 'service',
        name: serviceName,
        line: lineNumber,
        column,
      });
    }
  }
  
  // Process hardcoded patterns
  for (const pattern of hardcodedPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const lastNewline = beforeMatch.lastIndexOf('\n');
      const column = match.index - lastNewline;
      const flagName = match[1];
      if (!flagName) {continue;}
      
      usages.push({
        type: 'hardcoded',
        name: flagName,
        line: lineNumber,
        column,
        flagName: flagName,
      });
    }
  }
  
  return usages;
}

/**
 * Detect flag naming convention
 */
function detectFlagNaming(flagName: string): 'camelCase' | 'SCREAMING_SNAKE_CASE' | 'kebab-case' | 'mixed' {
  if (/^[A-Z][A-Z0-9_]*$/.test(flagName)) {return 'SCREAMING_SNAKE_CASE';}
  if (/^[a-z][a-zA-Z0-9]*$/.test(flagName)) {return 'camelCase';}
  if (/^[a-z][a-z0-9-]*$/.test(flagName)) {return 'kebab-case';}
  return 'mixed';
}

// ============================================================================
// Learning Feature Flags Detector
// ============================================================================

export class FeatureFlagsLearningDetector extends LearningDetector<FeatureFlagConventions> {
  readonly id = 'config/feature-flags';
  readonly category = 'config' as const;
  readonly subcategory = 'feature-flags';
  readonly name = 'Feature Flags Detector (Learning)';
  readonly description = 'Learns feature flag patterns from your codebase and flags inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript', 'python'];

  // ============================================================================
  // Learning Implementation
  // ============================================================================

  protected getConventionKeys(): Array<keyof FeatureFlagConventions> {
    return ['checkFunction', 'hookName', 'service', 'envPrefix', 'flagNaming', 'usesHardcodedFlags'];
  }

  protected extractConventions(
    context: DetectionContext,
    distributions: Map<keyof FeatureFlagConventions, ValueDistribution>
  ): void {
    const usages = extractFlagUsages(context.content, context.file);
    
    if (usages.length === 0) {return;}
    
    const functionDist = distributions.get('checkFunction')!;
    const hookDist = distributions.get('hookName')!;
    const serviceDist = distributions.get('service')!;
    const envPrefixDist = distributions.get('envPrefix')!;
    const namingDist = distributions.get('flagNaming')!;
    const hardcodedDist = distributions.get('usesHardcodedFlags')!;
    
    for (const usage of usages) {
      switch (usage.type) {
        case 'function':
          functionDist.add(usage.name, context.file);
          break;
        case 'hook':
          hookDist.add(usage.name, context.file);
          break;
        case 'service':
          serviceDist.add(usage.name.toLowerCase(), context.file);
          break;
        case 'env':
          envPrefixDist.add(usage.name, context.file);
          break;
        case 'hardcoded':
          hardcodedDist.add(true, context.file);
          break;
      }
      
      // Track flag naming convention
      if (usage.flagName) {
        const naming = detectFlagNaming(usage.flagName);
        namingDist.add(naming, context.file);
      }
    }
  }

  // ============================================================================
  // Detection Implementation
  // ============================================================================

  protected async detectWithConventions(
    context: DetectionContext,
    conventions: LearningResult<FeatureFlagConventions>
  ): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];
    
    const usages = extractFlagUsages(context.content, context.file);
    
    if (usages.length === 0) {
      return this.createEmptyResult();
    }
    
    // Get learned conventions
    const learnedFunction = conventions.conventions.checkFunction?.value;
    const learnedHook = conventions.conventions.hookName?.value;
    const learnedEnvPrefix = conventions.conventions.envPrefix?.value;
    const learnedNaming = conventions.conventions.flagNaming?.value;
    const usesHardcoded = conventions.conventions.usesHardcodedFlags?.value;
    
    for (const usage of usages) {
      // Check function name consistency
      if (usage.type === 'function' && learnedFunction) {
        if (usage.name.toLowerCase() !== learnedFunction.toLowerCase()) {
          violations.push(this.createConventionViolation(
            context.file,
            usage.line,
            usage.column,
            'feature flag function',
            usage.name,
            learnedFunction,
            `Function '${usage.name}' differs from project convention '${learnedFunction}'`
          ));
        }
      }
      
      // Check hook name consistency
      if (usage.type === 'hook' && learnedHook) {
        if (usage.name.toLowerCase() !== learnedHook.toLowerCase()) {
          violations.push(this.createConventionViolation(
            context.file,
            usage.line,
            usage.column,
            'feature flag hook',
            usage.name,
            learnedHook,
            `Hook '${usage.name}' differs from project convention '${learnedHook}'`
          ));
        }
      }
      
      // Check env prefix consistency
      if (usage.type === 'env' && learnedEnvPrefix) {
        if (usage.name !== learnedEnvPrefix) {
          violations.push(this.createConventionViolation(
            context.file,
            usage.line,
            usage.column,
            'feature flag env prefix',
            usage.name,
            learnedEnvPrefix,
            `Environment variable prefix '${usage.name}' differs from project convention '${learnedEnvPrefix}'`
          ));
        }
      }
      
      // Check flag naming consistency
      if (usage.flagName && learnedNaming && learnedNaming !== 'mixed') {
        const actualNaming = detectFlagNaming(usage.flagName);
        if (actualNaming !== learnedNaming && actualNaming !== 'mixed') {
          violations.push(this.createConventionViolation(
            context.file,
            usage.line,
            usage.column,
            'flag naming',
            actualNaming,
            learnedNaming,
            `Flag '${usage.flagName}' uses ${actualNaming} but project uses ${learnedNaming}`
          ));
        }
      }
      
      // Flag hardcoded flags if project uses service/env
      if (usage.type === 'hardcoded' && usesHardcoded === false) {
        violations.push(this.createConventionViolation(
          context.file,
          usage.line,
          usage.column,
          'feature flag source',
          'hardcoded',
          'environment variable or service',
          `Hardcoded flag '${usage.name}' - your project uses environment variables or a flag service`
        ));
      }
    }
    
    // Create pattern match
    if (usages.length > 0) {
      const firstUsage = usages[0];
      if (firstUsage) {
        patterns.push({
          patternId: `${this.id}/flags`,
          location: {
            file: context.file,
            line: firstUsage.line,
            column: firstUsage.column,
          },
          confidence: 1.0,
          isOutlier: violations.length > 0,
        });
      }
    }
    
    const confidence = violations.length === 0 ? 1.0 : Math.max(0.5, 1 - violations.length * 0.1);
    return this.createResult(patterns, violations, confidence);
  }

  // ============================================================================
  // Quick Fix
  // ============================================================================

  override generateQuickFix(_violation: Violation): QuickFix | null {
    // Feature flag fixes are complex - suggest but don't auto-fix
    return null;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createFeatureFlagsLearningDetector(): FeatureFlagsLearningDetector {
  return new FeatureFlagsLearningDetector();
}
