/**
 * Ref Forwarding Detector - Ref forwarding pattern detection
 *
 * Detects ref forwarding patterns including React.forwardRef usage,
 * useImperativeHandle, ref prop forwarding, callback refs, and ref merging.
 * Identifies issues and suggests improvements.
 *
 * @requirements 8.7 - THE Component_Detector SHALL detect ref forwarding patterns
 */

import { ASTDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range, ASTNode } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of ref forwarding patterns
 */
export type RefForwardingPattern =
  | 'forwardRef'              // React.forwardRef usage
  | 'useImperativeHandle'     // useImperativeHandle hook
  | 'ref-prop-to-dom'         // Ref forwarded to DOM element
  | 'ref-prop-to-child'       // Ref forwarded to child component
  | 'callback-ref'            // Callback ref pattern
  | 'useRef-dom'              // useRef for DOM access
  | 'useRef-mutable'          // useRef for mutable values
  | 'ref-merging'             // Multiple refs merged
  | 'none';                   // No ref pattern detected

/**
 * Types of ref forwarding issues
 */
export type RefForwardingIssue =
  | 'missing-forwardRef'           // Component accepts ref but doesn't use forwardRef
  | 'incorrect-ref-typing'         // Ref has incorrect type
  | 'ref-not-forwarded'            // Ref prop not forwarded to element
  | 'imperative-without-forwardRef' // useImperativeHandle without forwardRef
  | 'excessive-imperative-handle'  // Exposing too much via useImperativeHandle
  | 'unused-ref'                   // Ref declared but never used
  | 'ref-in-render';               // Ref accessed during render (not in effect)


/**
 * Information about a ref usage in a component
 */
export interface RefUsageInfo {
  /** Type of ref pattern */
  pattern: RefForwardingPattern;
  /** Variable name associated with the ref */
  variableName: string;
  /** Line number where ref is declared/used */
  line: number;
  /** Column number */
  column: number;
  /** Whether ref is forwarded to DOM element */
  forwardedToDOM: boolean;
  /** Whether ref is forwarded to child component */
  forwardedToChild: boolean;
  /** Target element/component name (if forwarded) */
  targetName?: string;
  /** Methods exposed via useImperativeHandle */
  exposedMethods?: string[];
}

/**
 * Information about a component's ref handling
 */
export interface ComponentRefInfo {
  /** Component name */
  componentName: string;
  /** File path */
  filePath: string;
  /** Line number where component is defined */
  line: number;
  /** Column number */
  column: number;
  /** Whether component uses forwardRef */
  usesForwardRef: boolean;
  /** Whether component uses useImperativeHandle */
  usesImperativeHandle: boolean;
  /** Ref usages in the component */
  refUsages: RefUsageInfo[];
  /** Detected issues */
  issues: RefIssue[];
  /** Whether component accepts ref prop */
  acceptsRefProp: boolean;
  /** Whether component is wrapped with forwardRef */
  isWrappedWithForwardRef: boolean;
}

/**
 * A detected ref forwarding issue
 */
export interface RefIssue {
  /** Type of issue */
  type: RefForwardingIssue;
  /** Description of the issue */
  description: string;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Suggestion for fixing */
  suggestion: string;
  /** Line number where issue occurs */
  line: number;
  /** Column number */
  column: number;
}


/**
 * Analysis of ref forwarding patterns in a project
 */
export interface RefForwardingAnalysis {
  /** All analyzed components */
  components: ComponentRefInfo[];
  /** Dominant ref pattern */
  dominantPattern: RefForwardingPattern;
  /** Pattern usage counts */
  patternCounts: Record<RefForwardingPattern, number>;
  /** Confidence score */
  confidence: number;
  /** Components with issues */
  componentsWithIssues: ComponentRefInfo[];
  /** Overall ref handling health score (0-1) */
  healthScore: number;
}

/**
 * Configuration for ref forwarding detection
 */
