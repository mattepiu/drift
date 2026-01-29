/**
 * Near Duplicate Detector - Semantic similarity detection for abstraction candidates
 *
 * Detects semantically similar components that could be refactored into shared
 * abstractions. Unlike duplicate-detection.ts which focuses on AST structure,
 * this detector analyzes functional similarity including:
 * - Similar prop patterns
 * - Similar render patterns
 * - Similar state management
 * - Opportunities for shared hooks, HOCs, or render props
 *
 * @requirements 8.4 - THE Component_Detector SHALL detect near-duplicate components that should be abstracted
 */

import { ASTDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range, ASTNode, AST } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of abstraction opportunities
 */
export type AbstractionType =
  | 'shared-component'    // Components can be merged into a shared component with props
  | 'shared-hook'         // Common logic can be extracted to a custom hook
  | 'higher-order'        // Can use HOC pattern for shared behavior
  | 'render-props'        // Can use render props pattern
  | 'composition'         // Can use composition pattern
  | 'utility-function';   // Common logic can be extracted to utility functions

/**
 * Semantic features extracted from a component
 */
export interface SemanticFeatures {
  /** Component name */
  name: string;
  /** File path */
  filePath: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Props used by the component */
  props: PropFeature[];
  /** State variables used */
  stateVariables: StateFeature[];
  /** Hooks used */
  hooks: HookFeature[];
  /** Event handlers */
  eventHandlers: EventHandlerFeature[];
  /** JSX elements rendered */
  jsxElements: JSXElementFeature[];
  /** Conditional rendering patterns */
  conditionalPatterns: ConditionalPattern[];
  /** API/data fetching patterns */
  dataPatterns: DataPattern[];
  /** Source code */
  sourceCode: string;
}

/**
 * Feature representing a prop
 */
export interface PropFeature {
  /** Prop name */
  name: string;
  /** Whether prop has a default value */
  hasDefault: boolean;
  /** Whether prop is required */
  isRequired: boolean;
  /** Inferred type (if available) */
  inferredType?: string;
  /** Whether prop is a callback/function */
  isCallback: boolean;
  /** Whether prop is used for rendering children */
  isChildren: boolean;
}

/**
 * Feature representing state
 */
export interface StateFeature {
  /** State variable name */
  name: string;
  /** Setter function name */
  setter: string;
  /** Initial value (if detectable) */
  initialValue?: string;
  /** Type of state (useState, useReducer, etc.) */
  stateType: 'useState' | 'useReducer' | 'useRef' | 'other';
}

/**
 * Feature representing a hook usage
 */
export interface HookFeature {
  /** Hook name */
  name: string;
  /** Whether it's a built-in React hook */
  isBuiltIn: boolean;
  /** Dependencies (for useEffect, useMemo, etc.) */
  dependencies?: string[];
}

/**
 * Feature representing an event handler
 */
export interface EventHandlerFeature {
  /** Handler name */
  name: string;
  /** Event type (onClick, onChange, etc.) */
  eventType: string;
  /** Whether handler is inline or defined separately */
  isInline: boolean;
}

/**
 * Feature representing a JSX element
 */
export interface JSXElementFeature {
  /** Element tag name */
  tagName: string;
  /** Whether it's a custom component (PascalCase) */
  isComponent: boolean;
  /** Props passed to the element */
  props: string[];
  /** Nesting depth */
  depth: number;
}

/**
 * Conditional rendering pattern
 */
export interface ConditionalPattern {
  /** Type of conditional */
  type: 'ternary' | 'logical-and' | 'if-statement' | 'early-return';
  /** Condition variable/expression */
  condition: string;
}

/**
 * Data fetching/API pattern
 */
export interface DataPattern {
  /** Type of data pattern */
  type: 'fetch' | 'useQuery' | 'useSWR' | 'useEffect-fetch' | 'other';
  /** Whether loading state is handled */
  hasLoadingState: boolean;
  /** Whether error state is handled */
  hasErrorState: boolean;
}

/**
 * Near-duplicate pair with abstraction suggestion
 */
export interface NearDuplicatePair {
  /** First component */
  component1: SemanticFeatures;
  /** Second component */
  component2: SemanticFeatures;
  /** Overall semantic similarity score (0-1) */
  similarity: number;
  /** Breakdown of similarity by feature type */
  similarityBreakdown: SimilarityBreakdown;
  /** Suggested abstraction type */
  suggestedAbstraction: AbstractionType;
  /** Specific suggestions for refactoring */
  suggestions: AbstractionSuggestion[];
}

/**
 * Breakdown of similarity scores by feature type
 */
export interface SimilarityBreakdown {
  /** Props similarity */
  props: number;
  /** State similarity */
  state: number;
  /** Hooks similarity */
  hooks: number;
  /** Event handlers similarity */
  eventHandlers: number;
  /** JSX structure similarity */
  jsxStructure: number;
  /** Conditional patterns similarity */
  conditionalPatterns: number;
  /** Data patterns similarity */
  dataPatterns: number;
}

/**
 * Specific abstraction suggestion
 */
export interface AbstractionSuggestion {
  /** Type of abstraction */
  type: AbstractionType;
  /** Description of the suggestion */
  description: string;
  /** Confidence in this suggestion (0-1) */
  confidence: number;
  /** Shared features that can be abstracted */
  sharedFeatures: string[];
  /** Example code snippet (if applicable) */
  exampleCode?: string;
}

/**
 * Analysis result for near-duplicate detection
 */
export interface NearDuplicateAnalysis {
  /** All detected near-duplicate pairs */
  pairs: NearDuplicatePair[];
  /** Components grouped by abstraction opportunity */
  abstractionGroups: AbstractionGroup[];
  /** Total components analyzed */
  totalComponents: number;
  /** Components with abstraction opportunities */
  componentsWithOpportunities: number;
}

