/**
 * Props Patterns Detector - Component props handling pattern detection
 *
 * Detects props patterns including destructuring, defaults, spreading,
 * and type definitions. Identifies inconsistencies and reports violations.
 *
 * @requirements 8.2 - THE Component_Detector SHALL detect props patterns
 *   (destructuring, defaults, required vs optional)
 */

import { ASTDetector, type DetectionContext, type DetectionResult } from '../base/index.js';

import type { PatternMatch, Violation, QuickFix, Language, Range, ASTNode } from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

/**
 * Types of props destructuring patterns
 */
export type PropsDestructuringPattern =
  | 'signature'      // Props destructured in function signature: ({ name, value }) => ...
  | 'body'           // Props destructured in function body: const { name, value } = props
  | 'direct-access'  // Props accessed directly: props.name, props.value
  | 'none'           // No props (stateless component with no props)
  | 'unknown';

/**
 * Types of default props patterns
 */
export type DefaultPropsPattern =
  | 'static-defaultProps'     // Component.defaultProps = { ... }
  | 'default-parameters'      // ({ name = 'default' }) => ...
  | 'destructuring-defaults'  // const { name = 'default' } = props
  | 'logical-or'              // props.name || 'default'
  | 'nullish-coalescing'      // props.name ?? 'default'
  | 'none'                    // No defaults
  | 'unknown';

/**
 * Types of props spreading patterns
 */
export type PropsSpreadingPattern =
  | 'rest-spread'      // ({ name, ...rest }) => <Child {...rest} />
  | 'full-spread'      // (props) => <Child {...props} />
  | 'selective-spread' // <Child name={props.name} value={props.value} />
  | 'none'             // No spreading
  | 'unknown';

/**
 * Types of props type definition patterns
 */
export type PropsTypePattern =
  | 'interface'        // interface Props { ... }
  | 'type-alias'       // type Props = { ... }
  | 'inline'           // ({ name }: { name: string }) => ...
  | 'generic'          // FC<Props>, React.FC<Props>
  | 'prop-types'       // Component.propTypes = { ... }
  | 'none'             // No type definition
  | 'unknown';


/**
 * Information about a component's props handling
 */
export interface ComponentPropsInfo {
  /** Component name */
  componentName: string;
  /** File path */
  filePath: string;
  /** Line number where component is defined */
  line: number;
  /** Column number where component is defined */
  column: number;
  /** Destructuring pattern used */
  destructuringPattern: PropsDestructuringPattern;
  /** Default props pattern used */
  defaultPropsPattern: DefaultPropsPattern;
  /** Props spreading pattern used */
  spreadingPattern: PropsSpreadingPattern;
  /** Props type definition pattern used */
  typePattern: PropsTypePattern;
  /** Props type name (if defined) */
  propsTypeName: string | undefined;
  /** List of prop names with defaults */
  propsWithDefaults: string[];
  /** List of all prop names */
  allPropNames: string[];
  /** Whether component uses React.FC or similar */
  usesFCType: boolean;
}

/**
 * Analysis of props patterns in a project
 */
export interface PropsPatternAnalysis {
  /** All detected component props info */
  components: ComponentPropsInfo[];
  /** Dominant destructuring pattern */
  dominantDestructuringPattern: PropsDestructuringPattern;
  /** Dominant default props pattern */
  dominantDefaultPropsPattern: DefaultPropsPattern;
  /** Dominant spreading pattern */
  dominantSpreadingPattern: PropsSpreadingPattern;
  /** Dominant type pattern */
  dominantTypePattern: PropsTypePattern;
  /** Confidence scores for each pattern type */
  confidence: {
    destructuring: number;
    defaults: number;
    spreading: number;
    types: number;
  };
  /** Components that don't follow dominant patterns */
  inconsistentComponents: ComponentPropsInfo[];
}


// ============================================================================
// Constants
// ============================================================================

/**
 * React FC type patterns
 */
export const FC_TYPE_PATTERNS = [
  'FC',
  'FunctionComponent',
  'React.FC',
  'React.FunctionComponent',
  'VFC',
  'VoidFunctionComponent',
  'React.VFC',
  'React.VoidFunctionComponent',
] as const;

/**
 * Common props type name patterns
 */