export interface RefForwardingConfig {
  /** Maximum methods to expose via useImperativeHandle */
  maxImperativeHandleMethods: number;
  /** Whether to flag unused refs */
  flagUnusedRefs: boolean;
  /** Whether to flag missing forwardRef */
  flagMissingForwardRef: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for ref forwarding detection
 */
export const DEFAULT_REF_FORWARDING_CONFIG: RefForwardingConfig = {
  maxImperativeHandleMethods: 5,
  flagUnusedRefs: true,
  flagMissingForwardRef: true,
};

/**
 * Common ref-related hook names
 */
export const REF_HOOKS = ['useRef', 'useImperativeHandle', 'useCallback'] as const;

/**
 * DOM element names that commonly receive refs
 */
export const DOM_ELEMENTS_WITH_REFS = [
  'input', 'textarea', 'select', 'button', 'form',
  'div', 'span', 'section', 'article', 'nav', 'header', 'footer',
  'canvas', 'video', 'audio', 'img', 'iframe',
  'table', 'tbody', 'thead', 'tr', 'td', 'th',
  'ul', 'ol', 'li', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
] as const;


// ============================================================================
// Helper Functions - Component Detection
// ============================================================================

/**
 * Check if a node represents a React component
 */
export function isReactComponent(node: ASTNode, content: string): boolean {
  if (node.type === 'function_declaration' || 
      node.type === 'arrow_function' ||
      node.type === 'function_expression') {
    const name = getComponentName(node, content);
    if (!name || !/^[A-Z]/.test(name)) {
      return false;
    }
    const nodeText = node.text;
    return nodeText.includes('<') && (nodeText.includes('/>') || nodeText.includes('</'));
  }
  return false;
}

/**
 * Get the component name from a node
 */
export function getComponentName(node: ASTNode, content: string): string | undefined {
  if (node.type === 'function_declaration') {
    const nameNode = node.children.find(c => c.type === 'identifier');
    return nameNode?.text;
  }
  
  const lines = content.split('\n');
  const line = lines[node.startPosition.row];
  if (line) {
    const match = line.match(/(?:const|let|var|export\s+(?:const|let|var)?)\s+([A-Z][a-zA-Z0-9]*)\s*[=:]/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}


// ============================================================================
// Helper Functions - forwardRef Detection
// ============================================================================

/**
 * Detect React.forwardRef usage in content
 */
export function detectForwardRef(content: string): RefUsageInfo[] {
  const results: RefUsageInfo[] = [];
  
  // Pattern 1: const Component = forwardRef((props, ref) => ...)
  const forwardRefPattern = /(?:const|let|var)\s+([A-Z][a-zA-Z0-9]*)\s*=\s*(?:React\.)?forwardRef\s*(?:<[^>]*>)?\s*\(\s*(?:\([^)]*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)|function\s*\([^)]*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\))/g;
  
  let match;
  while ((match = forwardRefPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const refName = match[2] || match[3] || 'ref';
    
    results.push({
      pattern: 'forwardRef',
      variableName: refName,
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: false,
    });
  }
  
  // Pattern 2: export default forwardRef(...)
  const exportForwardRefPattern = /export\s+default\s+(?:React\.)?forwardRef\s*(?:<[^>]*>)?\s*\(/g;
  
  while ((match = exportForwardRefPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    results.push({
      pattern: 'forwardRef',
      variableName: 'ref',
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: false,
    });
  }
  
  return results;
}

/**
 * Check if component is wrapped with forwardRef
 */
export function isWrappedWithForwardRef(content: string, componentName: string): boolean {
  // Check for: const Component = forwardRef(...)
  const pattern1 = new RegExp(`const\\s+${componentName}\\s*=\\s*(?:React\\.)?forwardRef`);
  // Check for: export default forwardRef(Component)
  const pattern2 = new RegExp(`export\\s+default\\s+(?:React\\.)?forwardRef\\s*\\(\\s*${componentName}`);
  // Check for: forwardRef<...>((props, ref) => ...) assigned to component
  const pattern3 = new RegExp(`${componentName}\\s*=\\s*(?:React\\.)?forwardRef`);
  
  return pattern1.test(content) || pattern2.test(content) || pattern3.test(content);
}


// ============================================================================
// Helper Functions - useImperativeHandle Detection
// ============================================================================

/**
 * Detect useImperativeHandle usage in content
 */
export function detectUseImperativeHandle(content: string): RefUsageInfo[] {
  const results: RefUsageInfo[] = [];
  
  // Pattern: useImperativeHandle(ref, () => ({ method1, method2 }), [deps])
  const imperativePattern = /useImperativeHandle\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*\(\)\s*=>\s*\(\s*\{([^}]*)\}/g;
  
  let match;
  while ((match = imperativePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const refName = match[1] || 'ref';
    const methodsStr = match[2] || '';
    
    // Extract method names
    const methods = methodsStr
      .split(',')
      .map(m => m.trim().split(':')[0]?.trim() || '')
      .filter(m => m && /^[a-zA-Z_$]/.test(m));
    
    results.push({
      pattern: 'useImperativeHandle',
      variableName: refName,
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: false,
      exposedMethods: methods,
    });
  }
  
  // Simpler pattern without extracting methods
  const simplePattern = /useImperativeHandle\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  
  while ((match = simplePattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const refName = match[1] || 'ref';
    
    // Check if we already have this one
    if (!results.some(r => r.line === line && r.pattern === 'useImperativeHandle')) {
      results.push({
        pattern: 'useImperativeHandle',
        variableName: refName,
        line,
        column: 1,
        forwardedToDOM: false,
        forwardedToChild: false,
      });
    }
  }
  
  return results;
}

/**
 * Check if useImperativeHandle is used without forwardRef
 */
export function hasImperativeWithoutForwardRef(content: string): boolean {
  const hasImperative = /useImperativeHandle\s*\(/.test(content);
  const hasForwardRef = /(?:React\.)?forwardRef\s*[(<]/.test(content);
  
  return hasImperative && !hasForwardRef;
}


// ============================================================================
// Helper Functions - useRef Detection
// ============================================================================

/**
 * Detect useRef usage in content
 */
export function detectUseRef(content: string): RefUsageInfo[] {
  const results: RefUsageInfo[] = [];
  
  // Pattern: const ref = useRef<Type>(initial)
  const useRefPattern = /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*useRef\s*(?:<([^>]*)>)?\s*\(([^)]*)\)/g;
  
  let match;
  while ((match = useRefPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const refName = match[1] || 'ref';
    const typeAnnotation = match[2] || '';
    const initialValue = match[3] || '';
    
    // Determine if this is a DOM ref or mutable ref
    const isDOMRef = initialValue.trim() === 'null' || 
                     typeAnnotation.includes('Element') ||
                     typeAnnotation.includes('HTML');
    
    // Check if ref is used on a DOM element
    const refUsagePattern = new RegExp(`ref\\s*=\\s*\\{\\s*${refName}\\s*\\}`);
    const forwardedToDOM = refUsagePattern.test(content);
    
    results.push({
      pattern: isDOMRef ? 'useRef-dom' : 'useRef-mutable',
      variableName: refName,
      line,
      column: 1,
      forwardedToDOM,
      forwardedToChild: false,
    });
  }
  
  return results;
}

/**
 * Check if a ref is used in the component
 */
export function isRefUsed(content: string, refName: string): boolean {
  // Check for ref={refName} or ref.current
  const usagePattern = new RegExp(
    `ref\\s*=\\s*\\{\\s*${refName}\\s*\\}|${refName}\\.current`,
    'g'
  );
  return usagePattern.test(content);
}


// ============================================================================
// Helper Functions - Ref Prop Forwarding Detection
// ============================================================================

/**
 * Detect ref prop forwarding to DOM elements
 */
export function detectRefPropToDom(content: string): RefUsageInfo[] {
  const results: RefUsageInfo[] = [];
  
  // Pattern: <element ref={ref} /> or <element ref={props.ref} />
  const domRefPattern = /<([a-z][a-zA-Z0-9]*)[^>]*\s+ref\s*=\s*\{([^}]+)\}/g;
  
  let match;
  while ((match = domRefPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const elementName = match[1] || '';
    const refValue = match[2]?.trim() || '';
    
    // Only count if it's a DOM element (lowercase)
    if (DOM_ELEMENTS_WITH_REFS.includes(elementName.toLowerCase() as typeof DOM_ELEMENTS_WITH_REFS[number])) {
      results.push({
        pattern: 'ref-prop-to-dom',
        variableName: refValue,
        line,
        column: 1,
        forwardedToDOM: true,
        forwardedToChild: false,
        targetName: elementName,
      });
    }
  }
  
  return results;
}

/**
 * Detect ref prop forwarding to child components
 */
export function detectRefPropToChild(content: string): RefUsageInfo[] {
  const results: RefUsageInfo[] = [];
  
  // Pattern: <Component ref={ref} /> (PascalCase component)
  const childRefPattern = /<([A-Z][a-zA-Z0-9]*)[^>]*\s+ref\s*=\s*\{([^}]+)\}/g;
  
  let match;
  while ((match = childRefPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const componentName = match[1] || '';
    const refValue = match[2]?.trim() || '';
    
    results.push({
      pattern: 'ref-prop-to-child',
      variableName: refValue,
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: true,
      targetName: componentName,
    });
  }
  
  return results;
}


// ============================================================================
// Helper Functions - Callback Ref Detection
// ============================================================================

/**
 * Detect callback ref patterns
 */
export function detectCallbackRef(content: string): RefUsageInfo[] {
  const results: RefUsageInfo[] = [];
  
  // Pattern 1: ref={(el) => ...} or ref={el => ...}
  const inlineCallbackPattern = /ref\s*=\s*\{\s*\(?([a-zA-Z_$][a-zA-Z0-9_$]*)\)?\s*=>/g;
  
  let match;
  while ((match = inlineCallbackPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const paramName = match[1] || 'el';
    
    results.push({
      pattern: 'callback-ref',
      variableName: paramName,
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: false,
    });
  }
  
  // Pattern 2: ref={callbackRef} where callbackRef is a function
  // This is harder to detect without type info, so we look for common patterns
  const callbackRefPattern = /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:useCallback\s*\(\s*)?\(?([a-zA-Z_$][a-zA-Z0-9_$]*)\)?\s*=>\s*\{[^}]*\.\s*current\s*=/g;
  
  while ((match = callbackRefPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const refName = match[1] || 'callbackRef';
    
    results.push({
      pattern: 'callback-ref',
      variableName: refName,
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: false,
    });
  }
  
  return results;
}


// ============================================================================
// Helper Functions - Ref Merging Detection
// ============================================================================

/**
 * Detect ref merging patterns (multiple refs combined)
 */
export function detectRefMerging(content: string): RefUsageInfo[] {
  const results: RefUsageInfo[] = [];
  
  // Pattern 1: useMergeRefs or mergeRefs utility
  const mergeRefsPattern = /(?:useMergeRefs|mergeRefs)\s*\(\s*\[([^\]]+)\]/g;
  
  let match;
  while ((match = mergeRefsPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    const refsStr = match[1] || '';
    const refs = refsStr.split(',').map(r => r.trim()).filter(r => r);
    
    results.push({
      pattern: 'ref-merging',
      variableName: refs.join(', '),
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: false,
    });
  }
  
  // Pattern 2: Callback ref that assigns to multiple refs
  const multiAssignPattern = /ref\s*=\s*\{\s*\(?([a-zA-Z_$][a-zA-Z0-9_$]*)\)?\s*=>\s*\{[^}]*\.current\s*=[^}]*\.current\s*=/g;
  
  while ((match = multiAssignPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    results.push({
      pattern: 'ref-merging',
      variableName: 'merged',
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: false,
    });
  }
  
  // Pattern 3: composeRefs utility
  const composeRefsPattern = /composeRefs\s*\(/g;
  
  while ((match = composeRefsPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    results.push({
      pattern: 'ref-merging',
      variableName: 'composed',
      line,
      column: 1,
      forwardedToDOM: false,
      forwardedToChild: false,
    });
  }
  
  return results;
}


// ============================================================================
// Helper Functions - Issue Detection
// ============================================================================

/**
 * Check if component accepts ref prop but doesn't use forwardRef
 */
export function detectMissingForwardRef(content: string): boolean {
  // Check if component has ref in props
  const hasRefProp = /\(\s*\{[^}]*\bref\b[^}]*\}/.test(content) ||
                     /props\.ref/.test(content);
  
  // Check if wrapped with forwardRef
  const hasForwardRef = /(?:React\.)?forwardRef\s*[(<]/.test(content);
  
  return hasRefProp && !hasForwardRef;
}

/**
 * Detect ref forwarding issues in a component
 */
export function detectRefIssues(
  content: string,
  refUsages: RefUsageInfo[],
  config: RefForwardingConfig
): RefIssue[] {
  const issues: RefIssue[] = [];
  
  // Check for useImperativeHandle without forwardRef
  if (hasImperativeWithoutForwardRef(content)) {
    const imperativeUsage = refUsages.find(r => r.pattern === 'useImperativeHandle');
    issues.push({
      type: 'imperative-without-forwardRef',
      description: 'useImperativeHandle is used without forwardRef wrapper',
      severity: 'error',
      suggestion: 'Wrap the component with React.forwardRef to properly expose imperative methods',
      line: imperativeUsage?.line || 1,
      column: 1,
    });
  }
  
  // Check for excessive imperative handle methods
  for (const usage of refUsages) {
    if (usage.pattern === 'useImperativeHandle' && usage.exposedMethods) {
      if (usage.exposedMethods.length > config.maxImperativeHandleMethods) {
        issues.push({
          type: 'excessive-imperative-handle',
          description: `useImperativeHandle exposes ${usage.exposedMethods.length} methods (max: ${config.maxImperativeHandleMethods})`,
          severity: 'warning',
          suggestion: 'Consider reducing the number of exposed methods or using a different pattern',
          line: usage.line,
          column: 1,
        });
      }
    }
  }
  
  // Check for missing forwardRef
  if (config.flagMissingForwardRef && detectMissingForwardRef(content)) {
    issues.push({
      type: 'missing-forwardRef',
      description: 'Component accepts ref prop but is not wrapped with forwardRef',
      severity: 'warning',
      suggestion: 'Wrap the component with React.forwardRef to properly forward refs',
      line: 1,
      column: 1,
    });
  }
  
  // Check for unused refs
  if (config.flagUnusedRefs) {
    for (const usage of refUsages) {
      if ((usage.pattern === 'useRef-dom' || usage.pattern === 'useRef-mutable') &&
          !isRefUsed(content, usage.variableName)) {
        issues.push({
          type: 'unused-ref',
          description: `Ref '${usage.variableName}' is declared but never used`,
          severity: 'info',
          suggestion: 'Remove the unused ref or use it in the component',
          line: usage.line,
          column: 1,
        });
      }
    }
  }
  
  return issues;
}


// ============================================================================
// Helper Functions - Analysis
// ============================================================================

/**
 * Collect all ref usages from content
 */
export function collectRefUsages(content: string): RefUsageInfo[] {
  return [
    ...detectForwardRef(content),
    ...detectUseImperativeHandle(content),
    ...detectUseRef(content),
    ...detectRefPropToDom(content),
    ...detectRefPropToChild(content),
    ...detectCallbackRef(content),
    ...detectRefMerging(content),
  ];
}

/**
 * Analyze a single component's ref patterns
 */
export function analyzeComponentRefs(
  nodeText: string,
  content: string,
  filePath: string,
  componentName: string,
  line: number,
  config: RefForwardingConfig
): ComponentRefInfo {
  const refUsages = collectRefUsages(nodeText);
  const issues = detectRefIssues(nodeText, refUsages, config);
  
  const usesForwardRef = refUsages.some(r => r.pattern === 'forwardRef');
  const usesImperativeHandle = refUsages.some(r => r.pattern === 'useImperativeHandle');
  const acceptsRefProp = /\(\s*\{[^}]*\bref\b[^}]*\}/.test(nodeText) ||
                         /props\.ref/.test(nodeText) ||
                         /,\s*ref\s*\)/.test(nodeText);
  
  return {
    componentName,
    filePath,
    line,
    column: 1,
    usesForwardRef,
    usesImperativeHandle,
    refUsages,
    issues,
    acceptsRefProp,
    isWrappedWithForwardRef: isWrappedWithForwardRef(content, componentName),
  };
}

/**
 * Find dominant pattern from a list
 */
function findDominantPattern(
  patterns: RefForwardingPattern[]
): { dominant: RefForwardingPattern; confidence: number } {
  const counts = new Map<RefForwardingPattern, number>();
  
  for (const pattern of patterns) {
    if (pattern !== 'none') {
      counts.set(pattern, (counts.get(pattern) || 0) + 1);
    }
  }
  
  let dominant: RefForwardingPattern = 'none';
  let maxCount = 0;
  
  for (const [pattern, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = pattern;
    }
  }
  
  const total = patterns.filter(p => p !== 'none').length;
  const confidence = total > 0 ? maxCount / total : 0;
  
  return { dominant, confidence };
}


/**
 * Analyze ref forwarding patterns across multiple components
 */
export function analyzeRefForwardingPatterns(
  components: ComponentRefInfo[]
): RefForwardingAnalysis {
  if (components.length === 0) {
    return {
      components: [],
      dominantPattern: 'none',
      patternCounts: {
        'forwardRef': 0,
        'useImperativeHandle': 0,
        'ref-prop-to-dom': 0,
        'ref-prop-to-child': 0,
        'callback-ref': 0,
        'useRef-dom': 0,
        'useRef-mutable': 0,
        'ref-merging': 0,
        'none': 0,
      },
      confidence: 0,
      componentsWithIssues: [],
      healthScore: 1.0,
    };
  }
  
  // Collect all patterns
  const allPatterns: RefForwardingPattern[] = [];
  const patternCounts: Record<RefForwardingPattern, number> = {
    'forwardRef': 0,
    'useImperativeHandle': 0,
    'ref-prop-to-dom': 0,
    'ref-prop-to-child': 0,
    'callback-ref': 0,
    'useRef-dom': 0,
    'useRef-mutable': 0,
    'ref-merging': 0,
    'none': 0,
  };
  
  for (const comp of components) {
    for (const usage of comp.refUsages) {
      allPatterns.push(usage.pattern);
      patternCounts[usage.pattern]++;
    }
    if (comp.refUsages.length === 0) {
      patternCounts['none']++;
    }
  }
  
  // Find dominant pattern
  const { dominant, confidence } = findDominantPattern(allPatterns);
  
  // Find components with issues
  const componentsWithIssues = components.filter(c => c.issues.length > 0);
  
  // Calculate health score
  let healthScore = 1.0;
  const totalIssues = components.reduce((sum, c) => sum + c.issues.length, 0);
  if (totalIssues > 0) {
    healthScore = Math.max(0, 1 - (totalIssues * 0.1));
  }
  
  return {
    components,
    dominantPattern: dominant,
    patternCounts,
    confidence,
    componentsWithIssues,
    healthScore,
  };
}


// ============================================================================
// Pattern Description Helpers
// ============================================================================

const PATTERN_DESCRIPTIONS: Record<RefForwardingPattern, string> = {
  'forwardRef': 'React.forwardRef wrapper',
  'useImperativeHandle': 'useImperativeHandle hook',
  'ref-prop-to-dom': 'ref forwarded to DOM element',
  'ref-prop-to-child': 'ref forwarded to child component',
  'callback-ref': 'callback ref pattern',
  'useRef-dom': 'useRef for DOM access',
  'useRef-mutable': 'useRef for mutable values',
  'ref-merging': 'multiple refs merged',
  'none': 'no ref pattern',
};

const ISSUE_DESCRIPTIONS: Record<RefForwardingIssue, string> = {
  'missing-forwardRef': 'missing forwardRef wrapper',
  'incorrect-ref-typing': 'incorrect ref typing',
  'ref-not-forwarded': 'ref not forwarded to element',
  'imperative-without-forwardRef': 'useImperativeHandle without forwardRef',
  'excessive-imperative-handle': 'too many methods exposed via useImperativeHandle',
  'unused-ref': 'unused ref declaration',
  'ref-in-render': 'ref accessed during render',
};

/**
 * Get human-readable description for a pattern
 */
export function getPatternDescription(pattern: RefForwardingPattern): string {
  return PATTERN_DESCRIPTIONS[pattern] || pattern;
}

/**
 * Get human-readable description for an issue
 */
export function getIssueDescription(issue: RefForwardingIssue): string {
  return ISSUE_DESCRIPTIONS[issue] || issue;
}


// ============================================================================
// Ref Forwarding Detector Class
// ============================================================================

/**
 * Detector for ref forwarding patterns
 *
 * Identifies ref forwarding patterns including forwardRef, useImperativeHandle,
 * ref prop forwarding, callback refs, and ref merging. Reports issues when
 * components don't follow best practices.
 *
 * @requirements 8.7 - THE Component_Detector SHALL detect ref forwarding patterns
 */
export class RefForwardingDetector extends ASTDetector {
  readonly id = 'components/ref-forwarding';
  readonly category = 'components' as const;
  readonly subcategory = 'ref-forwarding';
  readonly name = 'Ref Forwarding Detector';
  readonly description = 'Detects ref forwarding patterns and identifies issues with ref handling';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  private config: RefForwardingConfig;

  constructor(config: Partial<RefForwardingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_REF_FORWARDING_CONFIG, ...config };
  }

  /**
   * Detect ref forwarding patterns in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Find all components in the file
    const componentInfos = this.findComponentsInFile(context);
    
    if (componentInfos.length === 0) {
      return this.createEmptyResult();
    }

    // Analyze patterns across all components
    const analysis = analyzeRefForwardingPatterns(componentInfos);

    // Create pattern matches for detected patterns
    for (const [pattern, count] of Object.entries(analysis.patternCounts)) {
      if (count > 0 && pattern !== 'none') {
        patterns.push(this.createPatternMatch(
          context.file,
          pattern as RefForwardingPattern,
          count,
          analysis
        ));
      }
    }

    // Generate violations for components with issues in current file
    for (const comp of analysis.componentsWithIssues) {
      if (comp.filePath === context.file) {
        for (const issue of comp.issues) {
          violations.push(this.createViolation(context.file, comp, issue));
        }
      }
    }

    return this.createResult(patterns, violations, analysis.confidence);
  }


  /**
   * Find all React components in a file
   */
  private findComponentsInFile(context: DetectionContext): ComponentRefInfo[] {
    const components: ComponentRefInfo[] = [];
    
    if (context.ast) {
      // Use AST to find components
      const functionNodes = this.findNodesByTypes(context.ast, [
        'function_declaration',
        'arrow_function',
        'function_expression',
      ]);
      
      for (const node of functionNodes) {
        if (isReactComponent(node, context.content)) {
          const componentName = getComponentName(node, context.content);
          if (componentName) {
            const info = analyzeComponentRefs(
              node.text,
              context.content,
              context.file,
              componentName,
              node.startPosition.row + 1,
              this.config
            );
            components.push(info);
          }
        }
      }
    } else {
      // Fallback: use regex-based detection
      const componentMatches = this.findComponentsWithRegex(context.content, context.file);
      components.push(...componentMatches);
    }
    
    return components;
  }

  /**
   * Find components using regex (fallback when AST is not available)
   */
  private findComponentsWithRegex(content: string, filePath: string): ComponentRefInfo[] {
    const components: ComponentRefInfo[] = [];
    const seenComponents = new Set<string>();
    
    // Arrow function: const Button = (...) => ...
    const arrowPattern = /(?:export\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*(?::\s*[^=]+)?\s*=\s*(?:React\.)?(?:forwardRef\s*(?:<[^>]*>)?\s*\()?\s*\(/g;
    // Function declaration: function Button(...) { ... }
    const functionPattern = /(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g;
    
    const processMatch = (match: RegExpExecArray, _pattern: RegExp) => {
      const componentName = match[1];
      if (!componentName || seenComponents.has(componentName)) {return;}
      
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      
      // Get component body (simplified)
      const startIndex = match.index;
      const endIndex = Math.min(startIndex + 5000, content.length);
      const componentText = content.slice(startIndex, endIndex);
      
      // Check if it looks like a React component
      if (componentText.includes('<') && (componentText.includes('/>') || componentText.includes('</'))) {
        seenComponents.add(componentName);
        const info = analyzeComponentRefs(
          componentText,
          content,
          filePath,
          componentName,
          lineNumber,
          this.config
        );
        components.push(info);
      }
    };
    
    let match;
    while ((match = arrowPattern.exec(content)) !== null) {
      processMatch(match, arrowPattern);
    }
    
    while ((match = functionPattern.exec(content)) !== null) {
      processMatch(match, functionPattern);
    }
    
    return components;
  }


  /**
   * Create a pattern match for a ref pattern
   */
  private createPatternMatch(
    file: string,
    pattern: RefForwardingPattern,
    count: number,
    analysis: RefForwardingAnalysis
  ): PatternMatch {
    const total = Object.values(analysis.patternCounts).reduce((a, b) => a + b, 0) - analysis.patternCounts['none'];
    const confidence = total > 0 ? count / total : 0;

    return {
      patternId: `ref-forwarding-${pattern}`,
      location: { file, line: 1, column: 1 },
      confidence,
      isOutlier: confidence < 0.2,
    };
  }

  /**
   * Create a violation for a ref issue
   */
  private createViolation(
    file: string,
    component: ComponentRefInfo,
    issue: RefIssue
  ): Violation {
    const range: Range = {
      start: { line: issue.line, character: issue.column },
      end: { line: issue.line, character: issue.column + 10 },
    };

    const quickFix = this.generateQuickFixForIssue(issue, component);
    
    const violation: Violation = {
      id: `ref-forwarding-${component.componentName}-${issue.type}-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'components/ref-forwarding',
      severity: issue.severity,
      file,
      range,
      message: `${component.componentName}: ${issue.description}`,
      expected: 'Proper ref forwarding pattern',
      actual: getIssueDescription(issue.type),
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
    
    if (quickFix) {
      violation.quickFix = quickFix;
    }
    
    return violation;
  }

  /**
   * Generate a quick fix for a ref issue
   */
  private generateQuickFixForIssue(issue: RefIssue, component: ComponentRefInfo): QuickFix | undefined {
    switch (issue.type) {
      case 'missing-forwardRef':
        return {
          title: `Wrap ${component.componentName} with forwardRef`,
          kind: 'quickfix',
          edit: { changes: {} },
          isPreferred: true,
          confidence: 0.8,
          preview: `const ${component.componentName} = forwardRef((props, ref) => { ... })`,
        };
      case 'imperative-without-forwardRef':
        return {
          title: `Add forwardRef wrapper to ${component.componentName}`,
          kind: 'quickfix',
          edit: { changes: {} },
          isPreferred: true,
          confidence: 0.9,
          preview: `const ${component.componentName} = forwardRef((props, ref) => { useImperativeHandle(ref, ...) })`,
        };
      case 'unused-ref':
        return {
          title: 'Remove unused ref',
          kind: 'quickfix',
          edit: { changes: {} },
          isPreferred: false,
          confidence: 0.7,
          preview: 'Remove the unused useRef declaration',
        };
      default:
        return undefined;
    }
  }

  /**
   * Generate a quick fix for a violation
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    if (violation.quickFix) {
      return violation.quickFix;
    }
    return null;
  }
}


// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new RefForwardingDetector instance
 */
export function createRefForwardingDetector(
  config?: Partial<RefForwardingConfig>
): RefForwardingDetector {
  return new RefForwardingDetector(config);
}