/**
 * Group of components that share abstraction opportunity
 */
export interface AbstractionGroup {
  /** Suggested abstraction type */
  abstractionType: AbstractionType;
  /** Components in this group */
  components: SemanticFeatures[];
  /** Shared features across all components */
  sharedFeatures: string[];
  /** Confidence score */
  confidence: number;
}

/**
 * Configuration for near-duplicate detection
 */
export interface NearDuplicateConfig {
  /** Minimum overall similarity threshold (0-1), default 0.6 */
  similarityThreshold: number;
  /** Minimum props similarity to consider, default 0.5 */
  minPropsSimilarity: number;
  /** Minimum JSX structure similarity, default 0.4 */
  minJsxSimilarity: number;
  /** Whether to detect hook extraction opportunities */
  detectHookOpportunities: boolean;
  /** Whether to detect HOC opportunities */
  detectHOCOpportunities: boolean;
  /** Weights for different feature types in overall similarity */
  weights: SimilarityWeights;
}

/**
 * Weights for calculating overall similarity
 */
export interface SimilarityWeights {
  props: number;
  state: number;
  hooks: number;
  eventHandlers: number;
  jsxStructure: number;
  conditionalPatterns: number;
  dataPatterns: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for near-duplicate detection
 */
export const DEFAULT_NEAR_DUPLICATE_CONFIG: NearDuplicateConfig = {
  similarityThreshold: 0.6,
  minPropsSimilarity: 0.5,
  minJsxSimilarity: 0.4,
  detectHookOpportunities: true,
  detectHOCOpportunities: true,
  weights: {
    props: 0.25,
    state: 0.15,
    hooks: 0.15,
    eventHandlers: 0.1,
    jsxStructure: 0.2,
    conditionalPatterns: 0.1,
    dataPatterns: 0.05,
  },
};

/**
 * Built-in React hooks
 */
export const REACT_HOOKS = new Set([
  'useState',
  'useEffect',
  'useContext',
  'useReducer',
  'useCallback',
  'useMemo',
  'useRef',
  'useImperativeHandle',
  'useLayoutEffect',
  'useDebugValue',
  'useDeferredValue',
  'useTransition',
  'useId',
  'useSyncExternalStore',
  'useInsertionEffect',
]);

/**
 * Common event handler patterns
 */
export const EVENT_HANDLER_PATTERNS = [
  'onClick',
  'onChange',
  'onSubmit',
  'onBlur',
  'onFocus',
  'onKeyDown',
  'onKeyUp',
  'onKeyPress',
  'onMouseEnter',
  'onMouseLeave',
  'onScroll',
  'onLoad',
  'onError',
] as const;

// ============================================================================
// Helper Functions - Feature Extraction
// ============================================================================

/**
 * Check if a node represents a React component
 */
export function isReactComponentNode(node: ASTNode, content: string): boolean {
  if (node.type === 'function_declaration' || 
      node.type === 'arrow_function' ||
      node.type === 'function_expression') {
    const name = extractComponentName(node, content);
    if (!name || !/^[A-Z]/.test(name)) {
      return false;
    }
    const nodeText = node.text;
    return nodeText.includes('<') && (nodeText.includes('/>') || nodeText.includes('</'));
  }
  return false;
}

/**
 * Extract component name from an AST node
 */
export function extractComponentName(node: ASTNode, content: string): string | undefined {
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

/**
 * Extract props from a component
 */
export function extractProps(node: ASTNode, _content: string): PropFeature[] {
  const props: PropFeature[] = [];
  const nodeText = node.text;
  
  // Extract from destructuring pattern: ({ prop1, prop2 = 'default', ...rest })
  const destructuringMatch = nodeText.match(/\(\s*\{\s*([^}]+)\s*\}/);
  if (destructuringMatch?.[1]) {
    const propsStr = destructuringMatch[1];
    const propParts = propsStr.split(',');
    
    for (const part of propParts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('...')) {continue;} // Skip rest spread
      
      // Match: propName, propName = default, propName: type
      const propMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*([^,]+))?/);
      if (propMatch?.[1]) {
        const propName = propMatch[1];
        const hasDefault = !!propMatch[2];
        
        props.push({
          name: propName,
          hasDefault,
          isRequired: !hasDefault,
          isCallback: propName.startsWith('on') || propName.startsWith('handle'),
          isChildren: propName === 'children',
        });
      }
    }
  }
  
  // Also check for props.propName access
  const directAccessMatches = nodeText.matchAll(/props\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  for (const match of directAccessMatches) {
    if (match[1] && !props.some(p => p.name === match[1])) {
      props.push({
        name: match[1],
        hasDefault: false,
        isRequired: true,
        isCallback: match[1].startsWith('on') || match[1].startsWith('handle'),
        isChildren: match[1] === 'children',
      });
    }
  }
  
  return props;
}

/**
 * Extract state variables from a component
 */
export function extractState(node: ASTNode): StateFeature[] {
  const state: StateFeature[] = [];
  const nodeText = node.text;
  
  // Match useState: const [value, setValue] = useState(initial)
  const useStateMatches = nodeText.matchAll(/const\s+\[\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\]\s*=\s*useState\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g);
  for (const match of useStateMatches) {
    if (match[1] && match[2]) {
      const feature: StateFeature = {
        name: match[1],
        setter: match[2],
        stateType: 'useState',
      };
      const initialValue = match[3]?.trim();
      if (initialValue) {
        feature.initialValue = initialValue;
      }
      state.push(feature);
    }
  }
  
  // Match useReducer: const [state, dispatch] = useReducer(reducer, initial)
  const useReducerMatches = nodeText.matchAll(/const\s+\[\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\]\s*=\s*useReducer/g);
  for (const match of useReducerMatches) {
    if (match[1] && match[2]) {
      state.push({
        name: match[1],
        setter: match[2],
        stateType: 'useReducer',
      });
    }
  }
  
  // Match useRef: const ref = useRef(initial)
  const useRefMatches = nodeText.matchAll(/const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*useRef\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g);
  for (const match of useRefMatches) {
    if (match[1]) {
      const feature: StateFeature = {
        name: match[1],
        setter: `${match[1]}.current`,
        stateType: 'useRef',
      };
      const initialValue = match[2]?.trim();
      if (initialValue) {
        feature.initialValue = initialValue;
      }
      state.push(feature);
    }
  }
  
  return state;
}

