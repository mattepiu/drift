/**
 * Composition Detector - Component composition pattern detection
 *
 * Detects composition patterns including children prop usage, render props,
 * Higher-Order Components (HOCs), compound components, slot-based composition,
 * Provider/Consumer patterns, and controlled vs uncontrolled components.
 *
 * @requirements 8.6 - THE Component_Detector SHALL detect component composition patterns
 */

import { ASTDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range, ASTNode } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of composition patterns
 */
export type CompositionPattern =
  | 'children-prop'        // Basic composition using children prop
  | 'render-props'         // Render props pattern (render, children as function)
  | 'hoc'                  // Higher-Order Component pattern
  | 'compound-component'   // Compound component pattern (Parent.Child)
  | 'slot-based'           // Slot-based composition (named slots)
  | 'provider-consumer'    // Provider/Consumer pattern (Context)
  | 'controlled'           // Controlled component pattern
  | 'uncontrolled'         // Uncontrolled component pattern
  | 'forwarded-ref'        // forwardRef composition
  | 'none';                // No composition pattern detected

/**
 * Types of composition anti-patterns
 */
export type CompositionAntiPattern =
  | 'deeply-nested-hocs'       // Multiple HOCs wrapped around component
  | 'prop-drilling'            // Props passed through multiple levels
  | 'missing-children'         // Component should accept children but doesn't
  | 'overuse-render-props'     // Too many render props in one component
  | 'mixed-controlled'         // Mixing controlled and uncontrolled patterns
  | 'excessive-context';       // Too many context providers nested


/**
 * Information about a composition pattern usage
 */
export interface CompositionUsageInfo {
  /** Type of composition pattern */
  pattern: CompositionPattern;
  /** Component name where pattern is used */
  componentName: string;
  /** Line number where pattern is detected */
  line: number;
  /** Column number */
  column: number;
  /** Additional details about the pattern */
  details: CompositionDetails;
}

/**
 * Details about a specific composition pattern
 */
export interface CompositionDetails {
  /** For render props: the prop names used */
  renderPropNames?: string[];
  /** For HOCs: the HOC names wrapping the component */
  hocNames?: string[];
  /** For compound components: the sub-component names */
  subComponentNames?: string[];
  /** For slots: the slot names */
  slotNames?: string[];
  /** For controlled: the controlled prop names */
  controlledProps?: string[];
  /** For provider: the context name */
  contextName?: string;
  /** Nesting depth (for HOCs, providers) */
  nestingDepth?: number;
}

/**
 * Information about a component's composition patterns
 */
export interface ComponentCompositionInfo {
  /** Component name */
  componentName: string;
  /** File path */
  filePath: string;
  /** Line number where component is defined */
  line: number;
  /** Column number */
  column: number;
  /** Composition patterns used */
  patterns: CompositionUsageInfo[];
  /** Anti-patterns detected */
  antiPatterns: CompositionAntiPatternInfo[];
  /** Whether component accepts children */
  acceptsChildren: boolean;
  /** Whether component uses render props */
  usesRenderProps: boolean;
  /** Whether component is a HOC */
  isHOC: boolean;
  /** Whether component is part of compound component */
  isCompoundComponent: boolean;
  /** Whether component is controlled */
  isControlled: boolean;
}


/**
 * Information about a detected anti-pattern
 */
export interface CompositionAntiPatternInfo {
  /** Type of anti-pattern */
  type: CompositionAntiPattern;
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
 * Analysis of composition patterns in a project
 */
export interface CompositionAnalysis {
  /** All analyzed components */
  components: ComponentCompositionInfo[];
  /** Dominant composition pattern */
  dominantPattern: CompositionPattern;
  /** Pattern usage counts */
  patternCounts: Record<CompositionPattern, number>;
  /** Confidence score */
  confidence: number;
  /** Components with anti-patterns */
  componentsWithAntiPatterns: ComponentCompositionInfo[];
  /** Overall composition health score (0-1) */
  healthScore: number;
}

/**
 * Configuration for composition pattern detection
 */
export interface CompositionConfig {
  /** Maximum HOC nesting depth before flagging */
  maxHOCDepth: number;
  /** Maximum render props per component */
  maxRenderProps: number;
  /** Maximum context providers nesting */
  maxContextNesting: number;
  /** Whether to detect controlled/uncontrolled patterns */
  detectControlledPatterns: boolean;
  /** Whether to flag prop drilling */
  flagPropDrilling: boolean;
}


// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for composition pattern detection
 */
export const DEFAULT_COMPOSITION_CONFIG: CompositionConfig = {
  maxHOCDepth: 3,
  maxRenderProps: 3,
  maxContextNesting: 4,
  detectControlledPatterns: true,
  flagPropDrilling: true,
};

/**
 * Common HOC patterns
 */
export const HOC_PATTERNS = [
  'withRouter',
  'withStyles',
  'withTheme',
  'withAuth',
  'withLoading',
  'withErrorBoundary',
  'connect',
  'memo',
  'forwardRef',
  'observer',
] as const;

/**
 * Common render prop names
 */
export const RENDER_PROP_NAMES = [
  'render',
  'children',
  'renderItem',
  'renderHeader',
  'renderFooter',
  'renderEmpty',
  'renderLoading',
  'renderError',
  'component',
] as const;

/**
 * Controlled component prop patterns
 */
export const CONTROLLED_PROP_PATTERNS = [
  { value: 'value', onChange: 'onChange' },
  { value: 'checked', onChange: 'onChange' },
  { value: 'selected', onChange: 'onSelect' },
  { value: 'open', onChange: 'onOpenChange' },
  { value: 'visible', onChange: 'onVisibleChange' },
  { value: 'expanded', onChange: 'onExpandedChange' },
] as const;

/**
 * Uncontrolled component prop patterns
 */
export const UNCONTROLLED_PROP_PATTERNS = [
  'defaultValue',
  'defaultChecked',
  'defaultSelected',
  'defaultOpen',
  'defaultVisible',
  'defaultExpanded',
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
// Helper Functions - Children Prop Detection
// ============================================================================

/**
 * Detect children prop usage in a component
 */
export function detectChildrenProp(nodeText: string): CompositionUsageInfo | null {
  // Check for children in props destructuring
  const hasChildrenDestructured = /\{\s*[^}]*\bchildren\b[^}]*\}/.test(nodeText);
  
