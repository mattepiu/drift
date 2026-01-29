/**
 * State Patterns Detector - State management pattern detection
 *
 * Detects local vs global state usage patterns in React components.
 * Identifies state management inconsistencies and suggests improvements.
 *
 * @requirements 8.5 - THE Component_Detector SHALL detect state management patterns (local vs global)
 */

import { ASTDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range, ASTNode } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of local state patterns
 */
export type LocalStatePattern =
  | 'useState'           // React useState hook
  | 'useReducer'         // React useReducer hook
  | 'useRef'             // React useRef for mutable values
  | 'class-state'        // Class component this.state
  | 'none';              // No local state

/**
 * Types of global state patterns
 */
export type GlobalStatePattern =
  | 'useContext'         // React Context API
  | 'redux'              // Redux (useSelector, useDispatch)
  | 'zustand'            // Zustand store hooks
  | 'jotai'              // Jotai atoms
  | 'recoil'             // Recoil atoms
  | 'react-query'        // React Query / TanStack Query
  | 'swr'                // SWR for server state
  | 'mobx'               // MobX observables
  | 'valtio'             // Valtio proxy state
  | 'none';              // No global state

/**
 * State management issue types
 */
export type StateIssueType =
  | 'mixed-patterns'           // Multiple state management libraries in same component
  | 'prop-drilling'            // Props passed through multiple levels
  | 'local-should-lift'        // Local state that should be lifted
  | 'global-should-be-local'   // Global state that could be local
  | 'missing-memoization'      // State updates without memoization
  | 'excessive-rerenders';     // State structure causing excessive rerenders


/**
 * Information about a state usage in a component
 */
export interface StateUsageInfo {
  /** Type of state (local or global) */
  type: 'local' | 'global';
  /** Specific pattern used */
  pattern: LocalStatePattern | GlobalStatePattern;
  /** Variable name(s) associated with this state */
  variableNames: string[];
  /** Line number where state is declared/used */
  line: number;
  /** Column number */
  column: number;
  /** Whether this state is derived from props */
  derivedFromProps: boolean;
  /** Dependencies (for effects that update this state) */
  dependencies?: string[];
}

/**
 * Information about a component's state management
 */
export interface ComponentStateInfo {
  /** Component name */
  componentName: string;
  /** File path */
  filePath: string;
  /** Line number where component is defined */
  line: number;
  /** Column number */
  column: number;
  /** Local state usages */
  localState: StateUsageInfo[];
  /** Global state usages */
  globalState: StateUsageInfo[];
  /** Detected issues */
  issues: StateIssue[];
  /** Props that are passed down (potential prop drilling) */
  passedDownProps: string[];
  /** Total state complexity score */
  complexityScore: number;
}

/**
 * A detected state management issue
 */