export const PROPS_TYPE_NAME_PATTERNS = [
  /Props$/,
  /^I[A-Z].*Props$/,
  /^T[A-Z].*Props$/,
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a node represents a React component
 */
export function isReactComponent(node: ASTNode, content: string): boolean {
  // Check for function/arrow function that returns JSX
  if (node.type === 'function_declaration' || 
      node.type === 'arrow_function' ||
      node.type === 'function_expression') {
    // Component names should be PascalCase
    const name = getComponentName(node, content);
    if (!name || !/^[A-Z]/.test(name)) {
      return false;
    }
    // Check if it returns JSX (simplified check)
    const nodeText = node.text;
    return nodeText.includes('<') && (nodeText.includes('/>') || nodeText.includes('</'));
  }
  return false;
}

/**
 * Get the component name from a node
 */
export function getComponentName(node: ASTNode, content: string): string | undefined {
  // For function declarations, get the name directly
  if (node.type === 'function_declaration') {
    const nameNode = node.children.find(c => c.type === 'identifier');
    return nameNode?.text;
  }
  
  // For arrow functions and function expressions, look for variable declaration
  // This is a simplified approach - in real implementation would need parent context
  const lines = content.split('\n');
  const line = lines[node.startPosition.row];
  if (line) {
    // Match patterns like: const ComponentName = or export const ComponentName =
    const match = line.match(/(?:const|let|var|export\s+(?:const|let|var)?)\s+([A-Z][a-zA-Z0-9]*)\s*[=:]/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}


/**
 * Detect the destructuring pattern used in a component
 */
export function detectDestructuringPattern(
  node: ASTNode,
  _content: string
): PropsDestructuringPattern {
  const nodeText = node.text;
  
  // Check for signature destructuring: ({ prop1, prop2 }) =>
  // or function Component({ prop1, prop2 })
  if (node.type === 'arrow_function' || node.type === 'function_declaration' || node.type === 'function_expression') {
    // Look for object pattern in parameters
    const hasObjectPatternParam = nodeText.match(/\(\s*\{[^}]*\}\s*(?::[^)]+)?\s*\)/);
    if (hasObjectPatternParam) {
      return 'signature';
    }
    
    // Check for body destructuring: const { prop1, prop2 } = props
    const hasBodyDestructuring = nodeText.match(/(?:const|let|var)\s+\{[^}]+\}\s*=\s*props/);
    if (hasBodyDestructuring) {
      return 'body';
    }
    
    // Check for direct props access: props.propName
    const hasDirectAccess = nodeText.match(/props\.[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (hasDirectAccess) {
      return 'direct-access';
    }
    
    // Check if component has any props parameter
    const hasPropsParam = nodeText.match(/\(\s*props\s*(?::[^)]+)?\s*\)/) ||
                          nodeText.match(/function\s+\w+\s*\(\s*props\s*(?::[^)]+)?\s*\)/);
    if (!hasPropsParam && !hasObjectPatternParam) {
      return 'none';
    }
  }
  
  return 'unknown';
}

/**
 * Detect the default props pattern used in a component
 */
export function detectDefaultPropsPattern(
  node: ASTNode,
  content: string,
  componentName: string | undefined
): DefaultPropsPattern {
  const nodeText = node.text;
  
  // Check for default parameters in signature: ({ name = 'default' })
  const hasDefaultParams = nodeText.match(/\(\s*\{[^}]*=\s*[^,}]+[^}]*\}/);
  if (hasDefaultParams) {
    return 'default-parameters';
  }
  
  // Check for destructuring defaults in body: const { name = 'default' } = props
  const hasDestructuringDefaults = nodeText.match(/(?:const|let|var)\s+\{[^}]*=\s*[^,}]+[^}]*\}\s*=\s*props/);
  if (hasDestructuringDefaults) {
    return 'destructuring-defaults';
  }
  
  // Check for nullish coalescing: props.name ?? 'default'
  const hasNullishCoalescing = nodeText.match(/props\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*\?\?/);
  if (hasNullishCoalescing) {
    return 'nullish-coalescing';
  }
  
  // Check for logical OR: props.name || 'default'
  const hasLogicalOr = nodeText.match(/props\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*\|\|/);
  if (hasLogicalOr) {
    return 'logical-or';
  }
  
  // Check for static defaultProps (need to look in surrounding content)
  if (componentName) {
    const defaultPropsPattern = new RegExp(`${componentName}\\.defaultProps\\s*=`);
    if (defaultPropsPattern.test(content)) {
      return 'static-defaultProps';
    }
  }
  
  return 'none';
}