/**
 * Extract hooks used in a component
 */
export function extractHooks(node: ASTNode): HookFeature[] {
  const hooks: HookFeature[] = [];
  const nodeText = node.text;
  
  // Match hook calls: useXxx(...) or use_xxx(...)
  const hookMatches = nodeText.matchAll(/\b(use[A-Z][a-zA-Z0-9]*|use_[a-z][a-zA-Z0-9_]*)\s*\(/g);
  const seenHooks = new Set<string>();
  
  for (const match of hookMatches) {
    if (match[1] && !seenHooks.has(match[1])) {
      seenHooks.add(match[1]);
      const hookName = match[1];
      const isBuiltIn = REACT_HOOKS.has(hookName);
      
      const feature: HookFeature = {
        name: hookName,
        isBuiltIn,
      };
      
      // Try to extract dependencies for effect-like hooks
      if (['useEffect', 'useCallback', 'useMemo', 'useLayoutEffect'].includes(hookName)) {
        const depMatch = nodeText.match(new RegExp(`${hookName}\\s*\\([^)]*,\\s*\\[([^\\]]*)\\]`));
        if (depMatch?.[1]) {
          feature.dependencies = depMatch[1].split(',').map(d => d.trim()).filter(d => d.length > 0);
        }
      }
      
      hooks.push(feature);
    }
  }
  
  return hooks;
}

/**
 * Extract event handlers from a component
 */
export function extractEventHandlers(node: ASTNode): EventHandlerFeature[] {
  const handlers: EventHandlerFeature[] = [];
  const nodeText = node.text;
  const seenHandlers = new Set<string>();
  
  // Match event handler props: onClick={handleClick} or onClick={() => ...}
  for (const eventType of EVENT_HANDLER_PATTERNS) {
    const handlerMatches = nodeText.matchAll(new RegExp(`${eventType}\\s*=\\s*\\{([^}]+)\\}`, 'g'));
    for (const match of handlerMatches) {
      if (match[1]) {
        const handlerContent = match[1].trim();
        const isInline = handlerContent.includes('=>') || handlerContent.includes('function');
        const handlerName = isInline ? `inline_${eventType}` : handlerContent;
        
        if (!seenHandlers.has(`${eventType}_${handlerName}`)) {
          seenHandlers.add(`${eventType}_${handlerName}`);
          handlers.push({
            name: handlerName,
            eventType,
            isInline,
          });
        }
      }
    }
  }
  
  // Match handler function definitions: const handleClick = ...
  const handlerDefMatches = nodeText.matchAll(/const\s+(handle[A-Z][a-zA-Z0-9]*|on[A-Z][a-zA-Z0-9]*)\s*=/g);
  for (const match of handlerDefMatches) {
    if (match[1] && !seenHandlers.has(match[1])) {
      seenHandlers.add(match[1]);
      handlers.push({
        name: match[1],
        eventType: 'custom',
        isInline: false,
      });
    }
  }
  
  return handlers;
}

/**
 * Extract JSX elements from a component
 */
export function extractJSXElements(node: ASTNode): JSXElementFeature[] {
  const elements: JSXElementFeature[] = [];
  const nodeText = node.text;
  
  // Match JSX opening tags: <TagName prop1={...} prop2="...">
  const jsxMatches = nodeText.matchAll(/<([A-Za-z][A-Za-z0-9.]*)\s*([^>]*?)(?:\/?>)/g);
  
  for (const match of jsxMatches) {
    if (match[1]) {
      const tagName = match[1];
      const propsStr = match[2] || '';
      const isComponent = /^[A-Z]/.test(tagName);
      
      // Extract prop names from the props string
      const propMatches = propsStr.matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g);
      const props: string[] = [];
      for (const propMatch of propMatches) {
        if (propMatch[1]) {
          props.push(propMatch[1]);
        }
      }
      
      elements.push({
        tagName,
        isComponent,
        props,
        depth: 0, // Simplified - would need proper parsing for accurate depth
      });
    }
  }
  
  return elements;
}

/**
 * Extract conditional rendering patterns from a component
 */