export interface StateIssue {
  /** Type of issue */
  type: StateIssueType;
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
 * Analysis of state patterns in a project
 */
export interface StatePatternAnalysis {
  /** All analyzed components */
  components: ComponentStateInfo[];
  /** Dominant local state pattern */
  dominantLocalPattern: LocalStatePattern;
  /** Dominant global state pattern */
  dominantGlobalPattern: GlobalStatePattern;
  /** Confidence scores */
  confidence: {
    localPattern: number;
    globalPattern: number;
  };
  /** Components with state issues */
  componentsWithIssues: ComponentStateInfo[];
  /** Overall state management health score (0-1) */
  healthScore: number;
}


/**
 * Configuration for state pattern detection
 */
export interface StatePatternConfig {
  /** Minimum prop drilling depth to flag */
  propDrillingThreshold: number;
  /** Whether to detect server state patterns (React Query, SWR) */
  detectServerState: boolean;
  /** Whether to flag mixed state management patterns */
  flagMixedPatterns: boolean;
  /** Maximum local state variables before suggesting extraction */
  maxLocalStateVariables: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration for state pattern detection
 */
export const DEFAULT_STATE_PATTERN_CONFIG: StatePatternConfig = {
  propDrillingThreshold: 3,
  detectServerState: true,
  flagMixedPatterns: true,
  maxLocalStateVariables: 5,
};

/**
 * Redux hook patterns
 */
export const REDUX_HOOKS = ['useSelector', 'useDispatch', 'useStore'] as const;

/**
 * Zustand hook patterns
 */
export const ZUSTAND_PATTERNS = [
  /use[A-Z][a-zA-Z]*Store/,  // useUserStore, useCartStore, etc.
  /create\s*\(/,              // create() from zustand
] as const;

/**
 * Jotai patterns
 */
export const JOTAI_HOOKS = ['useAtom', 'useAtomValue', 'useSetAtom'] as const;

/**
 * Recoil patterns
 */
export const RECOIL_HOOKS = ['useRecoilState', 'useRecoilValue', 'useSetRecoilState', 'useRecoilCallback'] as const;

/**
 * React Query / TanStack Query patterns
 */
export const REACT_QUERY_HOOKS = ['useQuery', 'useMutation', 'useInfiniteQuery', 'useQueries'] as const;

/**
 * SWR patterns
 */
export const SWR_HOOKS = ['useSWR', 'useSWRMutation', 'useSWRInfinite'] as const;

/**
 * MobX patterns
 */
export const MOBX_PATTERNS = ['observer', 'useObserver', 'useLocalObservable'] as const;

/**
 * Valtio patterns
 */
export const VALTIO_HOOKS = ['useSnapshot', 'useProxy'] as const;


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
// Helper Functions - Local State Detection
// ============================================================================

/**
 * Detect useState usage in a component
 */
export function detectUseState(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  // Match: const [value, setValue] = useState(initial)
  const useStateMatches = nodeText.matchAll(
    /const\s+\[\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\]\s*=\s*useState\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g
  );
  
  for (const match of useStateMatches) {
    if (match[1] && match[2]) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      results.push({
        type: 'local',
        pattern: 'useState',
        variableNames: [match[1], match[2]],
        line,
        column: 1,
        derivedFromProps: match[3]?.includes('props') || false,
      });
    }
  }
  
  return results;
}


/**
 * Detect useReducer usage in a component
 */
export function detectUseReducer(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  // Match: const [state, dispatch] = useReducer(reducer, initial)
  const useReducerMatches = nodeText.matchAll(
    /const\s+\[\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\]\s*=\s*useReducer\s*\(/g
  );
  
  for (const match of useReducerMatches) {
    if (match[1] && match[2]) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      results.push({
        type: 'local',
        pattern: 'useReducer',
        variableNames: [match[1], match[2]],
        line,
        column: 1,
        derivedFromProps: false,
      });
    }
  }
  
  return results;
}

/**
 * Detect useRef usage for mutable values in a component
 */
export function detectUseRef(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  // Match: const ref = useRef(initial)
  const useRefMatches = nodeText.matchAll(
    /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*useRef\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g
  );
  
  for (const match of useRefMatches) {
    if (match[1]) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      // Only count as state if it's used for mutable values (not DOM refs)
      const refName = match[1];
      const initialValue = match[2] || '';
      const isDOMRef = initialValue === 'null' && nodeText.includes(`ref={${refName}}`);
      
      if (!isDOMRef) {
        results.push({
          type: 'local',
          pattern: 'useRef',
          variableNames: [refName],
          line,
          column: 1,
          derivedFromProps: initialValue.includes('props'),
        });
      }
    }
  }
  