/**
 * Detect the props spreading pattern used in a component
 */
export function detectSpreadingPattern(
  node: ASTNode,
  _content: string
): PropsSpreadingPattern {
  const nodeText = node.text;
  
  // Check for rest spread: ({ name, ...rest }) and {...rest}
  const hasRestParam = nodeText.match(/\(\s*\{[^}]*,\s*\.\.\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}/);
  const hasRestSpread = nodeText.match(/\{\s*\.\.\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}/);
  if (hasRestParam && hasRestSpread) {
    return 'rest-spread';
  }
  
  // Check for full props spread: {...props}
  const hasFullSpread = nodeText.match(/\{\s*\.\.\.props\s*\}/);
  if (hasFullSpread) {
    return 'full-spread';
  }
  
  // Check for selective spreading (passing individual props)
  const hasSelectiveSpread = nodeText.match(/<[A-Z][a-zA-Z0-9]*[^>]*\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*\{/);
  if (hasSelectiveSpread && !hasFullSpread && !hasRestSpread) {
    return 'selective-spread';
  }
  
  return 'none';
}

/**
 * Detect the props type definition pattern used in a component
 */
export function detectTypePattern(
  node: ASTNode,
  content: string,
  componentName: string | undefined
): PropsTypePattern {
  const nodeText = node.text;
  
  // Check for inline type: ({ name }: { name: string })
  const hasInlineType = nodeText.match(/\(\s*\{[^}]*\}\s*:\s*\{[^}]+\}\s*\)/);
  if (hasInlineType) {
    return 'inline';
  }
  
  // Check for FC generic type: FC<Props>, React.FC<Props>
  const hasFCType = FC_TYPE_PATTERNS.some(pattern => {
    const regex = new RegExp(`:\\s*${pattern.replace('.', '\\.')}\\s*<`);
    return regex.test(nodeText) || regex.test(content.split('\n')[node.startPosition.row] || '');
  });
  if (hasFCType) {
    return 'generic';
  }
  
  // Check for type annotation on props parameter
  const hasTypeAnnotation = nodeText.match(/\(\s*(?:\{[^}]*\}|props)\s*:\s*([A-Z][a-zA-Z0-9]*(?:Props)?)\s*\)/);
  if (hasTypeAnnotation) {
    // Determine if it's interface or type alias by looking in content
    const typeName = hasTypeAnnotation[1];
    if (typeName) {
      const interfacePattern = new RegExp(`interface\\s+${typeName}\\s*\\{`);
      const typePattern = new RegExp(`type\\s+${typeName}\\s*=`);
      
      if (interfacePattern.test(content)) {
        return 'interface';
      }
      if (typePattern.test(content)) {
        return 'type-alias';
      }
    }
  }
  
  // Check for propTypes
  if (componentName) {
    const propTypesPattern = new RegExp(`${componentName}\\.propTypes\\s*=`);
    if (propTypesPattern.test(content)) {
      return 'prop-types';
    }
  }
  
  return 'none';
}


/**
 * Extract prop names from a component
 */
export function extractPropNames(node: ASTNode, _content: string): string[] {
  const nodeText = node.text;
  const propNames: string[] = [];
  
  // Extract from signature destructuring: ({ prop1, prop2, prop3 = 'default' })
  const signatureMatch = nodeText.match(/\(\s*\{\s*([^}]+)\s*\}/);
  if (signatureMatch?.[1]) {
    const propsStr = signatureMatch[1];
    // Split by comma and extract prop names
    const props = propsStr.split(',').map(p => {
      // Handle: prop, prop = default, prop: alias, ...rest
      const trimmed = p.trim();
      if (trimmed.startsWith('...')) {return null;} // Skip rest spread
      const nameMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      return nameMatch ? nameMatch[1] : null;
    }).filter((p): p is string => p !== null);
    propNames.push(...props);
  }
  
  // Extract from body destructuring: const { prop1, prop2 } = props
  const bodyMatch = nodeText.match(/(?:const|let|var)\s+\{\s*([^}]+)\s*\}\s*=\s*props/);
  if (bodyMatch?.[1]) {
    const propsStr = bodyMatch[1];
    const props = propsStr.split(',').map(p => {
      const trimmed = p.trim();
      if (trimmed.startsWith('...')) {return null;}
      const nameMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      return nameMatch ? nameMatch[1] : null;
    }).filter((p): p is string => p !== null);
    propNames.push(...props);
  }
  
  // Extract from direct access: props.propName
  const directAccessMatches = nodeText.matchAll(/props\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  for (const match of directAccessMatches) {
    if (match[1] && !propNames.includes(match[1])) {
      propNames.push(match[1]);
    }
  }
  
  return [...new Set(propNames)]; // Remove duplicates
}

