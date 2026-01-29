/**
 * README Structure Detector - README documentation pattern detection
 * @requirements 21.2 - README structure patterns
 */

import { RegexDetector } from '../base/regex-detector.js';

import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { Violation, QuickFix, PatternCategory, Language } from 'driftdetect-core';

export type ReadmePatternType = 'title' | 'description' | 'installation' | 'usage' | 'api-section' | 'contributing' | 'license' | 'badges' | 'table-of-contents';
export type ReadmeViolationType = 'missing-title' | 'missing-installation' | 'missing-usage';

export interface ReadmePatternInfo { type: ReadmePatternType; file: string; line: number; column: number; matchedText: string; context?: string | undefined; }
export interface ReadmeViolationInfo { type: ReadmeViolationType; file: string; line: number; column: number; matchedText: string; issue: string; suggestedFix?: string | undefined; severity: 'high' | 'medium' | 'low'; }
export interface ReadmeAnalysis { patterns: ReadmePatternInfo[]; violations: ReadmeViolationInfo[]; sectionCount: number; hasInstallation: boolean; hasUsage: boolean; confidence: number; }

export const TITLE_PATTERNS = [/^#\s+.+$/gm] as const;
export const DESCRIPTION_PATTERNS = [/^>\s+.+$/gm, /^[A-Z][^#\n]+\.$/gm] as const;
export const INSTALLATION_PATTERNS = [/^##?\s+Installation/gim, /^##?\s+Getting Started/gim, /^##?\s+Setup/gim] as const;
export const USAGE_PATTERNS = [/^##?\s+Usage/gim, /^##?\s+Examples?/gim, /^##?\s+Quick Start/gim] as const;
export const API_SECTION_PATTERNS = [/^##?\s+API/gim, /^##?\s+Reference/gim, /^##?\s+Documentation/gim] as const;
export const CONTRIBUTING_PATTERNS = [/^##?\s+Contributing/gim, /^##?\s+Development/gim] as const;
export const LICENSE_PATTERNS = [/^##?\s+License/gim, /MIT License/g, /Apache License/g] as const;
export const BADGES_PATTERNS = [/\[!\[.+\]\(.+\)\]\(.+\)/g, /!\[.+\]\(https:\/\/img\.shields\.io/g, /!\[.+\]\(https:\/\/badge/g] as const;
export const TABLE_OF_CONTENTS_PATTERNS = [/^##?\s+Table of Contents/gim, /^##?\s+Contents/gim, /- \[.+\]\(#.+\)/g] as const;

export function shouldExcludeFile(filePath: string): boolean {
  return ![/README\.md$/i, /readme\.md$/i].some((p) => p.test(filePath));
}

function detectPatterns(content: string, filePath: string, patterns: readonly RegExp[], type: ReadmePatternType): ReadmePatternInfo[] {
  const results: ReadmePatternInfo[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({ type, file: filePath, line: i + 1, column: match.index + 1, matchedText: match[0].slice(0, 50), context: line.trim() });
      }
    }
  }
  return results;
}

export function detectTitle(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, TITLE_PATTERNS, 'title'); }
export function detectDescription(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, DESCRIPTION_PATTERNS, 'description'); }
export function detectInstallation(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, INSTALLATION_PATTERNS, 'installation'); }
export function detectUsage(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, USAGE_PATTERNS, 'usage'); }
export function detectApiSection(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, API_SECTION_PATTERNS, 'api-section'); }
export function detectContributing(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, CONTRIBUTING_PATTERNS, 'contributing'); }
export function detectLicense(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, LICENSE_PATTERNS, 'license'); }
export function detectBadges(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, BADGES_PATTERNS, 'badges'); }
export function detectTableOfContents(content: string, filePath: string): ReadmePatternInfo[] { return detectPatterns(content, filePath, TABLE_OF_CONTENTS_PATTERNS, 'table-of-contents'); }

export function analyzeReadmeStructure(content: string, filePath: string): ReadmeAnalysis {
  if (shouldExcludeFile(filePath)) {return { patterns: [], violations: [], sectionCount: 0, hasInstallation: false, hasUsage: false, confidence: 1.0 };}
  const patterns: ReadmePatternInfo[] = [...detectTitle(content, filePath), ...detectDescription(content, filePath), ...detectInstallation(content, filePath), ...detectUsage(content, filePath), ...detectApiSection(content, filePath), ...detectContributing(content, filePath), ...detectLicense(content, filePath), ...detectBadges(content, filePath), ...detectTableOfContents(content, filePath)];
  const violations: ReadmeViolationInfo[] = [];
  const sectionCount = patterns.length;
  const hasInstallation = patterns.some((p) => p.type === 'installation');
  const hasUsage = patterns.some((p) => p.type === 'usage');
  let confidence = 0.7; if (patterns.length > 0) {confidence += 0.15;} if (hasInstallation && hasUsage) {confidence += 0.1;} confidence = Math.min(confidence, 0.95);
  return { patterns, violations, sectionCount, hasInstallation, hasUsage, confidence };
}

export class ReadmeStructureDetector extends RegexDetector {
  readonly id = 'documentation/readme-structure';
  readonly name = 'README Structure Detector';
  readonly description = 'Detects README documentation structure patterns';
  readonly category: PatternCategory = 'documentation';
  readonly subcategory = 'readme-structure';
  readonly supportedLanguages: Language[] = ['markdown'];

  async detect(context: DetectionContext): Promise<DetectionResult> {
    if (!this.supportsLanguage(context.language) && !context.file.toLowerCase().includes('readme')) {return this.createEmptyResult();}
    const analysis = analyzeReadmeStructure(context.content, context.file);
    if (analysis.patterns.length === 0 && analysis.violations.length === 0) {return this.createEmptyResult();}
    
    // Convert internal violations to standard Violation format
    const violations = this.convertViolationInfos(
      analysis.violations.map((v) => ({
        type: v.type,
        file: v.file,
        line: v.line,
        column: v.column,
        value: v.matchedText,
        issue: v.issue,
        suggestedFix: v.suggestedFix,
        severity: v.severity === 'high' ? 'error' as const : v.severity === 'medium' ? 'warning' as const : 'info' as const,
      }))
    );
    
    return this.createResult([], violations, analysis.confidence, { custom: { patterns: analysis.patterns, sectionCount: analysis.sectionCount, hasInstallation: analysis.hasInstallation, hasUsage: analysis.hasUsage } });
  }

  generateQuickFix(_violation: Violation): QuickFix | null { return null; }
}

export function createReadmeStructureDetector(): ReadmeStructureDetector { return new ReadmeStructureDetector(); }