  return results;
}

/**
 * Detect all local state patterns in a component
 */
export function detectLocalState(nodeText: string): StateUsageInfo[] {
  return [
    ...detectUseState(nodeText),
    ...detectUseReducer(nodeText),
    ...detectUseRef(nodeText),
  ];
}


// ============================================================================
// Helper Functions - Global State Detection
// ============================================================================

/**
 * Detect useContext usage in a component
 */
export function detectUseContext(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  // Match: const value = useContext(SomeContext)
  const useContextMatches = nodeText.matchAll(
    /const\s+(?:\{([^}]+)\}|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*=\s*useContext\s*\(\s*([A-Z][a-zA-Z0-9]*(?:Context)?)\s*\)/g
  );
  
  for (const match of useContextMatches) {
    const beforeMatch = nodeText.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    // Handle destructured or single variable
    let variableNames: string[] = [];
    if (match[1]) {
      // Destructured: const { value1, value2 } = useContext(...)
      variableNames = match[1].split(',').map(v => v.trim().split(':')[0]?.trim() || '').filter(v => v);
    } else if (match[2]) {
      // Single variable: const ctx = useContext(...)
      variableNames = [match[2]];
    }
    
    if (variableNames.length > 0) {
      results.push({
        type: 'global',
        pattern: 'useContext',
        variableNames,
        line,
        column: 1,
        derivedFromProps: false,
      });
    }
  }
  
  return results;
}

/**
 * Detect Redux hooks usage in a component
 */
export function detectRedux(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  // Detect useSelector
  const useSelectorMatches = nodeText.matchAll(
    /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*useSelector\s*\(/g
  );
  
  for (const match of useSelectorMatches) {
    if (match[1]) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      results.push({
        type: 'global',
        pattern: 'redux',
        variableNames: [match[1]],
        line,
        column: 1,
        derivedFromProps: false,
      });
    }
  }
  
  // Detect useDispatch
  const useDispatchMatches = nodeText.matchAll(
    /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*useDispatch\s*\(\s*\)/g
  );
  
  for (const match of useDispatchMatches) {
    if (match[1]) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      results.push({
        type: 'global',
        pattern: 'redux',
        variableNames: [match[1]],
        line,
        column: 1,
        derivedFromProps: false,
      });
    }
  }
  
  return results;
}


/**
 * Detect Zustand store hooks usage in a component
 */
export function detectZustand(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  // Match: const value = useXxxStore() or const { a, b } = useXxxStore()
  const zustandMatches = nodeText.matchAll(
    /const\s+(?:\{([^}]+)\}|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*=\s*(use[A-Z][a-zA-Z]*Store)\s*\(/g
  );
  
  for (const match of zustandMatches) {
    const beforeMatch = nodeText.slice(0, match.index);
    const line = beforeMatch.split('\n').length;
    
    let variableNames: string[] = [];
    if (match[1]) {
      variableNames = match[1].split(',').map(v => v.trim().split(':')[0]?.trim() || '').filter(v => v);
    } else if (match[2]) {
      variableNames = [match[2]];
    }
    
    if (variableNames.length > 0) {
      results.push({
        type: 'global',
        pattern: 'zustand',
        variableNames,
        line,
        column: 1,
        derivedFromProps: false,
      });
    }
  }
  
  return results;
}

/**
 * Detect Jotai atoms usage in a component
 */
export function detectJotai(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  // Match useAtom, useAtomValue, useSetAtom
  for (const hook of JOTAI_HOOKS) {
    const pattern = new RegExp(
      `const\\s+(?:\\[([^\\]]+)\\]|([a-zA-Z_$][a-zA-Z0-9_$]*))\\s*=\\s*${hook}\\s*\\(`,
      'g'
    );
    const matches = nodeText.matchAll(pattern);
    
    for (const match of matches) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      let variableNames: string[] = [];
      if (match[1]) {
        variableNames = match[1].split(',').map(v => v.trim()).filter(v => v);
      } else if (match[2]) {
        variableNames = [match[2]];
      }
      
      if (variableNames.length > 0) {
        results.push({
          type: 'global',
          pattern: 'jotai',
          variableNames,
          line,
          column: 1,
          derivedFromProps: false,
        });
      }
    }
  }
  
  return results;
}


/**
 * Detect Recoil atoms usage in a component
 */