/**
 * Extract prop names that have default values
 */
export function extractPropsWithDefaults(node: ASTNode, _content: string): string[] {
  const nodeText = node.text;
  const propsWithDefaults: string[] = [];
  
  // Extract from signature defaults: ({ prop1 = 'default', prop2 = 42 })
  const signatureMatch = nodeText.match(/\(\s*\{\s*([^}]+)\s*\}/);
  if (signatureMatch?.[1]) {
    const propsStr = signatureMatch[1];
    const props = propsStr.split(',').map(p => {
      const trimmed = p.trim();
      // Match: propName = defaultValue
      const defaultMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      return defaultMatch ? defaultMatch[1] : null;
    }).filter((p): p is string => p !== null);
    propsWithDefaults.push(...props);
  }
  
  // Extract from body destructuring defaults
  const bodyMatch = nodeText.match(/(?:const|let|var)\s+\{\s*([^}]+)\s*\}\s*=\s*props/);
  if (bodyMatch?.[1]) {
    const propsStr = bodyMatch[1];
    const props = propsStr.split(',').map(p => {
      const trimmed = p.trim();
      const defaultMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      return defaultMatch ? defaultMatch[1] : null;
    }).filter((p): p is string => p !== null);
    propsWithDefaults.push(...props);
  }
  
  return [...new Set(propsWithDefaults)];
}


/**
 * Get props type name from a component
 */
export function getPropsTypeName(node: ASTNode, content: string): string | undefined {
  const nodeText = node.text;
  const line = content.split('\n')[node.startPosition.row] || '';
  
  // Check for FC<PropsType>
  for (const fcPattern of FC_TYPE_PATTERNS) {
    const regex = new RegExp(`${fcPattern.replace('.', '\\.')}\\s*<\\s*([A-Z][a-zA-Z0-9]*)\\s*>`);
    const match = line.match(regex) || nodeText.match(regex);
    if (match?.[1]) {
      return match[1];
    }
  }
  
  // Check for type annotation: (props: PropsType) or ({ ... }: PropsType)
  const typeAnnotationMatch = nodeText.match(/\)\s*:\s*([A-Z][a-zA-Z0-9]*(?:Props)?)\s*(?:=>|\{)/);
  if (typeAnnotationMatch?.[1]) {
    return typeAnnotationMatch[1];
  }
  
  // Check for parameter type: (props: PropsType)
  const paramTypeMatch = nodeText.match(/\(\s*(?:\{[^}]*\}|props)\s*:\s*([A-Z][a-zA-Z0-9]*(?:Props)?)\s*\)/);
  if (paramTypeMatch?.[1]) {
    return paramTypeMatch[1];
  }
  
  return undefined;
}

/**
 * Check if component uses FC type
 */
export function usesFCType(node: ASTNode, content: string): boolean {
  const line = content.split('\n')[node.startPosition.row] || '';
  return FC_TYPE_PATTERNS.some(pattern => {
    const regex = new RegExp(`:\\s*${pattern.replace('.', '\\.')}\\s*<`);
    return regex.test(line);
  });
}

/**
 * Analyze a single component's props patterns
 */
export function analyzeComponentProps(
  node: ASTNode,
  content: string,
  filePath: string
): ComponentPropsInfo | null {
  const componentName = getComponentName(node, content);
  if (!componentName) {
    return null;
  }
  
  return {
    componentName,
    filePath,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    destructuringPattern: detectDestructuringPattern(node, content),
    defaultPropsPattern: detectDefaultPropsPattern(node, content, componentName),
    spreadingPattern: detectSpreadingPattern(node, content),
    typePattern: detectTypePattern(node, content, componentName),
    propsTypeName: getPropsTypeName(node, content),
    propsWithDefaults: extractPropsWithDefaults(node, content),
    allPropNames: extractPropNames(node, content),
    usesFCType: usesFCType(node, content),
  };
}