  // Check for props.children usage
  const hasPropsChildren = /props\.children/.test(nodeText);
  
  // Check for children being rendered
  const rendersChildren = /\{children\}|\{props\.children\}/.test(nodeText);
  
  // Check for React.Children usage
  const usesReactChildren = /React\.Children\.|Children\./.test(nodeText);
  
  if (hasChildrenDestructured || hasPropsChildren || rendersChildren || usesReactChildren) {
    const line = nodeText.split('\n').findIndex(l => 
      /children/.test(l)
    ) + 1;
    
    return {
      pattern: 'children-prop',
      componentName: '',
      line,
      column: 1,
      details: {},
    };
  }
  
  return null;
}

/**
 * Check if component accepts children prop
 */
export function acceptsChildrenProp(nodeText: string): boolean {
  // Check for children in type definition
  const hasChildrenType = /children\s*[?:]?\s*:?\s*(?:React\.)?(?:ReactNode|ReactElement|JSX\.Element)/.test(nodeText);
  
  // Check for PropsWithChildren
  const hasPropsWithChildren = /PropsWithChildren/.test(nodeText);
  
  // Check for children in destructuring or usage
  const hasChildrenUsage = /\bchildren\b/.test(nodeText);
  
  return hasChildrenType || hasPropsWithChildren || hasChildrenUsage;
}


// ============================================================================
// Helper Functions - Render Props Detection
// ============================================================================

/**
 * Detect render props pattern in a component
 */
export function detectRenderProps(nodeText: string): CompositionUsageInfo | null {
  const renderPropNames: string[] = [];
  
  // Check for render prop in props
  for (const propName of RENDER_PROP_NAMES) {
    // Match: render={...}, renderItem={...}, etc.
    const propPattern = new RegExp(`\\b${propName}\\s*[=:]\\s*\\{?\\s*\\(?`, 'g');
    if (propPattern.test(nodeText)) {
      renderPropNames.push(propName);
    }
  }
  
  // Check for children as function pattern
  const childrenAsFunction = /children\s*\(\s*[^)]*\s*\)/.test(nodeText) ||
                             /\{children\s*&&\s*children\s*\(/.test(nodeText) ||
                             /typeof\s+children\s*===\s*['"]function['"]/.test(nodeText);
  
  if (childrenAsFunction && !renderPropNames.includes('children')) {
    renderPropNames.push('children');
  }
  
  // Check for render prop being called
  const renderPropCalls = nodeText.match(/\b(render\w*)\s*\(\s*[^)]*\s*\)/g);
  if (renderPropCalls) {
    for (const call of renderPropCalls) {
      const match = call.match(/\b(render\w*)\s*\(/);
      if (match?.[1] && !renderPropNames.includes(match[1])) {
        renderPropNames.push(match[1]);
      }
    }
  }
  
  if (renderPropNames.length > 0) {
    const line = nodeText.split('\n').findIndex(l => 
      renderPropNames.some(name => l.includes(name))
    ) + 1;
    
    return {
      pattern: 'render-props',
      componentName: '',
      line,
      column: 1,
      details: {
        renderPropNames,
      },
    };
  }
  
  return null;
}


// ============================================================================
// Helper Functions - HOC Detection
// ============================================================================

/**
 * Detect Higher-Order Component pattern
 */
export function detectHOC(content: string): CompositionUsageInfo[] {
  const results: CompositionUsageInfo[] = [];
  
  // Pattern 1: export default withX(withY(Component))
  const exportHOCPattern = /export\s+default\s+((?:with\w+|connect|memo|observer|forwardRef)\s*\([^)]*\))+/g;
  let match;
  
  while ((match = exportHOCPattern.exec(content)) !== null) {
    const hocChain = match[1];
    if (!hocChain) {continue;}
    
    const hocNames = extractHOCNames(hocChain);
    
    if (hocNames.length > 0) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      results.push({
        pattern: 'hoc',
        componentName: '',
        line,
        column: 1,
        details: {
          hocNames,
          nestingDepth: hocNames.length,
        },
      });
    }
  }
  
  // Pattern 2: const EnhancedComponent = withX(Component)
  const constHOCPattern = /const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*((?:with\w+|connect|memo|observer|forwardRef)\s*\([^)]*\))+/g;
  
  while ((match = constHOCPattern.exec(content)) !== null) {
    const hocChain = match[2] || '';
    const hocNames = extractHOCNames(hocChain);
    
    if (hocNames.length > 0) {
      const beforeMatch = content.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      results.push({
        pattern: 'hoc',
        componentName: match[1] || '',
        line,
        column: 1,
        details: {
          hocNames,
          nestingDepth: hocNames.length,
        },
      });
    }
  }
  
  // Pattern 3: Function that returns a component (HOC definition)
  const hocDefinitionPattern = /(?:function|const)\s+with([A-Z][a-zA-Z0-9]*)\s*[=(<]/g;
  
  while ((match = hocDefinitionPattern.exec(content)) !== null) {
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    results.push({
      pattern: 'hoc',
      componentName: `with${match[1]}`,
      line,
      column: 1,
      details: {
        hocNames: [`with${match[1]}`],
        nestingDepth: 1,
      },
    });
  }
  
  return results;
}