export function extractConditionalPatterns(node: ASTNode): ConditionalPattern[] {
  const patterns: ConditionalPattern[] = [];
  const nodeText = node.text;
  
  // Match ternary in JSX: {condition ? <A /> : <B />}
  const ternaryMatches = nodeText.matchAll(/\{\s*([a-zA-Z_$][a-zA-Z0-9_$?.]*)\s*\?\s*</g);
  for (const match of ternaryMatches) {
    if (match[1]) {
      patterns.push({
        type: 'ternary',
        condition: match[1],
      });
    }
  }
  
  // Match logical AND: {condition && <Component />}
  const logicalAndMatches = nodeText.matchAll(/\{\s*([a-zA-Z_$][a-zA-Z0-9_$?.]*)\s*&&\s*</g);
  for (const match of logicalAndMatches) {
    if (match[1]) {
      patterns.push({
        type: 'logical-and',
        condition: match[1],
      });
    }
  }
  
  // Match early returns: if (!condition) return null;
  const earlyReturnMatches = nodeText.matchAll(/if\s*\(\s*!?\s*([a-zA-Z_$][a-zA-Z0-9_$?.]*)\s*\)\s*return\s*null/g);
  for (const match of earlyReturnMatches) {
    if (match[1]) {
      patterns.push({
        type: 'early-return',
        condition: match[1],
      });
    }
  }
  
  return patterns;
}

/**
 * Extract data fetching patterns from a component
 */
export function extractDataPatterns(node: ASTNode): DataPattern[] {
  const patterns: DataPattern[] = [];
  const nodeText = node.text;
  
  // Check for useQuery (React Query)
  if (nodeText.includes('useQuery')) {
    patterns.push({
      type: 'useQuery',
      hasLoadingState: nodeText.includes('isLoading') || nodeText.includes('loading'),
      hasErrorState: nodeText.includes('isError') || nodeText.includes('error'),
    });
  }
  
  // Check for useSWR
  if (nodeText.includes('useSWR')) {
    patterns.push({
      type: 'useSWR',
      hasLoadingState: nodeText.includes('isLoading') || nodeText.includes('isValidating'),
      hasErrorState: nodeText.includes('error'),
    });
  }
  
  // Check for useEffect with fetch
  if (nodeText.includes('useEffect') && (nodeText.includes('fetch(') || nodeText.includes('axios'))) {
    patterns.push({
      type: 'useEffect-fetch',
      hasLoadingState: nodeText.includes('Loading') || nodeText.includes('loading'),
      hasErrorState: nodeText.includes('Error') || nodeText.includes('error'),
    });
  }
  
  return patterns;
}

/**
 * Extract all semantic features from a component
 */
export function extractSemanticFeatures(
  node: ASTNode,
  filePath: string,
  content: string
): SemanticFeatures | null {
  const name = extractComponentName(node, content);
  if (!name) {
    return null;
  }
  
  return {
    name,
    filePath,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    props: extractProps(node, content),
    stateVariables: extractState(node),
    hooks: extractHooks(node),
    eventHandlers: extractEventHandlers(node),
    jsxElements: extractJSXElements(node),
    conditionalPatterns: extractConditionalPatterns(node),
    dataPatterns: extractDataPatterns(node),
    sourceCode: node.text,
  };
}

// ============================================================================
// Helper Functions - Similarity Calculation
// ============================================================================

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0;
  }
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Calculate props similarity between two components
 */
export function calculatePropsSimilarity(
  props1: PropFeature[],
  props2: PropFeature[]
): number {
  if (props1.length === 0 && props2.length === 0) {
    return 1.0;
  }
  
  const names1 = new Set(props1.map(p => p.name));
  const names2 = new Set(props2.map(p => p.name));
  
  const nameSimilarity = jaccardSimilarity(names1, names2);
  
  // Also consider prop characteristics
  const callbacks1 = new Set(props1.filter(p => p.isCallback).map(p => p.name));
  const callbacks2 = new Set(props2.filter(p => p.isCallback).map(p => p.name));
  const callbackSimilarity = jaccardSimilarity(callbacks1, callbacks2);
  
  return nameSimilarity * 0.7 + callbackSimilarity * 0.3;
}

/**
 * Calculate state similarity between two components
 */
export function calculateStateSimilarity(
  state1: StateFeature[],
  state2: StateFeature[]
): number {
  if (state1.length === 0 && state2.length === 0) {
    return 1.0;
  }
  
  // Compare state types
  const types1 = new Set(state1.map(s => s.stateType));
  const types2 = new Set(state2.map(s => s.stateType));
  const typeSimilarity = jaccardSimilarity(types1, types2);
  
  // Compare number of state variables
  const countDiff = Math.abs(state1.length - state2.length);
  const maxCount = Math.max(state1.length, state2.length, 1);
  const countSimilarity = 1 - (countDiff / maxCount);
  
  return typeSimilarity * 0.6 + countSimilarity * 0.4;
}

/**
 * Calculate hooks similarity between two components
 */
export function calculateHooksSimilarity(
  hooks1: HookFeature[],
  hooks2: HookFeature[]
): number {
  if (hooks1.length === 0 && hooks2.length === 0) {
    return 1.0;
  }
  
  const names1 = new Set(hooks1.map(h => h.name));
  const names2 = new Set(hooks2.map(h => h.name));
  
  return jaccardSimilarity(names1, names2);
}

/**
 * Calculate event handlers similarity between two components
 */
export function calculateEventHandlersSimilarity(
  handlers1: EventHandlerFeature[],
  handlers2: EventHandlerFeature[]
): number {
  if (handlers1.length === 0 && handlers2.length === 0) {
    return 1.0;
  }
  
  const types1 = new Set(handlers1.map(h => h.eventType));
  const types2 = new Set(handlers2.map(h => h.eventType));
  
  return jaccardSimilarity(types1, types2);
}

/**
 * Calculate JSX structure similarity between two components
 */
export function calculateJSXSimilarity(
  elements1: JSXElementFeature[],
  elements2: JSXElementFeature[]
): number {
  if (elements1.length === 0 && elements2.length === 0) {
    return 1.0;
  }
  
  // Compare tag names
  const tags1 = new Set(elements1.map(e => e.tagName));
  const tags2 = new Set(elements2.map(e => e.tagName));
  const tagSimilarity = jaccardSimilarity(tags1, tags2);
  
  // Compare component usage
  const components1 = new Set(elements1.filter(e => e.isComponent).map(e => e.tagName));
  const components2 = new Set(elements2.filter(e => e.isComponent).map(e => e.tagName));
  const componentSimilarity = jaccardSimilarity(components1, components2);
  
  // Compare element count
  const countDiff = Math.abs(elements1.length - elements2.length);
  const maxCount = Math.max(elements1.length, elements2.length, 1);
  const countSimilarity = 1 - (countDiff / maxCount);
  
  return tagSimilarity * 0.4 + componentSimilarity * 0.4 + countSimilarity * 0.2;
}

/**
 * Calculate conditional patterns similarity
 */
export function calculateConditionalSimilarity(
  patterns1: ConditionalPattern[],
  patterns2: ConditionalPattern[]
): number {
  if (patterns1.length === 0 && patterns2.length === 0) {
    return 1.0;
  }
  
  const types1 = new Set(patterns1.map(p => p.type));
  const types2 = new Set(patterns2.map(p => p.type));
  
  return jaccardSimilarity(types1, types2);
}

/**
 * Calculate data patterns similarity
 */
export function calculateDataPatternsSimilarity(
  patterns1: DataPattern[],
  patterns2: DataPattern[]
): number {
  if (patterns1.length === 0 && patterns2.length === 0) {
    return 1.0;
  }
  
  const types1 = new Set(patterns1.map(p => p.type));
  const types2 = new Set(patterns2.map(p => p.type));
  
  return jaccardSimilarity(types1, types2);
}

/**
 * Calculate overall semantic similarity between two components
 */
export function calculateSemanticSimilarity(
  comp1: SemanticFeatures,
  comp2: SemanticFeatures
): SimilarityBreakdown {
  return {
    props: calculatePropsSimilarity(comp1.props, comp2.props),
    state: calculateStateSimilarity(comp1.stateVariables, comp2.stateVariables),
    hooks: calculateHooksSimilarity(comp1.hooks, comp2.hooks),
    eventHandlers: calculateEventHandlersSimilarity(comp1.eventHandlers, comp2.eventHandlers),
    jsxStructure: calculateJSXSimilarity(comp1.jsxElements, comp2.jsxElements),
    conditionalPatterns: calculateConditionalSimilarity(comp1.conditionalPatterns, comp2.conditionalPatterns),
    dataPatterns: calculateDataPatternsSimilarity(comp1.dataPatterns, comp2.dataPatterns),
  };
}

/**
 * Calculate weighted overall similarity from breakdown
 */
export function calculateOverallSimilarity(
  breakdown: SimilarityBreakdown,
  weights: SimilarityWeights = DEFAULT_NEAR_DUPLICATE_CONFIG.weights
): number {
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  
  const weightedSum =
    breakdown.props * weights.props +
    breakdown.state * weights.state +
    breakdown.hooks * weights.hooks +
    breakdown.eventHandlers * weights.eventHandlers +
    breakdown.jsxStructure * weights.jsxStructure +
    breakdown.conditionalPatterns * weights.conditionalPatterns +
    breakdown.dataPatterns * weights.dataPatterns;
  
  return weightedSum / totalWeight;
}

// ============================================================================
// Helper Functions - Abstraction Suggestions
// ============================================================================

/**
 * Determine the best abstraction type for a pair of similar components
 */
export function determineAbstractionType(
  comp1: SemanticFeatures,
  comp2: SemanticFeatures,
  breakdown: SimilarityBreakdown
): AbstractionType {
  // If hooks are very similar and there's shared state logic, suggest shared hook
  if (breakdown.hooks > 0.7 && breakdown.state > 0.6) {
    const customHooks1 = comp1.hooks.filter(h => !h.isBuiltIn);
    const customHooks2 = comp2.hooks.filter(h => !h.isBuiltIn);
    if (customHooks1.length === 0 && customHooks2.length === 0 && comp1.stateVariables.length > 0) {
      return 'shared-hook';
    }
  }
  
  // If JSX structure is very similar with different props, suggest shared component
  if (breakdown.jsxStructure > 0.7 && breakdown.props > 0.5) {
    return 'shared-component';
  }
  
  // If there's similar conditional/data patterns, suggest HOC
  if (breakdown.conditionalPatterns > 0.7 || breakdown.dataPatterns > 0.7) {
    return 'higher-order';
  }
  
  // If event handlers are similar, suggest composition
  if (breakdown.eventHandlers > 0.7) {
    return 'composition';
  }
  
  // Default to shared component
  return 'shared-component';
}

/**
 * Generate abstraction suggestions for a pair of similar components
 */
export function generateAbstractionSuggestions(
  comp1: SemanticFeatures,
  comp2: SemanticFeatures,
  breakdown: SimilarityBreakdown,
  abstractionType: AbstractionType
): AbstractionSuggestion[] {
  const suggestions: AbstractionSuggestion[] = [];
  
  // Find shared features
  const sharedProps = comp1.props
    .filter(p1 => comp2.props.some(p2 => p2.name === p1.name))
    .map(p => p.name);
  
  const sharedHooks = comp1.hooks
    .filter(h1 => comp2.hooks.some(h2 => h2.name === h1.name))
    .map(h => h.name);
  
  const sharedElements = comp1.jsxElements
    .filter(e1 => comp2.jsxElements.some(e2 => e2.tagName === e1.tagName))
    .map(e => e.tagName);
  
  switch (abstractionType) {
    case 'shared-component':
      suggestions.push({
        type: 'shared-component',
        description: `Create a shared component that accepts variant props to handle differences between '${comp1.name}' and '${comp2.name}'`,
        confidence: breakdown.jsxStructure,
        sharedFeatures: [...sharedProps, ...sharedElements],
        exampleCode: generateSharedComponentExample(comp1, comp2, sharedProps),
      });
      break;
      
    case 'shared-hook':
      suggestions.push({
        type: 'shared-hook',
        description: `Extract shared state logic into a custom hook that can be used by both '${comp1.name}' and '${comp2.name}'`,
        confidence: breakdown.hooks * breakdown.state,
        sharedFeatures: sharedHooks,
        exampleCode: generateSharedHookExample(comp1, comp2),
      });
      break;
      
    case 'higher-order':
      suggestions.push({
        type: 'higher-order',
        description: `Create a Higher-Order Component (HOC) to wrap shared behavior for '${comp1.name}' and '${comp2.name}'`,
        confidence: Math.max(breakdown.conditionalPatterns, breakdown.dataPatterns),
        sharedFeatures: [...sharedHooks, ...sharedProps],
      });
      break;
      
    case 'composition':
      suggestions.push({
        type: 'composition',
        description: `Use composition pattern to share common elements between '${comp1.name}' and '${comp2.name}'`,
        confidence: breakdown.jsxStructure,
        sharedFeatures: sharedElements,
      });
      break;
      
    case 'render-props':
      suggestions.push({
        type: 'render-props',
        description: `Use render props pattern to share logic while allowing different rendering`,
        confidence: breakdown.state * breakdown.hooks,
        sharedFeatures: [...sharedHooks, ...sharedProps],
      });
      break;
      
    case 'utility-function':
      suggestions.push({
        type: 'utility-function',
        description: `Extract shared logic into utility functions`,
        confidence: 0.5,
        sharedFeatures: sharedHooks,
      });
      break;
  }
  
  return suggestions;
}

/**
 * Generate example code for shared component suggestion
 */
function generateSharedComponentExample(
  comp1: SemanticFeatures,
  comp2: SemanticFeatures,
  sharedProps: string[]
): string {
  const baseName = findCommonBaseName(comp1.name, comp2.name);
  const propsStr = sharedProps.length > 0 
    ? `{ ${sharedProps.join(', ')}, variant }` 
    : '{ variant }';
  
  return `// Suggested shared component
interface ${baseName}Props {
  ${sharedProps.map(p => `${p}: unknown;`).join('\n  ')}
  variant: '${comp1.name.toLowerCase()}' | '${comp2.name.toLowerCase()}';
}

const ${baseName} = (${propsStr}: ${baseName}Props) => {
  // Shared implementation with variant-specific rendering
};`;
}

/**
 * Generate example code for shared hook suggestion
 */
function generateSharedHookExample(
  comp1: SemanticFeatures,
  comp2: SemanticFeatures
): string {
  const sharedState = comp1.stateVariables
    .filter(s1 => comp2.stateVariables.some(s2 => s2.stateType === s1.stateType));
  
  const hookName = `use${findCommonBaseName(comp1.name, comp2.name)}Logic`;
  
  return `// Suggested shared hook
const ${hookName} = () => {
  ${sharedState.map(s => `const [${s.name}, ${s.setter}] = ${s.stateType}(${s.initialValue || ''});`).join('\n  ')}
  
  // Shared logic here
  
  return { ${sharedState.map(s => s.name).join(', ')} };
};`;
}

/**
 * Find common base name between two component names
 */
function findCommonBaseName(name1: string, name2: string): string {
  // Try to find common prefix
  let commonPrefix = '';
  const minLen = Math.min(name1.length, name2.length);
  
  for (let i = 0; i < minLen; i++) {
    if (name1[i] === name2[i]) {
      commonPrefix += name1[i];
    } else {
      break;
    }
  }
  
  if (commonPrefix.length >= 3) {
    return commonPrefix;
  }
  
  // Try to find common suffix
  let commonSuffix = '';
  for (let i = 0; i < minLen; i++) {
    if (name1[name1.length - 1 - i] === name2[name2.length - 1 - i]) {
      commonSuffix = name1[name1.length - 1 - i] + commonSuffix;
    } else {
      break;
    }
  }
  
  if (commonSuffix.length >= 3) {
    return commonSuffix;
  }
  
  // Default to generic name
  return 'Shared';
}

// ============================================================================
// Helper Functions - Analysis
// ============================================================================

/**
 * Compare two components and return near-duplicate info if similar enough
 */
export function compareComponentsSemanticly(
  comp1: SemanticFeatures,
  comp2: SemanticFeatures,
  config: NearDuplicateConfig = DEFAULT_NEAR_DUPLICATE_CONFIG
): NearDuplicatePair | null {
  const breakdown = calculateSemanticSimilarity(comp1, comp2);
  const similarity = calculateOverallSimilarity(breakdown, config.weights);
  
  // Check if similarity meets threshold
  if (similarity < config.similarityThreshold) {
    return null;
  }
  
  // Check minimum feature similarities
  if (breakdown.props < config.minPropsSimilarity && breakdown.jsxStructure < config.minJsxSimilarity) {
    return null;
  }
  
  const abstractionType = determineAbstractionType(comp1, comp2, breakdown);
  const suggestions = generateAbstractionSuggestions(comp1, comp2, breakdown, abstractionType);
  
  return {
    component1: comp1,
    component2: comp2,
    similarity,
    similarityBreakdown: breakdown,
    suggestedAbstraction: abstractionType,
    suggestions,
  };
}

/**
 * Analyze components for near-duplicates and abstraction opportunities
 */
export function analyzeNearDuplicates(
  components: SemanticFeatures[],
  config: NearDuplicateConfig = DEFAULT_NEAR_DUPLICATE_CONFIG
): NearDuplicateAnalysis {
  const pairs: NearDuplicatePair[] = [];
  const componentWithOpportunities = new Set<string>();
  
  // Compare all pairs of components
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const comp1 = components[i];
      const comp2 = components[j];
      
      if (!comp1 || !comp2) {continue;}
      
      const pair = compareComponentsSemanticly(comp1, comp2, config);
      if (pair) {
        pairs.push(pair);
        componentWithOpportunities.add(`${comp1.filePath}:${comp1.line}`);
        componentWithOpportunities.add(`${comp2.filePath}:${comp2.line}`);
      }
    }
  }
  
  // Group by abstraction type
  const abstractionGroups = buildAbstractionGroups(pairs, components);
  
  return {
    pairs,
    abstractionGroups,
    totalComponents: components.length,
    componentsWithOpportunities: componentWithOpportunities.size,
  };
}