/**
 * Find the dominant pattern from a list of patterns
 */
function findDominantPattern<T extends string>(
  patterns: T[],
  excludeValues: T[] = []
): { dominant: T; confidence: number } {
  const counts = new Map<T, number>();
  
  for (const pattern of patterns) {
    if (!excludeValues.includes(pattern)) {
      counts.set(pattern, (counts.get(pattern) || 0) + 1);
    }
  }
  
  let dominant: T = patterns[0] || ('unknown' as T);
  let maxCount = 0;
  
  for (const [pattern, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = pattern;
    }
  }
  
  const total = patterns.filter(p => !excludeValues.includes(p)).length;
  const confidence = total > 0 ? maxCount / total : 0;
  
  return { dominant, confidence };
}

/**
 * Analyze props patterns across multiple components
 */
export function analyzePropsPatterns(
  components: ComponentPropsInfo[]
): PropsPatternAnalysis {
  if (components.length === 0) {
    return {
      components: [],
      dominantDestructuringPattern: 'unknown',
      dominantDefaultPropsPattern: 'none',
      dominantSpreadingPattern: 'none',
      dominantTypePattern: 'none',
      confidence: {
        destructuring: 0,
        defaults: 0,
        spreading: 0,
        types: 0,
      },
      inconsistentComponents: [],
    };
  }
  
  // Find dominant patterns
  const destructuringResult = findDominantPattern(
    components.map(c => c.destructuringPattern),
    ['unknown', 'none']
  );
  
  const defaultsResult = findDominantPattern(
    components.map(c => c.defaultPropsPattern),
    ['unknown', 'none']
  );
  
  const spreadingResult = findDominantPattern(
    components.map(c => c.spreadingPattern),
    ['unknown', 'none']
  );
  
  const typesResult = findDominantPattern(
    components.map(c => c.typePattern),
    ['unknown', 'none']
  );
  
  // Find inconsistent components
  const inconsistentComponents = components.filter(c => {
    // A component is inconsistent if it uses a different pattern than dominant
    // and the pattern is not 'none' or 'unknown'
    const destructuringInconsistent = 
      c.destructuringPattern !== destructuringResult.dominant &&
      c.destructuringPattern !== 'none' &&
      c.destructuringPattern !== 'unknown' &&
      destructuringResult.confidence > 0.5;
    
    const defaultsInconsistent =
      c.defaultPropsPattern !== defaultsResult.dominant &&
      c.defaultPropsPattern !== 'none' &&
      c.defaultPropsPattern !== 'unknown' &&
      defaultsResult.confidence > 0.5;
    
    const typesInconsistent =
      c.typePattern !== typesResult.dominant &&
      c.typePattern !== 'none' &&
      c.typePattern !== 'unknown' &&
      typesResult.confidence > 0.5;
    
    return destructuringInconsistent || defaultsInconsistent || typesInconsistent;
  });
  
  return {
    components,
    dominantDestructuringPattern: destructuringResult.dominant,
    dominantDefaultPropsPattern: defaultsResult.dominant,
    dominantSpreadingPattern: spreadingResult.dominant,
    dominantTypePattern: typesResult.dominant,
    confidence: {
      destructuring: destructuringResult.confidence,
      defaults: defaultsResult.confidence,
      spreading: spreadingResult.confidence,
      types: typesResult.confidence,
    },
    inconsistentComponents,
  };
}


/**
 * Generate a suggestion for refactoring props handling
 */