/**
 * Extract HOC names from a chain like withA(withB(Component))
 */
export function extractHOCNames(hocChain: string): string[] {
  const names: string[] = [];
  const pattern = /(with\w+|connect|memo|observer|forwardRef)\s*\(/g;
  let match;
  
  while ((match = pattern.exec(hocChain)) !== null) {
    if (match[1]) {
      names.push(match[1]);
    }
  }
  
  return names;
}


// ============================================================================
// Helper Functions - Compound Component Detection
// ============================================================================

/**
 * Detect compound component pattern
 */
export function detectCompoundComponent(content: string): CompositionUsageInfo[] {
  const results: CompositionUsageInfo[] = [];
  
  // Pattern 1: Component.SubComponent = ...
  const subComponentPattern = /([A-Z][a-zA-Z0-9]*)\.([A-Z][a-zA-Z0-9]*)\s*=/g;
  const subComponents = new Map<string, string[]>();
  let match;
  
  while ((match = subComponentPattern.exec(content)) !== null) {
    const parentName = match[1];
    const subName = match[2];
    
    if (parentName && subName) {
      if (!subComponents.has(parentName)) {
        subComponents.set(parentName, []);
      }
      subComponents.get(parentName)?.push(subName);
    }
  }
  
  // Create results for each compound component
  for (const [parentName, subs] of subComponents) {
    const patternMatch = content.match(new RegExp(`${parentName}\\.${subs[0]}\\s*=`));
    const line = patternMatch 
      ? content.slice(0, patternMatch.index).split('\n').length 
      : 1;
    
    results.push({
      pattern: 'compound-component',
      componentName: parentName,
      line,
      column: 1,
      details: {
        subComponentNames: subs,
      },
    });
  }
  
  // Pattern 2: Usage of compound components <Parent.Child />
  const usagePattern = /<([A-Z][a-zA-Z0-9]*)\.([A-Z][a-zA-Z0-9]*)/g;
  const usedCompounds = new Set<string>();
  
  while ((match = usagePattern.exec(content)) !== null) {
    const parentName = match[1];
    if (parentName && !subComponents.has(parentName)) {
      usedCompounds.add(parentName);
    }
  }
  
  return results;
}

/**
 * Check if component is part of a compound component pattern
 */
export function isCompoundComponentPart(componentName: string, content: string): boolean {
  // Check if this component has sub-components attached
  const hasSubComponents = new RegExp(`${componentName}\\.[A-Z][a-zA-Z0-9]*\\s*=`).test(content);
  
  // Check if this component is used as Parent.Child
  const isUsedAsCompound = new RegExp(`<${componentName}\\.[A-Z]`).test(content);
  
  return hasSubComponents || isUsedAsCompound;
}


// ============================================================================
// Helper Functions - Slot-Based Composition Detection
// ============================================================================

/**
 * Detect slot-based composition pattern
 */
export function detectSlotBasedComposition(nodeText: string): CompositionUsageInfo | null {
  const slotNames: string[] = [];
  const slotKeywords = ['header', 'footer', 'sidebar', 'content', 'left', 'right', 'top', 'bottom', 'prefix', 'suffix', 'icon', 'label', 'title', 'description', 'actions', 'extra'];
  
  // Pattern 1: Named slot props in destructuring ({ header, footer, sidebar })
  const destructuringMatch = nodeText.match(/\(\s*\{\s*([^}]+)\s*\}/);
  if (destructuringMatch?.[1]) {
    const propsStr = destructuringMatch[1];
    const props = propsStr.split(',').map(p => p.trim().split(/[=:]/)[0]?.trim() || '');
    
    for (const prop of props) {
      const propLower = prop.toLowerCase();
      if (slotKeywords.includes(propLower) && !slotNames.includes(propLower)) {
        slotNames.push(propLower);
      }
    }
  }
  
  // Pattern 2: Named slot props in JSX (header={...}, footer={...})
  for (const keyword of slotKeywords) {
    const pattern = new RegExp(`\\b${keyword}\\s*[=:]`, 'gi');
    if (pattern.test(nodeText) && !slotNames.includes(keyword)) {
      slotNames.push(keyword);
    }
  }
  
  // Pattern 3: Render slot props (renderHeader, renderFooter, etc.)
  const renderSlotPattern = /\b(render[A-Z][a-zA-Z]*)\s*[=:,)]/g;
  let match;
  while ((match = renderSlotPattern.exec(nodeText)) !== null) {
    if (match[1]) {
      const slotName = match[1].replace(/^render/, '').toLowerCase();
      if (!slotNames.includes(slotName)) {
        slotNames.push(slotName);
      }
    }
  }
  
  // Pattern 4: Render slot props in destructuring ({ renderHeader, renderFooter })
  if (destructuringMatch?.[1]) {
    const propsStr = destructuringMatch[1];
    const renderPropMatches = propsStr.matchAll(/\b(render[A-Z][a-zA-Z]*)\b/g);
    for (const renderMatch of renderPropMatches) {
      if (renderMatch[1]) {
        const slotName = renderMatch[1].replace(/^render/, '').toLowerCase();
        if (!slotNames.includes(slotName)) {
          slotNames.push(slotName);
        }
      }
    }
  }
  
  // Pattern 5: Slot component usage (<Slot name="..." />)
  const slotComponentPattern = /<Slot\s+name\s*=\s*["']([^"']+)["']/g;
  while ((match = slotComponentPattern.exec(nodeText)) !== null) {
    if (match[1] && !slotNames.includes(match[1])) {
      slotNames.push(match[1]);
    }
  }
  
  if (slotNames.length >= 2) {
    return {
      pattern: 'slot-based',
      componentName: '',
      line: 1,
      column: 1,
      details: {
        slotNames,
      },
    };
  }
  
  return null;
}


