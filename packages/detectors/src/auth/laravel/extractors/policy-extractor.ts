/**
 * Laravel Policy Extractor
 *
 * Extracts Policy class definitions and authorize calls from Laravel code.
 *
 * @module auth/laravel/extractors/policy-extractor
 */

import { isStandardPolicyAction } from '../types.js';

import type {
  PolicyInfo,
  PolicyMethod,
  PolicyParameter,
  PolicyRegistration,
  AuthorizeCall,
  CanMiddleware,
  PolicyExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Policy class definition
 */
const POLICY_CLASS_PATTERN = /class\s+(\w+Policy)\s+(?:extends\s+(\w+))?\s*\{/g;

/**
 * Policy method definition
 */
const POLICY_METHOD_PATTERN = /public\s+function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+(?:\|\w+)*))?\s*\{/g;

/**
 * Policy registration in AuthServiceProvider
 * Gate::policy(Model::class, ModelPolicy::class)
 */
const POLICY_REGISTRATION_PATTERN = /Gate::policy\s*\(\s*([A-Z]\w+)::class\s*,\s*([A-Z]\w+Policy)::class\s*\)/g;

/**
 * $policies array in AuthServiceProvider
 */
const POLICIES_ARRAY_PATTERN = /protected\s+\$policies\s*=\s*\[([\s\S]*?)\];/g;

/**
 * Policy mapping in $policies array
 */
const POLICY_MAPPING_PATTERN = /([A-Z]\w+)::class\s*=>\s*([A-Z]\w+Policy)::class/g;

/**
 * $this->authorize() calls
 */
const AUTHORIZE_CALL_PATTERN = /\$this->authorize\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*([^)]+))?\)/g;

/**
 * authorize() helper function calls
 */
const AUTHORIZE_HELPER_PATTERN = /(?<!\$this->)authorize\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*([^)]+))?\)/g;

/**
 * HandlesAuthorization trait usage
 */
const HANDLES_AUTH_PATTERN = /use\s+(?:Illuminate\\Auth\\Access\\)?HandlesAuthorization\s*;/;

/**
 * ->can() middleware on routes
 */
const CAN_MIDDLEWARE_PATTERN = /->can\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*['"]?([^'")]+)['"]?)?\s*\)/g;

// ============================================================================
// Policy Extractor
// ============================================================================

/**
 * Extracts Laravel Policy definitions and authorize calls
 */
export class PolicyExtractor {
  /**
   * Extract all policy-related patterns from content
   */
  extract(content: string, file: string): PolicyExtractionResult {
    const policies = this.extractPolicies(content, file);
    const registrations = this.extractRegistrations(content, file);
    const authorizeCalls = this.extractAuthorizeCalls(content, file);
    const canMiddleware = this.extractCanMiddleware(content, file);

    const confidence = this.calculateConfidence(policies, registrations, authorizeCalls);

    return {
      policies,
      registrations,
      authorizeCalls,
      canMiddleware,
      confidence,
    };
  }

  /**
   * Check if content contains policy patterns
   */
  hasPolicies(content: string): boolean {
    return (
      content.includes('Policy') ||
      content.includes('->authorize(') ||
      content.includes('Gate::policy')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract Policy class definitions
   */
  private extractPolicies(content: string, file: string): PolicyInfo[] {
    const policies: PolicyInfo[] = [];
    POLICY_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = POLICY_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract namespace
      const namespace = this.extractNamespace(content);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      // Extract methods
      const methods = this.extractPolicyMethods(classBody, line);

      // Check for HandlesAuthorization trait
      const usesHandlesAuthorization = HANDLES_AUTH_PATTERN.test(classBody);

      // Infer model class from policy name
      const modelClass = this.inferModelClass(name);

      policies.push({
        name,
        fqn: namespace ? `${namespace}\\${name}` : name,
        namespace,
        modelClass,
        methods,
        usesHandlesAuthorization,
        file,
        line,
      });
    }

    return policies;
  }

  /**
   * Extract policy methods from class body
   */
  private extractPolicyMethods(classBody: string, classLine: number): PolicyMethod[] {
    const methods: PolicyMethod[] = [];
    POLICY_METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = POLICY_METHOD_PATTERN.exec(classBody)) !== null) {
      const name = match[1] || '';
      const paramsStr = match[2] || '';
      const returnType = match[3] || null;
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      const parameters = this.parseParameters(paramsStr);
      const isStandardAction = isStandardPolicyAction(name);

      methods.push({
        name,
        isStandardAction,
        parameters,
        returnType,
        line,
      });
    }