export function generatePropsSuggestion(
  component: ComponentPropsInfo,
  targetDestructuring: PropsDestructuringPattern,
  targetDefaults: DefaultPropsPattern,
  targetTypes: PropsTypePattern
): string {
  const suggestions: string[] = [];
  
  if (component.destructuringPattern !== targetDestructuring && 
      component.destructuringPattern !== 'none' &&
      component.destructuringPattern !== 'unknown') {
    const destructuringDescriptions: Record<PropsDestructuringPattern, string> = {
      'signature': 'destructure props in function signature',
      'body': 'destructure props in function body',
      'direct-access': 'access props directly',
      'none': 'no props',
      'unknown': 'unknown pattern',
    };
    suggestions.push(`Consider ${destructuringDescriptions[targetDestructuring]}`);
  }
  
  if (component.defaultPropsPattern !== targetDefaults &&
      component.defaultPropsPattern !== 'none' &&
      component.defaultPropsPattern !== 'unknown') {
    const defaultsDescriptions: Record<DefaultPropsPattern, string> = {
      'static-defaultProps': 'using static defaultProps',
      'default-parameters': 'using default parameters in signature',
      'destructuring-defaults': 'using defaults in destructuring',
      'logical-or': 'using logical OR for defaults',
      'nullish-coalescing': 'using nullish coalescing for defaults',
      'none': 'no defaults',
      'unknown': 'unknown pattern',
    };
    suggestions.push(`Consider ${defaultsDescriptions[targetDefaults]}`);
  }
  
  if (component.typePattern !== targetTypes &&
      component.typePattern !== 'none' &&
      component.typePattern !== 'unknown') {
    const typeDescriptions: Record<PropsTypePattern, string> = {
      'interface': 'using interface for props type',
      'type-alias': 'using type alias for props type',
      'inline': 'using inline type annotation',
      'generic': 'using FC<Props> generic type',
      'prop-types': 'using PropTypes',
      'none': 'no type definition',
      'unknown': 'unknown pattern',
    };
    suggestions.push(`Consider ${typeDescriptions[targetTypes]}`);
  }
  
  return suggestions.join('. ');
}

// ============================================================================
// Pattern Description Helpers
// ============================================================================

const DESTRUCTURING_DESCRIPTIONS: Record<PropsDestructuringPattern, string> = {
  'signature': 'props destructured in function signature',
  'body': 'props destructured in function body',
  'direct-access': 'props accessed directly',
  'none': 'no props',
  'unknown': 'unknown pattern',
};

const DEFAULTS_DESCRIPTIONS: Record<DefaultPropsPattern, string> = {
  'static-defaultProps': 'static defaultProps',
  'default-parameters': 'default parameters in signature',
  'destructuring-defaults': 'defaults in destructuring',
  'logical-or': 'logical OR for defaults',
  'nullish-coalescing': 'nullish coalescing for defaults',
  'none': 'no defaults',
  'unknown': 'unknown pattern',
};

const TYPE_DESCRIPTIONS: Record<PropsTypePattern, string> = {
  'interface': 'interface for props type',
  'type-alias': 'type alias for props type',
  'inline': 'inline type annotation',
  'generic': 'FC<Props> generic type',
  'prop-types': 'PropTypes',
  'none': 'no type definition',
  'unknown': 'unknown pattern',
};


// ============================================================================
// Props Patterns Detector Class
// ============================================================================

/**
 * Detector for component props patterns
 *
 * Identifies props handling patterns including destructuring, defaults,
 * spreading, and type definitions. Reports violations when components
 * don't follow the dominant pattern.
 *
 * @requirements 8.2 - THE Component_Detector SHALL detect props patterns
 */