// ============================================================================
// Helper Functions - Provider/Consumer Detection
// ============================================================================

/**
 * Detect Provider/Consumer pattern
 */
export function detectProviderConsumer(content: string): CompositionUsageInfo[] {
  const results: CompositionUsageInfo[] = [];
  
  // Pattern 1: Context.Provider usage
  const providerPattern = /<([A-Z][a-zA-Z0-9]*(?:Context)?)\s*\.\s*Provider/g;
  let match;
  
  while ((match = providerPattern.exec(content)) !== null) {
    const contextName = match[1];
    if (!contextName) {continue;}
    
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    results.push({
      pattern: 'provider-consumer',
      componentName: '',
      line,
      column: 1,
      details: {
        contextName,
      },
    });
  }
  
  // Pattern 2: Context.Consumer usage
  const consumerPattern = /<([A-Z][a-zA-Z0-9]*(?:Context)?)\s*\.\s*Consumer/g;
  
  while ((match = consumerPattern.exec(content)) !== null) {
    const contextName = match[1];
    if (!contextName) {continue;}
    
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    // Check if we already have this context
    const existing = results.find(r => r.details.contextName === contextName);
    if (!existing) {
      results.push({
        pattern: 'provider-consumer',
        componentName: '',
        line,
        column: 1,
        details: {
          contextName,
        },
      });
    }
  }
  
  // Pattern 3: createContext usage
  const createContextPattern = /const\s+([A-Z][a-zA-Z0-9]*(?:Context)?)\s*=\s*(?:React\.)?createContext/g;
  
  while ((match = createContextPattern.exec(content)) !== null) {
    const contextName = match[1];
    if (!contextName) {continue;}
    
    const beforeMatch = content.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    results.push({
      pattern: 'provider-consumer',
      componentName: '',
      line,
      column: 1,
      details: {
        contextName,
      },
    });
  }
  
  return results;
}

/**
 * Count nested providers in content
 */
export function countNestedProviders(content: string): number {
  const providerMatches = content.match(/<[A-Z][a-zA-Z0-9]*(?:Context)?\s*\.\s*Provider/g);
  return providerMatches ? providerMatches.length : 0;
}


// ============================================================================
// Helper Functions - Controlled/Uncontrolled Detection
// ============================================================================

/**
 * Detect controlled component pattern
 */
export function detectControlledPattern(nodeText: string): CompositionUsageInfo | null {
  const controlledProps: string[] = [];
  
  for (const pattern of CONTROLLED_PROP_PATTERNS) {
    const valuePattern = new RegExp(`\\b${pattern.value}\\s*[=:]`, 'g');
    const onChangePattern = new RegExp(`\\b${pattern.onChange}\\s*[=:]`, 'g');
    
    if (valuePattern.test(nodeText) && onChangePattern.test(nodeText)) {
      controlledProps.push(pattern.value);
    }
  }
  
  if (controlledProps.length > 0) {
    return {
      pattern: 'controlled',
      componentName: '',
      line: 1,
      column: 1,
      details: {
        controlledProps,
      },
    };
  }
  
  return null;
}