export function detectRecoil(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  for (const hook of RECOIL_HOOKS) {
    const pattern = new RegExp(
      `const\\s+(?:\\[([^\\]]+)\\]|([a-zA-Z_$][a-zA-Z0-9_$]*))\\s*=\\s*${hook}\\s*\\(`,
      'g'
    );
    const matches = nodeText.matchAll(pattern);
    
    for (const match of matches) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      let variableNames: string[] = [];
      if (match[1]) {
        variableNames = match[1].split(',').map(v => v.trim()).filter(v => v);
      } else if (match[2]) {
        variableNames = [match[2]];
      }
      
      if (variableNames.length > 0) {
        results.push({
          type: 'global',
          pattern: 'recoil',
          variableNames,
          line,
          column: 1,
          derivedFromProps: false,
        });
      }
    }
  }
  
  return results;
}

/**
 * Detect React Query / TanStack Query usage in a component
 */
export function detectReactQuery(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  for (const hook of REACT_QUERY_HOOKS) {
    const pattern = new RegExp(
      `const\\s+(?:\\{([^}]+)\\}|([a-zA-Z_$][a-zA-Z0-9_$]*))\\s*=\\s*${hook}\\s*\\(`,
      'g'
    );
    const matches = nodeText.matchAll(pattern);
    
    for (const match of matches) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      let variableNames: string[] = [];
      if (match[1]) {
        variableNames = match[1].split(',').map(v => v.trim().split(':')[0]?.trim() || '').filter(v => v);
      } else if (match[2]) {
        variableNames = [match[2]];
      }
      
      if (variableNames.length > 0) {
        results.push({
          type: 'global',
          pattern: 'react-query',
          variableNames,
          line,
          column: 1,
          derivedFromProps: false,
        });
      }
    }
  }
  
  return results;
}


/**
 * Detect SWR usage in a component
 */
export function detectSWR(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  for (const hook of SWR_HOOKS) {
    const pattern = new RegExp(
      `const\\s+(?:\\{([^}]+)\\}|([a-zA-Z_$][a-zA-Z0-9_$]*))\\s*=\\s*${hook}\\s*\\(`,
      'g'
    );
    const matches = nodeText.matchAll(pattern);
    
    for (const match of matches) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      let variableNames: string[] = [];
      if (match[1]) {
        variableNames = match[1].split(',').map(v => v.trim().split(':')[0]?.trim() || '').filter(v => v);
      } else if (match[2]) {
        variableNames = [match[2]];
      }
      
      if (variableNames.length > 0) {
        results.push({
          type: 'global',
          pattern: 'swr',
          variableNames,
          line,
          column: 1,
          derivedFromProps: false,
        });
      }
    }
  }
  
  return results;
}

/**
 * Detect MobX usage in a component
 */