export class PropsPatternDetector extends ASTDetector {
  readonly id = 'components/props-patterns';
  readonly category = 'components' as const;
  readonly subcategory = 'props-handling';
  readonly name = 'Props Pattern Detector';
  readonly description = 'Detects props handling patterns (destructuring, defaults, types) and identifies inconsistencies';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];

  /**
   * Detect props patterns in the project
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const patterns: PatternMatch[] = [];
    const violations: Violation[] = [];

    // If no AST, try to detect patterns from content using regex
    const componentInfos = this.findComponentsInFile(context);
    
    if (componentInfos.length === 0) {
      return this.createEmptyResult();
    }

    // Analyze patterns across all components
    const analysis = analyzePropsPatterns(componentInfos);

    // Create pattern matches for detected patterns
    if (analysis.dominantDestructuringPattern !== 'unknown' && analysis.confidence.destructuring > 0.3) {
      patterns.push(this.createDestructuringPattern(context.file, analysis));
    }

    if (analysis.dominantDefaultPropsPattern !== 'none' && analysis.confidence.defaults > 0.3) {
      patterns.push(this.createDefaultsPattern(context.file, analysis));
    }

    if (analysis.dominantTypePattern !== 'none' && analysis.confidence.types > 0.3) {
      patterns.push(this.createTypePattern(context.file, analysis));
    }

    // Generate violations for inconsistent components in current file
    for (const inconsistent of analysis.inconsistentComponents) {
      if (inconsistent.filePath === context.file) {
        const violation = this.createInconsistencyViolation(inconsistent, analysis);
        if (violation) {
          violations.push(violation);
        }
      }
    }

    const overallConfidence = Math.max(
      analysis.confidence.destructuring,
      analysis.confidence.defaults,
      analysis.confidence.types
    );

    return this.createResult(patterns, violations, overallConfidence);
  }

  /**
   * Find all React components in a file
   */
  private findComponentsInFile(context: DetectionContext): ComponentPropsInfo[] {
    const components: ComponentPropsInfo[] = [];
    
    if (context.ast) {
      // Use AST to find components
      const functionNodes = this.findNodesByTypes(context.ast, [
        'function_declaration',
        'arrow_function',
        'function_expression',
      ]);
      
      for (const node of functionNodes) {
        if (isReactComponent(node, context.content)) {
          const info = analyzeComponentProps(node, context.content, context.file);
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
  private findComponentsWithRegex(content: string, filePath: string): ComponentPropsInfo[] {
    const components: ComponentPropsInfo[] = [];
    const seenComponents = new Set<string>();
    
    // Multiple patterns for different component styles
    // Arrow function: const Button = ({ name }) => ...
    const arrowPattern = /(?:export\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*(?::\s*(?:React\.)?(?:FC|FunctionComponent|VFC)\s*<[^>]*>\s*)?=\s*\(/g;
    // Function declaration: function Button({ name }) { ... }
    const functionPattern = /(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g;
    
    const processPattern = (pattern: RegExp) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const componentName = match[1];
        if (!componentName || seenComponents.has(componentName)) {continue;}
        
        // Find the line number
        const beforeMatch = content.slice(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;
        
        // Get the component body - find the matching closing brace/paren
        const startIndex = match.index;
        let braceCount = 0;
        let parenCount = 0;
        let endIndex = startIndex;
        let foundArrow = false;
        let inFunctionBody = false;
        
        for (let i = startIndex; i < content.length && i < startIndex + 10000; i++) {
          const char = content[i];
          
          if (char === '(') {
            parenCount++;
          } else if (char === ')') {
            parenCount--;
          } else if (char === '=' && content[i + 1] === '>') {
            foundArrow = true;
            // Check if next non-whitespace char is { (block body) or something else (expression body)
            let j = i + 2;
            while (j < content.length && /\s/.test(content[j] || '')) {j++;}
            if (content[j] === '{') {
              inFunctionBody = true;
            }
          } else if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (inFunctionBody && braceCount === 0 && parenCount <= 0) {
              endIndex = i + 1;
              break;
            }
          } else if ((char === ';' || (char === '\n' && i > startIndex + 20)) && foundArrow && !inFunctionBody && parenCount <= 0) {
            // End of arrow function with expression body
            endIndex = i + 1;
            break;
          }
        }
        
        // If we didn't find a proper end, try to get a reasonable chunk
        if (endIndex === startIndex) {
          endIndex = Math.min(startIndex + 2000, content.length);
        }
        
        const componentBody = content.slice(startIndex, endIndex);
        
        // Check if it returns JSX - look for < followed by a tag name
        const hasJSX = /<[A-Za-z]/.test(componentBody);
        if (!hasJSX) {
          continue;
        }
        
        seenComponents.add(componentName);
        
        // Create a mock node for analysis
        const mockNode: ASTNode = {
          type: 'function_declaration',
          text: componentBody,
          startPosition: { row: lineNumber - 1, column: 0 },
          endPosition: { row: lineNumber - 1 + componentBody.split('\n').length, column: 0 },
          children: [],
        };
        
        const info = analyzeComponentProps(mockNode, content, filePath);
        if (info) {
          components.push(info);
        }
      }
    };
    
    processPattern(arrowPattern);
    processPattern(functionPattern);
    
    return components;
  }

  /**
   * Create a pattern match for destructuring pattern
   */
  private createDestructuringPattern(
    file: string,
    analysis: PropsPatternAnalysis
  ): PatternMatch {
    return {
      patternId: `props-destructuring-${analysis.dominantDestructuringPattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence.destructuring,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for defaults pattern
   */
  private createDefaultsPattern(
    file: string,
    analysis: PropsPatternAnalysis
  ): PatternMatch {
    return {
      patternId: `props-defaults-${analysis.dominantDefaultPropsPattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence.defaults,
      isOutlier: false,
    };
  }

  /**
   * Create a pattern match for type pattern
   */
  private createTypePattern(
    file: string,
    analysis: PropsPatternAnalysis
  ): PatternMatch {
    return {
      patternId: `props-types-${analysis.dominantTypePattern}`,
      location: { file, line: 1, column: 1 },
      confidence: analysis.confidence.types,
      isOutlier: false,
    };
  }


  /**
   * Create a violation for an inconsistent component
   */
  private createInconsistencyViolation(
    component: ComponentPropsInfo,
    analysis: PropsPatternAnalysis
  ): Violation | null {
    const inconsistencies: string[] = [];
    
    // Check destructuring inconsistency
    if (component.destructuringPattern !== analysis.dominantDestructuringPattern &&
        component.destructuringPattern !== 'none' &&
        component.destructuringPattern !== 'unknown' &&
        analysis.confidence.destructuring > 0.5) {
      inconsistencies.push(
        `uses ${DESTRUCTURING_DESCRIPTIONS[component.destructuringPattern]} but project uses ${DESTRUCTURING_DESCRIPTIONS[analysis.dominantDestructuringPattern]}`
      );
    }
    
    // Check defaults inconsistency
    if (component.defaultPropsPattern !== analysis.dominantDefaultPropsPattern &&
        component.defaultPropsPattern !== 'none' &&
        component.defaultPropsPattern !== 'unknown' &&
        analysis.confidence.defaults > 0.5) {
      inconsistencies.push(
        `uses ${DEFAULTS_DESCRIPTIONS[component.defaultPropsPattern]} but project uses ${DEFAULTS_DESCRIPTIONS[analysis.dominantDefaultPropsPattern]}`
      );
    }
    
    // Check type inconsistency
    if (component.typePattern !== analysis.dominantTypePattern &&
        component.typePattern !== 'none' &&
        component.typePattern !== 'unknown' &&
        analysis.confidence.types > 0.5) {
      inconsistencies.push(
        `uses ${TYPE_DESCRIPTIONS[component.typePattern]} but project uses ${TYPE_DESCRIPTIONS[analysis.dominantTypePattern]}`
      );
    }
    
    if (inconsistencies.length === 0) {
      return null;
    }
    
    const range: Range = {
      start: { line: component.line, character: component.column },
      end: { line: component.line, character: component.column },
    };
    
    const suggestion = generatePropsSuggestion(
      component,
      analysis.dominantDestructuringPattern,
      analysis.dominantDefaultPropsPattern,
      analysis.dominantTypePattern
    );

    return {
      id: `props-pattern-${component.componentName}-${component.filePath.replace(/[^a-zA-Z0-9]/g, '-')}`,
      patternId: 'components/props-patterns',
      severity: 'warning',
      file: component.filePath,
      range,
      message: `Component '${component.componentName}' ${inconsistencies.join('; ')}. ${suggestion}`,
      expected: `Consistent props handling following project patterns`,
      actual: `Inconsistent props handling in ${component.componentName}`,
      aiExplainAvailable: true,
      aiFixAvailable: true,
      firstSeen: new Date(),
      occurrences: 1,
    };
  }

  /**
   * Generate a quick fix for props pattern violations
   */
  generateQuickFix(violation: Violation): QuickFix | null {
    // Extract the target pattern from the violation message
    const destructuringMatch = violation.message.match(/project uses (props destructured in function signature|props destructured in function body|props accessed directly)/);
    const defaultsMatch = violation.message.match(/project uses (default parameters in signature|defaults in destructuring|static defaultProps)/);
    const typesMatch = violation.message.match(/project uses (interface for props type|type alias for props type|FC<Props> generic type)/);
    
    if (!destructuringMatch && !defaultsMatch && !typesMatch) {
      return null;
    }

    const suggestions: string[] = [];
    if (destructuringMatch) {suggestions.push(destructuringMatch[1]!);}
    if (defaultsMatch) {suggestions.push(defaultsMatch[1]!);}
    if (typesMatch) {suggestions.push(typesMatch[1]!);}

    return {
      title: `Refactor to use ${suggestions.join(', ')}`,
      kind: 'refactor',
      edit: {
        changes: {},
        documentChanges: [
          { uri: violation.file, edits: [] },
        ],
      },
      isPreferred: true,
      confidence: 0.6,
      preview: `Refactor props handling to follow project patterns`,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PropsPatternDetector instance
 */
export function createPropsPatternDetector(): PropsPatternDetector {
  return new PropsPatternDetector();
}