    return methods;
  }

  /**
   * Extract policy registrations
   */
  private extractRegistrations(content: string, file: string): PolicyRegistration[] {
    const registrations: PolicyRegistration[] = [];

    // Gate::policy() calls
    POLICY_REGISTRATION_PATTERN.lastIndex = 0;
    let match;
    while ((match = POLICY_REGISTRATION_PATTERN.exec(content)) !== null) {
      registrations.push({
        modelClass: match[1] || '',
        policyClass: match[2] || '',
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    // $policies array
    POLICIES_ARRAY_PATTERN.lastIndex = 0;
    while ((match = POLICIES_ARRAY_PATTERN.exec(content)) !== null) {
      const arrayContent = match[1] || '';
      const arrayLine = this.getLineNumber(content, match.index);

      POLICY_MAPPING_PATTERN.lastIndex = 0;
      let mappingMatch;
      while ((mappingMatch = POLICY_MAPPING_PATTERN.exec(arrayContent)) !== null) {
        registrations.push({
          modelClass: mappingMatch[1] || '',
          policyClass: mappingMatch[2] || '',
          file,
          line: arrayLine + this.getLineNumber(arrayContent.substring(0, mappingMatch.index), 0),
        });
      }
    }

    return registrations;
  }

  /**
   * Extract authorize calls
   */
  private extractAuthorizeCalls(content: string, file: string): AuthorizeCall[] {
    const calls: AuthorizeCall[] = [];

    // $this->authorize()
    AUTHORIZE_CALL_PATTERN.lastIndex = 0;
    let match;
    while ((match = AUTHORIZE_CALL_PATTERN.exec(content)) !== null) {
      calls.push({
        ability: match[1] || '',
        arguments: match[2] ? this.parseArguments(match[2]) : [],
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    // authorize() helper
    AUTHORIZE_HELPER_PATTERN.lastIndex = 0;
    while ((match = AUTHORIZE_HELPER_PATTERN.exec(content)) !== null) {
      calls.push({
        ability: match[1] || '',
        arguments: match[2] ? this.parseArguments(match[2]) : [],
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    return calls;
  }

  /**
   * Extract ->can() middleware usages
   */
  private extractCanMiddleware(content: string, file: string): CanMiddleware[] {
    const canMiddleware: CanMiddleware[] = [];

    CAN_MIDDLEWARE_PATTERN.lastIndex = 0;
    let match;
    while ((match = CAN_MIDDLEWARE_PATTERN.exec(content)) !== null) {
      canMiddleware.push({
        ability: match[1] || '',
        model: match[2] || null,
        file,
        line: this.getLineNumber(content, match.index),
      });
    }

    return canMiddleware;
  }

  /**
   * Parse method parameters
   */
  private parseParameters(paramsStr: string): PolicyParameter[] {
    const params: PolicyParameter[] = [];
    const parts = paramsStr.split(',');

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]?.trim();
      if (!part) {continue;}

      const match = part.match(/(?:(\??\w+(?:\|\w+)*)\s+)?\$(\w+)/);
      if (match) {
        const type = match[1] || null;
        const name = match[2] || '';

        params.push({
          name,
          type,
          isUser: i === 0 && (type?.includes('User') || name === 'user'),
          isModel: i === 1,
        });
      }
    }

    return params;
  }

  /**
   * Parse arguments string
   */
  private parseArguments(argsStr: string): string[] {
    return argsStr
      .split(',')
      .map(arg => arg.trim())
      .filter(Boolean);
  }

  /**
   * Extract namespace from content
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
  }

  /**
   * Extract class body
   */
  private extractClassBody(content: string, startIndex: number): string {
    let depth = 1;
    let i = startIndex;

    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }

    return content.substring(startIndex, i - 1);
  }

  /**
   * Infer model class from policy name
   */
  private inferModelClass(policyName: string): string | null {
    const match = policyName.match(/^(\w+)Policy$/);
    return match ? match[1] || null : null;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    policies: PolicyInfo[],
    registrations: PolicyRegistration[],
    authorizeCalls: AuthorizeCall[]
  ): number {
    if (policies.length === 0 && registrations.length === 0 && authorizeCalls.length === 0) {
      return 0;
    }

    let confidence = 0.5;

    if (policies.length > 0) {confidence += 0.25;}
    if (registrations.length > 0) {confidence += 0.15;}
    if (authorizeCalls.length > 0) {confidence += 0.1;}

    return Math.min(confidence, 1.0);
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new policy extractor
 */
export function createPolicyExtractor(): PolicyExtractor {
  return new PolicyExtractor();
}