export function detectMobX(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  // Check for observer wrapper
  if (nodeText.includes('observer(') || nodeText.includes('observer<')) {
    results.push({
      type: 'global',
      pattern: 'mobx',
      variableNames: ['observer'],
      line: 1,
      column: 1,
      derivedFromProps: false,
    });
  }
  
  // Check for useLocalObservable
  const useLocalObservableMatches = nodeText.matchAll(
    /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*useLocalObservable\s*\(/g
  );
  
  for (const match of useLocalObservableMatches) {
    if (match[1]) {
      const beforeMatch = nodeText.slice(0, match.index);
      const line = beforeMatch.split('\n').length;
      
      results.push({
        type: 'global',
        pattern: 'mobx',
        variableNames: [match[1]],
        line,
        column: 1,
        derivedFromProps: false,
      });
    }
  }
  
  return results;
}


/**
 * Detect Valtio usage in a component
 */
export function detectValtio(nodeText: string): StateUsageInfo[] {
  const results: StateUsageInfo[] = [];
  
  for (const hook of VALTIO_HOOKS) {
    const pattern = new RegExp(
      `const\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*${hook}\\s*\\(`,
      'g'
    );
    const matches = nodeText.matchAll(pattern);
    
    for (const match of matches) {
      if (match[1]) {
        const beforeMatch = nodeText.slice(0, match.index);
        const line = beforeMatch.split('\n').length;
        
        results.push({
          type: 'global',
          pattern: 'valtio',
          variableNames: [match[1]],
          line,
          column: 1,
          derivedFromProps: false,
        });
      }
    }
  }
  
  return results;
}

/**
 * Detect all global state patterns in a component
 */
export function detectGlobalState(nodeText: string, config: StatePatternConfig): StateUsageInfo[] {
  const results: StateUsageInfo[] = [
    ...detectUseContext(nodeText),
    ...detectRedux(nodeText),
    ...detectZustand(nodeText),
    ...detectJotai(nodeText),
    ...detectRecoil(nodeText),
    ...detectMobX(nodeText),
    ...detectValtio(nodeText),
  ];
  
  // Add server state patterns if configured
  if (config.detectServerState) {
    results.push(
      ...detectReactQuery(nodeText),
      ...detectSWR(nodeText)
    );
  }
  
  return results;
}


// ============================================================================
// Helper Functions - Issue Detection
// ============================================================================

/**
 * Detect prop drilling patterns
 */
export function detectPropDrilling(
  nodeText: string,
  props: string[]
): string[] {
  const passedDownProps: string[] = [];
  
  // Check if props are passed down to child components
  for (const prop of props) {
    // Match: <Component propName={propName} /> or propName={props.propName}
    const passedDownPattern = new RegExp(
      `<[A-Z][a-zA-Z0-9]*[^>]*\\s+(?:${prop}|[a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*\\{\\s*(?:${prop}|props\\.${prop})\\s*\\}`,
      'g'
    );
    
    if (passedDownPattern.test(nodeText)) {
      passedDownProps.push(prop);
    }
  }
  
  return passedDownProps;
}

/**
 * Detect state management issues in a component
 */
export function detectStateIssues(
  localState: StateUsageInfo[],
  globalState: StateUsageInfo[],
  passedDownProps: string[],
  config: StatePatternConfig
): StateIssue[] {
  const issues: StateIssue[] = [];
  
  // Check for mixed state management patterns
  if (config.flagMixedPatterns) {
    const globalPatterns = new Set(globalState.map(s => s.pattern));
    // Exclude server state patterns from mixed pattern detection
    const clientStatePatterns = new Set(
      [...globalPatterns].filter(p => p !== 'react-query' && p !== 'swr')
    );
    
    if (clientStatePatterns.size > 1) {
      const patternList = [...clientStatePatterns].join(', ');
      issues.push({
        type: 'mixed-patterns',
        description: `Component uses multiple global state management patterns: ${patternList}`,
        severity: 'warning',
        suggestion: 'Consider standardizing on a single state management solution for consistency',
        line: globalState[0]?.line || 1,
        column: 1,
      });
    }
  }
  
  // Check for excessive local state
  if (localState.length > config.maxLocalStateVariables) {
    issues.push({
      type: 'local-should-lift',
      description: `Component has ${localState.length} local state variables, which may indicate complex state that should be extracted`,
      severity: 'info',
      suggestion: 'Consider extracting related state into a custom hook or using useReducer',
      line: localState[0]?.line || 1,
      column: 1,
    });
  }
  
  // Check for potential prop drilling
  if (passedDownProps.length >= config.propDrillingThreshold) {
    issues.push({
      type: 'prop-drilling',
      description: `${passedDownProps.length} props are being passed down to child components`,
      severity: 'info',
      suggestion: 'Consider using Context or a state management library to avoid prop drilling',
      line: 1,
      column: 1,
    });
  }
  
  // Check for state derived from props (potential issue)
  const derivedState = localState.filter(s => s.derivedFromProps);
  if (derivedState.length > 0) {
    issues.push({
      type: 'global-should-be-local',
      description: `${derivedState.length} state variable(s) are derived from props, which can cause sync issues`,
      severity: 'info',
      suggestion: 'Consider computing derived values directly or using useMemo instead of useState',
      line: derivedState[0]?.line || 1,
      column: 1,
    });
  }
  
  return issues;
}


/**
 * Calculate state complexity score for a component
 */
export function calculateComplexityScore(
  localState: StateUsageInfo[],
  globalState: StateUsageInfo[],
  issues: StateIssue[]
): number {
  let score = 0;
  
  // Base score from state count
  score += localState.length * 1;
  score += globalState.length * 2; // Global state adds more complexity
  
  // Add complexity for issues
  for (const issue of issues) {
    switch (issue.severity) {
      case 'error':
        score += 5;
        break;
      case 'warning':
        score += 3;
        break;
      case 'info':
        score += 1;
        break;
    }
  }
  
  // Add complexity for mixed patterns
  const uniquePatterns = new Set([
    ...localState.map(s => s.pattern),
    ...globalState.map(s => s.pattern),
  ]);
  score += (uniquePatterns.size - 1) * 2;
  
  return score;
}

/**
 * Extract props from component signature
 */
export function extractPropsFromComponent(nodeText: string): string[] {
  const props: string[] = [];
  
  // Match destructured props: ({ prop1, prop2, prop3 })
  const destructuringMatch = nodeText.match(/\(\s*\{\s*([^}]+)\s*\}/);
  if (destructuringMatch?.[1]) {
    const propsStr = destructuringMatch[1];
    const propParts = propsStr.split(',');
    
    for (const part of propParts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('...')) {continue;}
      
      const propMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (propMatch?.[1]) {
        props.push(propMatch[1]);
      }
    }
  }
  
  // Also check for props.propName access
  const directAccessMatches = nodeText.matchAll(/props\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  for (const match of directAccessMatches) {
    if (match[1] && !props.includes(match[1])) {
      props.push(match[1]);
    }
  }
  
  return props;
}


// ============================================================================
// Helper Functions - Analysis
// ============================================================================

/**
 * Analyze a single component's state patterns
 */
export function analyzeComponentState(
  node: ASTNode,
  content: string,
  filePath: string,
  config: StatePatternConfig
): ComponentStateInfo | null {
  const componentName = getComponentName(node, content);
  if (!componentName) {
    return null;
  }
  
  const nodeText = node.text;
  const localState = detectLocalState(nodeText);
  const globalState = detectGlobalState(nodeText, config);
  const props = extractPropsFromComponent(nodeText);
  const passedDownProps = detectPropDrilling(nodeText, props);
  const issues = detectStateIssues(localState, globalState, passedDownProps, config);
  const complexityScore = calculateComplexityScore(localState, globalState, issues);
  
  return {
    componentName,
    filePath,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    localState,
    globalState,
    issues,
    passedDownProps,
    complexityScore,
  };
}

/**
 * Find dominant pattern from a list
 */
function findDominantPattern<T extends string>(
  patterns: T[],
  excludeValue: T
): { dominant: T; confidence: number } {
  const counts = new Map<T, number>();
  
  for (const pattern of patterns) {
    if (pattern !== excludeValue) {
      counts.set(pattern, (counts.get(pattern) || 0) + 1);
    }
  }
  
  let dominant: T = excludeValue;
  let maxCount = 0;
  
  for (const [pattern, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = pattern;
    }
  }
  
  const total = patterns.filter(p => p !== excludeValue).length;
  const confidence = total > 0 ? maxCount / total : 0;
  
  return { dominant, confidence };
}

/**
 * Analyze state patterns across multiple components
 */
export function analyzeStatePatterns(
  components: ComponentStateInfo[]
): StatePatternAnalysis {
  if (components.length === 0) {
    return {
      components: [],
      dominantLocalPattern: 'none',
      dominantGlobalPattern: 'none',
      confidence: { localPattern: 0, globalPattern: 0 },
      componentsWithIssues: [],
      healthScore: 1.0,
    };
  }
  
  // Collect all patterns
  const localPatterns: LocalStatePattern[] = [];
  const globalPatterns: GlobalStatePattern[] = [];
  
  for (const comp of components) {
    for (const state of comp.localState) {
      localPatterns.push(state.pattern as LocalStatePattern);
    }
    for (const state of comp.globalState) {
      globalPatterns.push(state.pattern as GlobalStatePattern);
    }
  }
  
  // Find dominant patterns
  const localResult = findDominantPattern(localPatterns, 'none');
  const globalResult = findDominantPattern(globalPatterns, 'none');
  
  // Find components with issues
  const componentsWithIssues = components.filter(c => c.issues.length > 0);
  
  // Calculate health score
  const totalIssues = components.reduce((sum, c) => sum + c.issues.length, 0);
  const avgComplexity = components.reduce((sum, c) => sum + c.complexityScore, 0) / components.length;
  const healthScore = Math.max(0, 1 - (totalIssues * 0.1) - (avgComplexity * 0.02));
  
  return {
    components,
    dominantLocalPattern: localResult.dominant,
    dominantGlobalPattern: globalResult.dominant,
    confidence: {
      localPattern: localResult.confidence,
      globalPattern: globalResult.confidence,
    },
    componentsWithIssues,
    healthScore,
  };
}


// ============================================================================
// Pattern Description Helpers
// ============================================================================

export const LOCAL_PATTERN_DESCRIPTIONS: Record<LocalStatePattern, string> = {
  'useState': 'React useState hook',
  'useReducer': 'React useReducer hook',
  'useRef': 'React useRef for mutable values',
  'class-state': 'Class component state',
  'none': 'no local state',
};

export const GLOBAL_PATTERN_DESCRIPTIONS: Record<GlobalStatePattern, string> = {
  'useContext': 'React Context API',
  'redux': 'Redux (useSelector/useDispatch)',
  'zustand': 'Zustand store',
  'jotai': 'Jotai atoms',
  'recoil': 'Recoil atoms',
  'react-query': 'React Query / TanStack Query',
  'swr': 'SWR',
  'mobx': 'MobX',
  'valtio': 'Valtio',
  'none': 'no global state',
};

// ============================================================================
// State Pattern Detector Class
// ============================================================================

/**
 * Detector for state management patterns
 *
 * Identifies local vs global state usage patterns and detects
 * state management inconsistencies.
 *
 * @requirements 8.5 - THE Component_Detector SHALL detect state management patterns (local vs global)
 */
export class StatePatternDetector extends ASTDetector {
  readonly id = 'components/state-patterns';
  readonly category = 'components' as const;
  readonly subcategory = 'state-management';
  readonly name = 'State Pattern Detector';
  readonly description = 'Detects local vs global state usage patterns and identifies state management inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  private config: StatePatternConfig;

  constructor(config: Partial<StatePatternConfig> = {}) {
    super();
    this.config = { ...DEFAULT_STATE_PATTERN_CONFIG, ...config };
  }

  /**
   * Detect state patterns in the project
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
    const analysis = analyzeStatePatterns(componentInfos);

    // Create pattern matches for detected patterns
    if (analysis.dominantLocalPattern !== 'none' && analysis.confidence.localPattern > 0.3) {
      patterns.push(this.createLocalStatePattern(context.file, analysis));
    }

    if (analysis.dominantGlobalPattern !== 'none' && analysis.confidence.globalPattern > 0.3) {
      patterns.push(this.createGlobalStatePattern(context.file, analysis));
    }

    // Generate violations for components with issues
    for (const comp of analysis.componentsWithIssues) {
      if (comp.filePath === context.file) {
        for (const issue of comp.issues) {
          const violation = this.createIssueViolation(context.file, comp, issue);
          violations.push(violation);
        }
      }
    }

    const overallConfidence = Math.max(
      analysis.confidence.localPattern,
      analysis.confidence.globalPattern,
      analysis.healthScore
    );

    return this.createResult(patterns, violations, overallConfidence);
  }


  /**
   * Generate a quick fix for state pattern violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Generate quick fixes based on issue type
    if (violation.message.includes('mixed-patterns')) {
      return {
        title: 'Standardize state management',
        kind: 'refactor',
        edit: { changes: {} },
        isPreferred: false,
        confidence: 0.5,
        preview: 'Consider refactoring to use a single state management solution',
      };
    }

    if (violation.message.includes('prop drilling')) {
      return {
        title: 'Extract to Context',
        kind: 'refactor',
        edit: { changes: {} },
        isPreferred: true,
        confidence: 0.6,
        preview: 'Create a Context provider to avoid prop drilling',
      };
    }

    if (violation.message.includes('local state variables')) {
      return {
        title: 'Extract to custom hook',
        kind: 'refactor',
        edit: { changes: {} },
        isPreferred: true,
        confidence: 0.7,
        preview: 'Extract related state into a custom hook',
      };
    }

    return null;
  }

  /**
   * Find all React components in a file
   */
  private findComponentsInFile(context: DetectionContext): ComponentStateInfo[] {
    const components: ComponentStateInfo[] = [];
    
    if (context.ast) {
      // Use AST to find components
      const functionNodes = this.findNodesByTypes(context.ast, [
        'function_declaration',
        'arrow_function',
        'function_expression',
      ]);
      
      for (const node of functionNodes) {
        if (isReactComponent(node, context.content)) {
          const info = analyzeComponentState(node, context.content, context.file, this.config);
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
  private findComponentsWithRegex(content: string, filePath: string): ComponentStateInfo[] {
    const components: ComponentStateInfo[] = [];
    
    // Match component patterns
    const patterns = [
      // Arrow function: const Button = ({ ... }) => ...
      /(?:export\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*(?::\s*(?:React\.)?(?:FC|FunctionComponent)\s*<[^>]*>\s*)?=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\}/g,
      // Function declaration: function Button({ ... }) { ... }
      /(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const componentName = match[1];
        if (!componentName) {continue;}
        
        const sourceCode = match[0];
        const beforeMatch = content.slice(0, match.index);
        const line = beforeMatch.split('\n').length;
        
        // Check if it returns JSX
        if (!sourceCode.includes('<') || (!sourceCode.includes('/>') && !sourceCode.includes('</'))) {
          continue;
        }
        
        const localState = detectLocalState(sourceCode);
        const globalState = detectGlobalState(sourceCode, this.config);
        const props = extractPropsFromComponent(sourceCode);
        const passedDownProps = detectPropDrilling(sourceCode, props);
        const issues = detectStateIssues(localState, globalState, passedDownProps, this.config);
        const complexityScore = calculateComplexityScore(localState, globalState, issues);
        
        components.push({
          componentName,
          filePath,
          line,
          column: 1,
          localState,
          globalState,
          issues,
          passedDownProps,
          complexityScore,
        });
      }
    }
    
    return components;
  }


  /**
   * Create a pattern match for local state patterns
   */
  private createLocalStatePattern(
    file: string,
    analysis: StatePatternAnalysis
  ): PatternMatch {
    return {
      patternId: `state-local-${analysis.dominantLocalPattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence.localPattern,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for global state patterns
   */
  private createGlobalStatePattern(
    file: string,
    analysis: StatePatternAnalysis
  ): PatternMatch {
    return {
      patternId: `state-global-${analysis.dominantGlobalPattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence.globalPattern,
      isOutlier: false,
    };
  }

  /**
   * Create a violation for a state issue
   */
  private createIssueViolation(
    file: string,
    component: ComponentStateInfo,
    issue: StateIssue
  ): Violation {
    const range: Range = {
      start: { line: issue.line, character: issue.column },
      end: { line: issue.line, character: issue.column + 1 },
    };

    return {
      id: `state-${issue.type}-${component.componentName}-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'components/state-patterns',
      severity: issue.severity,
      file,
      range,
      message: `[${component.componentName}] ${issue.description}`,
      expected: issue.suggestion,
      actual: issue.description,
      aiExplainAvailable: true,
      aiFixAvailable: issue.type === 'prop-drilling' || issue.type === 'local-should-lift',
      firstSeen: new Date(),
      occurrences: 1,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new StatePatternDetector instance
 */
export function createStatePatternDetector(
  config?: Partial<StatePatternConfig>
): StatePatternDetector {
  return new StatePatternDetector(config);
}