/**
 * Detect uncontrolled component pattern
 */
export function detectUncontrolledPattern(nodeText: string): CompositionUsageInfo | null {
  const uncontrolledProps: string[] = [];
  
  for (const propName of UNCONTROLLED_PROP_PATTERNS) {
    const pattern = new RegExp(`\\b${propName}\\s*[=:]`, 'g');
    if (pattern.test(nodeText)) {
      uncontrolledProps.push(propName);
    }
  }
  
  // Also check for ref usage without value prop (uncontrolled form elements)
  const hasRef = /\bref\s*[=:]/.test(nodeText);
  const hasValue = /\bvalue\s*[=:]/.test(nodeText);
  
  if (hasRef && !hasValue) {
    uncontrolledProps.push('ref');
  }
  
  if (uncontrolledProps.length > 0) {
    return {
      pattern: 'uncontrolled',
      componentName: '',
      line: 1,
      column: 1,
      details: {
        controlledProps: uncontrolledProps,
      },
    };
  }
  
  return null;
}

/**
 * Check if component mixes controlled and uncontrolled patterns
 */
export function hasMixedControlledPatterns(nodeText: string): boolean {
  const hasControlled = detectControlledPattern(nodeText) !== null;
  const hasUncontrolled = detectUncontrolledPattern(nodeText) !== null;
  
  return hasControlled && hasUncontrolled;
}


// ============================================================================
// Helper Functions - Anti-Pattern Detection
// ============================================================================

/**
 * Detect composition anti-patterns
 */