/**
 * Build abstraction groups from pairs
 */
function buildAbstractionGroups(
  pairs: NearDuplicatePair[],
  allComponents: SemanticFeatures[]
): AbstractionGroup[] {
  const groups = new Map<AbstractionType, Set<string>>();
  const componentMap = new Map<string, SemanticFeatures>();
  
  // Build component map
  for (const comp of allComponents) {
    componentMap.set(`${comp.filePath}:${comp.line}`, comp);
  }
  
  // Group components by abstraction type
  for (const pair of pairs) {
    const type = pair.suggestedAbstraction;
    if (!groups.has(type)) {
      groups.set(type, new Set());
    }
    const group = groups.get(type)!;
    group.add(`${pair.component1.filePath}:${pair.component1.line}`);
    group.add(`${pair.component2.filePath}:${pair.component2.line}`);
  }
  
  // Convert to AbstractionGroup array
  const result: AbstractionGroup[] = [];
  
  for (const [type, componentKeys] of groups) {
    const components: SemanticFeatures[] = [];
    for (const key of componentKeys) {
      const comp = componentMap.get(key);
      if (comp) {
        components.push(comp);
      }
    }
    
    // Find shared features across all components in group
    const sharedFeatures = findSharedFeatures(components);
    
    // Calculate average confidence from pairs
    const relevantPairs = pairs.filter(p => p.suggestedAbstraction === type);
    const avgConfidence = relevantPairs.length > 0
      ? relevantPairs.reduce((sum, p) => sum + p.similarity, 0) / relevantPairs.length
      : 0;
    
    result.push({
      abstractionType: type,
      components,
      sharedFeatures,
      confidence: avgConfidence,
    });
  }
  
  return result.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Find features shared across all components
 */
function findSharedFeatures(components: SemanticFeatures[]): string[] {
  if (components.length === 0) {return [];}
  
  const firstComp = components[0];
  if (!firstComp) {return [];}
  
  const sharedProps = firstComp.props
    .filter(p => components.every(c => c.props.some(cp => cp.name === p.name)))
    .map(p => `prop:${p.name}`);
  
  const sharedHooks = firstComp.hooks
    .filter(h => components.every(c => c.hooks.some(ch => ch.name === h.name)))
    .map(h => `hook:${h.name}`);
  
  const sharedElements = firstComp.jsxElements
    .filter(e => components.every(c => c.jsxElements.some(ce => ce.tagName === e.tagName)))
    .map(e => `element:${e.tagName}`);
  
  return [...sharedProps, ...sharedHooks, ...sharedElements];
}

/**
 * Generate a refactoring suggestion message
 */
export function generateRefactoringSuggestionMessage(pair: NearDuplicatePair): string {
  const { component1, component2, similarity, suggestedAbstraction } = pair;
  const percentSimilar = Math.round(similarity * 100);
  
  const abstractionDescriptions: Record<AbstractionType, string> = {
    'shared-component': 'creating a shared component with variant props',
    'shared-hook': 'extracting shared logic into a custom hook',
    'higher-order': 'using a Higher-Order Component (HOC)',
    'render-props': 'using the render props pattern',
    'composition': 'using component composition',
    'utility-function': 'extracting utility functions',
  };
  
  return `Components '${component1.name}' and '${component2.name}' are ${percentSimilar}% semantically similar. ` +
         `Consider ${abstractionDescriptions[suggestedAbstraction]}.`;
}

// ============================================================================
// Near Duplicate Detector Class
// ============================================================================

/**
 * Detector for semantically similar components that could be abstracted
 *
 * Unlike DuplicateDetector which focuses on AST structure, this detector
 * analyzes semantic/functional similarity including:
 * - Similar prop patterns
 * - Similar render patterns
 * - Similar state management
 * - Opportunities for shared hooks, HOCs, or render props
 *
 * @requirements 8.4 - THE Component_Detector SHALL detect near-duplicate components that should be abstracted
 */
export class NearDuplicateDetector extends ASTDetector {
  readonly id = 'components/near-duplicate';
  readonly category = 'components' as const;
  readonly subcategory = 'abstraction-candidates';
  readonly name = 'Near Duplicate Detector';
  readonly description = 'Detects semantically similar components that could be refactored into shared abstractions';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  private config: NearDuplicateConfig;

  constructor(config: Partial<NearDuplicateConfig> = {}) {
    super();
    this.config = { ...DEFAULT_NEAR_DUPLICATE_CONFIG, ...config };
  }

  /**
   * Detect near-duplicate components in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // Extract semantic features from all components
    const allComponents = this.extractAllComponents(context);
    
    if (allComponents.length < 2) {
      return this.createEmptyResult();
    }

    // Analyze for near-duplicates
    const analysis = analyzeNearDuplicates(allComponents, this.config);

    // Create pattern matches for abstraction opportunities
    for (const group of analysis.abstractionGroups) {
      if (group.confidence > 0.5) {
        patterns.push({
          patternId: `abstraction-opportunity-${group.abstractionType}`,
          location: { file: context.file, line: 1, column: 1 },
          confidence: group.confidence,
          isOutlier: false,
        });
      }
    }

    // Create violations for near-duplicates involving the current file
    for (const pair of analysis.pairs) {
      if (this.involvesCurrentFile(pair, context.file)) {
        const violation = this.createNearDuplicateViolation(pair, context.file);
        violations.push(violation);
      }
    }

    const confidence = analysis.totalComponents > 0
      ? 1 - (analysis.componentsWithOpportunities / analysis.totalComponents)
      : 1.0;

    return this.createResult(patterns, violations, confidence);
  }

  /**
   * Generate a quick fix for near-duplicate violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Extract component names from the violation message
    const match = violation.message.match(/Components '([^']+)' and '([^']+)'/);
    if (!match?.[1] || !match[2]) {
      return null;
    }

    const comp1Name = match[1];
    const comp2Name = match[2];
    const baseName = findCommonBaseName(comp1Name, comp2Name);

    // Determine abstraction type from message
    let abstractionType: AbstractionType = 'shared-component';
    if (violation.message.includes('custom hook')) {
      abstractionType = 'shared-hook';
    } else if (violation.message.includes('HOC')) {
      abstractionType = 'higher-order';
    }

    return {
      title: `Extract shared ${abstractionType === 'shared-hook' ? 'hook' : 'component'}: ${baseName}`,
      kind: 'refactor',
      edit: {
        changes: {},
        documentChanges: [],
      },
      isPreferred: true,
      confidence: 0.7,
      preview: `Create a shared ${abstractionType} to reduce duplication between ${comp1Name} and ${comp2Name}`,
    };
  }

  /**
   * Extract all components from project files
   */
  private extractAllComponents(context: DetectionContext): SemanticFeatures[] {
    const components: SemanticFeatures[] = [];
    
    // Extract from current file using AST if available
    if (context.ast) {
      const fileComponents = this.extractComponentsFromAST(
        context.ast,
        context.file,
        context.content
      );
      components.push(...fileComponents);
    } else {
      // Fallback to regex-based extraction
      const fileComponents = this.extractComponentsFromContent(
        context.file,
        context.content
      );
      components.push(...fileComponents);
    }
    
    return components;
  }

  /**
   * Extract components from an AST
   */
  private extractComponentsFromAST(
    ast: AST,
    filePath: string,
    content: string
  ): SemanticFeatures[] {
    const components: SemanticFeatures[] = [];
    
    const functionNodes = this.findNodesByTypes(ast, [
      'function_declaration',
      'arrow_function',
      'function_expression',
    ]);
    
    for (const node of functionNodes) {
      if (isReactComponentNode(node, content)) {
        const features = extractSemanticFeatures(node, filePath, content);
        if (features) {
          components.push(features);
        }
      }
    }
    
    return components;
  }

  /**
   * Extract components from content using regex (fallback)
   */
  private extractComponentsFromContent(
    filePath: string,
    content: string
  ): SemanticFeatures[] {
    const components: SemanticFeatures[] = [];
    
    // Match component patterns
    const patterns = [
      // Arrow function: const Button = ({ ... }) => ...
      /(?:export\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*(?::\s*(?:React\.)?(?:FC|FunctionComponent)\s*<[^>]*>\s*)?=\s*\([^)]*\)\s*=>\s*[\s\S]*?(?=\n(?:export\s+)?(?:const|function|class)\s+[A-Z]|\n*$)/g,
      // Function declaration: function Button({ ... }) { ... }
      /(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (!name) {continue;}
        
        const sourceCode = match[0];
        const beforeMatch = content.slice(0, match.index);
        const line = beforeMatch.split('\n').length;
        
        // Create a mock AST node for feature extraction
        const mockNode: ASTNode = {
          type: 'function_declaration',
          text: sourceCode,
          startPosition: { row: line - 1, column: 0 },
          endPosition: { row: line - 1 + sourceCode.split('\n').length, column: 0 },
          children: [],
        };
        
        const features = extractSemanticFeatures(mockNode, filePath, content);
        if (features) {
          components.push(features);
        }
      }
    }
    
    return components;
  }

  /**
   * Check if a near-duplicate pair involves the current file
   */
  private involvesCurrentFile(pair: NearDuplicatePair, currentFile: string): boolean {
    return pair.component1.filePath === currentFile || 
           pair.component2.filePath === currentFile;
  }

  /**
   * Create a violation for a near-duplicate pair
   */
  private createNearDuplicateViolation(
    pair: NearDuplicatePair,
    currentFile: string
  ): Violation {
    const { component1, component2, similarity, suggestedAbstraction } = pair;
    
    // Determine which component is in the current file
    const currentComponent = component1.filePath === currentFile ? component1 : component2;
    const otherComponent = component1.filePath === currentFile ? component2 : component1;
    
    const message = generateRefactoringSuggestionMessage(pair);
    
    const range: Range = {
      start: { line: currentComponent.line, character: currentComponent.column },
      end: { line: currentComponent.line, character: currentComponent.column + currentComponent.name.length },
    };

    const abstractionDescriptions: Record<AbstractionType, string> = {
      'shared-component': 'shared component with variant props',
      'shared-hook': 'custom hook for shared logic',
      'higher-order': 'Higher-Order Component (HOC)',
      'render-props': 'render props pattern',
      'composition': 'component composition',
      'utility-function': 'utility functions',
    };

    const quickFix = this.generateQuickFix({
      id: '',
      patternId: '',
      severity: 'info',
      file: currentFile,
      range,
      message,
      expected: '',
      actual: '',
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    });

    const violation: Violation = {
      id: `near-duplicate-${currentComponent.name}-${otherComponent.name}-${currentFile.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'components/near-duplicate',
      severity: 'info',
      file: currentFile,
      range,
      message,
      expected: abstractionDescriptions[suggestedAbstraction],
      actual: `${Math.round(similarity * 100)}% semantic similarity`,
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
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new NearDuplicateDetector instance
 */
export function createNearDuplicateDetector(
  config: Partial<NearDuplicateConfig> = {}
): NearDuplicateDetector {
  return new NearDuplicateDetector(config);
}