export function detectAntiPatterns(
  nodeText: string,
  content: string,
  config: CompositionConfig
): CompositionAntiPatternInfo[] {
  const antiPatterns: CompositionAntiPatternInfo[] = [];
  
  // Check for deeply nested HOCs
  const hocUsages = detectHOC(content);
  for (const hoc of hocUsages) {
    if (hoc.details.nestingDepth && hoc.details.nestingDepth > config.maxHOCDepth) {
      antiPatterns.push({
        type: 'deeply-nested-hocs',
        description: `Component has ${hoc.details.nestingDepth} nested HOCs (max: ${config.maxHOCDepth})`,
        severity: 'warning',
        suggestion: 'Consider using hooks or composition instead of deeply nested HOCs',
        line: hoc.line,
        column: 1,
      });
    }
  }
  
  // Check for overuse of render props
  const renderProps = detectRenderProps(nodeText);
  if (renderProps?.details.renderPropNames) {
    const count = renderProps.details.renderPropNames.length;
    if (count > config.maxRenderProps) {
      antiPatterns.push({
        type: 'overuse-render-props',
        description: `Component has ${count} render props (max: ${config.maxRenderProps})`,
        severity: 'info',
        suggestion: 'Consider splitting into smaller components or using composition',
        line: renderProps.line,
        column: 1,
      });
    }
  }
  
  // Check for excessive context nesting
  const providerCount = countNestedProviders(content);
  if (providerCount > config.maxContextNesting) {
    antiPatterns.push({
      type: 'excessive-context',
      description: `File has ${providerCount} nested context providers (max: ${config.maxContextNesting})`,
      severity: 'warning',
      suggestion: 'Consider combining related contexts or using a state management library',
      line: 1,
      column: 1,
    });
  }
  
  // Check for mixed controlled/uncontrolled patterns
  if (config.detectControlledPatterns && hasMixedControlledPatterns(nodeText)) {
    antiPatterns.push({
      type: 'mixed-controlled',
      description: 'Component mixes controlled and uncontrolled patterns',
      severity: 'warning',
      suggestion: 'Use either controlled or uncontrolled pattern consistently',
      line: 1,
      column: 1,
    });
  }
  
  // Check for missing children prop when component renders children
  const rendersChildElements = /<[A-Z][a-zA-Z0-9]*[^>]*>[^<]+<\/[A-Z]/.test(nodeText);
  const acceptsChildren = acceptsChildrenProp(nodeText);
  if (rendersChildElements && !acceptsChildren) {
    // This might indicate missing children prop
    // Only flag if component seems to be a wrapper
    const isWrapper = /return\s*\(\s*<[^>]+>\s*\{/.test(nodeText);
    if (isWrapper) {
      antiPatterns.push({
        type: 'missing-children',
        description: 'Component appears to be a wrapper but does not accept children prop',
        severity: 'info',
        suggestion: 'Consider adding children prop to allow composition',
        line: 1,
        column: 1,
      });
    }
  }
  
  return antiPatterns;
}


// ============================================================================
// Helper Functions - Analysis
// ============================================================================

/**
 * Analyze a single component's composition patterns
 */
export function analyzeComponentComposition(
  node: ASTNode,
  content: string,
  filePath: string,
  config: CompositionConfig
): ComponentCompositionInfo | null {
  const componentName = getComponentName(node, content);
  if (!componentName) {
    return null;
  }
  
  const nodeText = node.text;
  const patterns: CompositionUsageInfo[] = [];
  
  // Detect children prop usage
  const childrenUsage = detectChildrenProp(nodeText);
  if (childrenUsage) {
    childrenUsage.componentName = componentName;
    patterns.push(childrenUsage);
  }
  
  // Detect render props
  const renderPropsUsage = detectRenderProps(nodeText);
  if (renderPropsUsage) {
    renderPropsUsage.componentName = componentName;
    patterns.push(renderPropsUsage);
  }
  
  // Detect slot-based composition
  const slotUsage = detectSlotBasedComposition(nodeText);
  if (slotUsage) {
    slotUsage.componentName = componentName;
    patterns.push(slotUsage);
  }
  
  // Detect controlled pattern
  if (config.detectControlledPatterns) {
    const controlledUsage = detectControlledPattern(nodeText);
    if (controlledUsage) {
      controlledUsage.componentName = componentName;
      patterns.push(controlledUsage);
    }
    
    const uncontrolledUsage = detectUncontrolledPattern(nodeText);
    if (uncontrolledUsage) {
      uncontrolledUsage.componentName = componentName;
      patterns.push(uncontrolledUsage);
    }
  }
  
  // Detect HOCs (from full content, not just node)
  const hocUsages = detectHOC(content);
  for (const hoc of hocUsages) {
    if (hoc.componentName === componentName || hoc.componentName === '') {
      hoc.componentName = componentName;
      patterns.push(hoc);
    }
  }
  
  // Detect compound components
  const compoundUsages = detectCompoundComponent(content);
  for (const compound of compoundUsages) {
    if (compound.componentName === componentName) {
      patterns.push(compound);
    }
  }
  
  // Detect provider/consumer
  const providerUsages = detectProviderConsumer(nodeText);
  for (const provider of providerUsages) {
    provider.componentName = componentName;
    patterns.push(provider);
  }
  
  // Detect anti-patterns
  const antiPatterns = detectAntiPatterns(nodeText, content, config);
  
  return {
    componentName,
    filePath,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    patterns,
    antiPatterns,
    acceptsChildren: acceptsChildrenProp(nodeText),
    usesRenderProps: renderPropsUsage !== null,
    isHOC: hocUsages.some(h => h.componentName === componentName),
    isCompoundComponent: isCompoundComponentPart(componentName, content),
    isControlled: detectControlledPattern(nodeText) !== null,
  };
}


/**
 * Find dominant pattern from a list
 */
function findDominantPattern(
  patterns: CompositionPattern[]
): { dominant: CompositionPattern; confidence: number } {
  const counts = new Map<CompositionPattern, number>();
  
  for (const pattern of patterns) {
    if (pattern !== 'none') {
      counts.set(pattern, (counts.get(pattern) || 0) + 1);
    }
  }
  
  let dominant: CompositionPattern = 'none';
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
 * Analyze composition patterns across multiple components
 */
export function analyzeCompositionPatterns(
  components: ComponentCompositionInfo[]
): CompositionAnalysis {
  if (components.length === 0) {
    return {
      components: [],
      dominantPattern: 'none',
      patternCounts: {
        'children-prop': 0,
        'render-props': 0,
        'hoc': 0,
        'compound-component': 0,
        'slot-based': 0,
        'provider-consumer': 0,
        'controlled': 0,
        'uncontrolled': 0,
        'forwarded-ref': 0,
        'none': 0,
      },
      confidence: 0,
      componentsWithAntiPatterns: [],
      healthScore: 1.0,
    };
  }
  
  // Collect all patterns
  const allPatterns: CompositionPattern[] = [];
  const patternCounts: Record<CompositionPattern, number> = {
    'children-prop': 0,
    'render-props': 0,
    'hoc': 0,
    'compound-component': 0,
    'slot-based': 0,
    'provider-consumer': 0,
    'controlled': 0,
    'uncontrolled': 0,
    'forwarded-ref': 0,
    'none': 0,
  };
  
  for (const comp of components) {
    for (const pattern of comp.patterns) {
      allPatterns.push(pattern.pattern);
      patternCounts[pattern.pattern]++;
    }
    if (comp.patterns.length === 0) {
      patternCounts['none']++;
    }
  }
  
  // Find dominant pattern
  const { dominant, confidence } = findDominantPattern(allPatterns);
  
  // Find components with anti-patterns
  const componentsWithAntiPatterns = components.filter(c => c.antiPatterns.length > 0);
  
  // Calculate health score
  const totalAntiPatterns = components.reduce((sum, c) => sum + c.antiPatterns.length, 0);
  const healthScore = Math.max(0, 1 - (totalAntiPatterns / (components.length * 2)));
  
  return {
    components,
    dominantPattern: dominant,
    patternCounts,
    confidence,
    componentsWithAntiPatterns,
    healthScore,
  };
}


// ============================================================================
// Pattern Description Helpers
// ============================================================================

const ANTI_PATTERN_DESCRIPTIONS: Record<CompositionAntiPattern, string> = {
  'deeply-nested-hocs': 'deeply nested HOCs',
  'prop-drilling': 'prop drilling',
  'missing-children': 'missing children prop',
  'overuse-render-props': 'overuse of render props',
  'mixed-controlled': 'mixed controlled/uncontrolled patterns',
  'excessive-context': 'excessive context nesting',
};

// ============================================================================
// Composition Detector Class
// ============================================================================

/**
 * Detector for component composition patterns
 *
 * Identifies composition patterns including children prop usage, render props,
 * HOCs, compound components, and more. Reports anti-patterns and suggests
 * improvements.
 *
 * @requirements 8.6 - THE Component_Detector SHALL detect component composition patterns
 */
export class CompositionDetector extends ASTDetector {
  readonly id = 'components/composition';
  readonly category = 'components' as const;
  readonly subcategory = 'composition';
  readonly name = 'Composition Pattern Detector';
  readonly description = 'Detects component composition patterns (children, render props, HOCs, compound components) and identifies anti-patterns';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];
  
  private config: CompositionConfig;
  
  constructor(config: Partial<CompositionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_COMPOSITION_CONFIG, ...config };
  }

  /**
   * Detect composition patterns in the project
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
    const analysis = analyzeCompositionPatterns(componentInfos);

    // Create pattern matches for detected patterns
    for (const [patternType, count] of Object.entries(analysis.patternCounts)) {
      if (count > 0 && patternType !== 'none') {
        patterns.push(this.createPatternMatch(
          context.file,
          patternType as CompositionPattern,
          count,
          analysis
        ));
      }
    }

    // Generate violations for anti-patterns
    for (const comp of analysis.componentsWithAntiPatterns) {
      if (comp.filePath === context.file) {
        for (const antiPattern of comp.antiPatterns) {
          violations.push(this.createAntiPatternViolation(
            context.file,
            comp,
            antiPattern
          ));
        }
      }
    }

    return this.createResult(patterns, violations, analysis.confidence);
  }


  /**
   * Find all React components in a file
   */
  private findComponentsInFile(context: DetectionContext): ComponentCompositionInfo[] {
    const components: ComponentCompositionInfo[] = [];
    
    if (context.ast) {
      // Use AST to find components
      const functionNodes = this.findNodesByTypes(context.ast, [
        'function_declaration',
        'arrow_function',
        'function_expression',
      ]);
      
      for (const node of functionNodes) {
        if (isReactComponent(node, context.content)) {
          const info = analyzeComponentComposition(
            node,
            context.content,
            context.file,
            this.config
          );
          if (info) {
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
  private findComponentsWithRegex(content: string, filePath: string): ComponentCompositionInfo[] {
    const components: ComponentCompositionInfo[] = [];
    
    // Pattern for arrow function components
    const arrowPattern = /(?:export\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*(?::\s*(?:React\.)?(?:FC|FunctionComponent)\s*<[^>]*>\s*)?=\s*\(/g;
    // Pattern for function declaration components
    const functionPattern = /(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g;
    
    const processMatch = (match: RegExpExecArray, componentName: string) => {
      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      
      // Get component body (simplified)
      const startIndex = match.index;
      let braceCount = 0;
      let endIndex = startIndex;
      let foundStart = false;
      
      for (let i = startIndex; i < content.length && i < startIndex + 10000; i++) {
        const char = content[i];
        if (char === '{') {
          braceCount++;
          foundStart = true;
        } else if (char === '}') {
          braceCount--;
          if (foundStart && braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
      
      const componentBody = content.slice(startIndex, endIndex);
      
      // Check if it's a React component (contains JSX)
      if (!componentBody.includes('<') || (!componentBody.includes('/>') && !componentBody.includes('</'))) {
        return;
      }
      
      const patterns: CompositionUsageInfo[] = [];
      
      // Detect patterns
      const childrenUsage = detectChildrenProp(componentBody);
      if (childrenUsage) {
        childrenUsage.componentName = componentName;
        patterns.push(childrenUsage);
      }
      
      const renderPropsUsage = detectRenderProps(componentBody);
      if (renderPropsUsage) {
        renderPropsUsage.componentName = componentName;
        patterns.push(renderPropsUsage);
      }
      
      const slotUsage = detectSlotBasedComposition(componentBody);
      if (slotUsage) {
        slotUsage.componentName = componentName;
        patterns.push(slotUsage);
      }
      
      if (this.config.detectControlledPatterns) {
        const controlledUsage = detectControlledPattern(componentBody);
        if (controlledUsage) {
          controlledUsage.componentName = componentName;
          patterns.push(controlledUsage);
        }
        
        const uncontrolledUsage = detectUncontrolledPattern(componentBody);
        if (uncontrolledUsage) {
          uncontrolledUsage.componentName = componentName;
          patterns.push(uncontrolledUsage);
        }
      }
      
      // Detect anti-patterns
      const antiPatterns = detectAntiPatterns(componentBody, content, this.config);
      
      components.push({
        componentName,
        filePath,
        line: lineNumber,
        column: 1,
        patterns,
        antiPatterns,
        acceptsChildren: acceptsChildrenProp(componentBody),
        usesRenderProps: renderPropsUsage !== null,
        isHOC: false,
        isCompoundComponent: isCompoundComponentPart(componentName, content),
        isControlled: detectControlledPattern(componentBody) !== null,
      });
    };
    
    let match;
    while ((match = arrowPattern.exec(content)) !== null) {
      if (match[1]) {
        processMatch(match, match[1]);
      }
    }
    
    while ((match = functionPattern.exec(content)) !== null) {
      if (match[1]) {
        processMatch(match, match[1]);
      }
    }
    
    // Also detect HOCs and compound components at file level
    const hocUsages = detectHOC(content);
    for (const hoc of hocUsages) {
      const existing = components.find(c => c.componentName === hoc.componentName);
      if (existing) {
        existing.patterns.push(hoc);
        existing.isHOC = true;
      }
    }
    
    const compoundUsages = detectCompoundComponent(content);
    for (const compound of compoundUsages) {
      const existing = components.find(c => c.componentName === compound.componentName);
      if (existing) {
        existing.patterns.push(compound);
        existing.isCompoundComponent = true;
      }
    }
    
    const providerUsages = detectProviderConsumer(content);
    for (const provider of providerUsages) {
      // Add to first component or create a placeholder
      if (components.length > 0 && components[0]) {
        components[0].patterns.push(provider);
      }
    }
    
    return components;
  }


  /**
   * Create a pattern match for a composition pattern
   */
  private createPatternMatch(
    file: string,
    patternType: CompositionPattern,
    count: number,
    analysis: CompositionAnalysis
  ): PatternMatch {
    const total = Object.values(analysis.patternCounts).reduce((a, b) => a + b, 0) - analysis.patternCounts['none'];
    const confidence = total > 0 ? count / total : 0;

    return {
      patternId: `composition-${patternType}`,
      location: { file, line: 1, column: 1 },
      confidence,
      isOutlier: confidence < 0.2,
    };
  }

  /**
   * Create a violation for an anti-pattern
   */
  private createAntiPatternViolation(
    file: string,
    component: ComponentCompositionInfo,
    antiPattern: CompositionAntiPatternInfo
  ): Violation {
    const range: Range = {
      start: { line: antiPattern.line, character: antiPattern.column },
      end: { line: antiPattern.line, character: antiPattern.column + 1 },
    };

    return {
      id: `composition-${component.componentName}-${antiPattern.type}-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'components/composition',
      severity: antiPattern.severity,
      file,
      range,
      message: `${component.componentName}: ${antiPattern.description}`,
      expected: 'Clean composition pattern',
      actual: ANTI_PATTERN_DESCRIPTIONS[antiPattern.type],
      explanation: antiPattern.suggestion,
      aiExplainAvailable: true,
      aiFixAvailable: antiPattern.type !== 'deeply-nested-hocs',
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  /**
   * Generate a quick fix for composition violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Extract anti-pattern type from violation
    // ID format: composition-ComponentName-antiPatternType-filePath
    // antiPatternType can contain hyphens (e.g., missing-children, mixed-controlled)
    const antiPatternMatch = violation.id.match(/composition-[A-Za-z0-9]+-([a-z]+-[a-z]+|[a-z]+)-/);
    if (!antiPatternMatch?.[1]) {
      return null;
    }

    const antiPatternType = antiPatternMatch[1] as CompositionAntiPattern;

    switch (antiPatternType) {
      case 'missing-children':
        return {
          title: 'Add children prop',
          kind: 'quickfix',
          edit: {
            changes: {},
            documentChanges: [],
          },
          isPreferred: true,
          confidence: 0.8,
          preview: 'Add children: React.ReactNode to props type',
        };

      case 'mixed-controlled':
        return {
          title: 'Convert to controlled component',
          kind: 'refactor',
          edit: {
            changes: {},
            documentChanges: [],
          },
          isPreferred: true,
          confidence: 0.7,
          preview: 'Remove default* props and use value/onChange pattern',
        };

      case 'overuse-render-props':
        return {
          title: 'Extract render props to separate components',
          kind: 'refactor',
          edit: {
            changes: {},
            documentChanges: [],
          },
          isPreferred: false,
          confidence: 0.6,
          preview: 'Split component into smaller, focused components',
        };

      case 'excessive-context':
        return {
          title: 'Combine related contexts',
          kind: 'refactor',
          edit: {
            changes: {},
            documentChanges: [],
          },
          isPreferred: false,
          confidence: 0.5,
          preview: 'Merge related context providers into a single provider',
        };

      default:
        return null;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CompositionDetector instance
 */
export function createCompositionDetector(
  config: Partial<CompositionConfig> = {}
): CompositionDetector {
  return new CompositionDetector(config);
}
