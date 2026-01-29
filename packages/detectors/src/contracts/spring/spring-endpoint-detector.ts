/**
 * Spring MVC Endpoint Detector
 *
 * Extracts API endpoint definitions from Spring MVC controllers.
 * Supports @RestController and @Controller classes with various mapping annotations.
 *
 * @module contracts/spring/spring-endpoint-detector
 */

import { SpringDtoExtractor } from './dto-extractor.js';
import {
  SPRING_MAPPING_ANNOTATIONS,
  REQUEST_METHOD_MAP,
  PARAM_ANNOTATION_MAP,
} from './types.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { ExtractedEndpoint, BackendExtractionResult } from '../types.js';
import type {
  SpringEndpoint,
  SpringExtractionResult,
  SpringControllerInfo,
  SpringAuthInfo,
  SpringParamInfo,
  SpringMethodMapping,
  SpringAnnotationInfo,
} from './types.js';
import type { ContractField, HttpMethod, Language } from 'driftdetect-core';


/**
 * Unwrap wrapper types to get the inner type.
 */
function unwrapType(javaType: string): string {
  const patterns = [
    /^ResponseEntity<(.+)>$/,
    /^HttpEntity<(.+)>$/,
    /^Mono<(.+)>$/,
    /^Flux<(.+)>$/,
    /^CompletableFuture<(.+)>$/,
    /^Future<(.+)>$/,
  ];
  for (const pattern of patterns) {
    const match = javaType.match(pattern);
    if (match?.[1]) {return match[1];}
  }
  return javaType;
}

// ============================================
// Spring Endpoint Detector
// ============================================

/**
 * Detects Spring MVC API endpoints.
 *
 * Supports:
 * - @RestController and @Controller classes
 * - Class-level @RequestMapping for base routes
 * - Method-level @GetMapping, @PostMapping, @PutMapping, @DeleteMapping, @PatchMapping
 * - @RequestMapping with method attribute
 * - @PathVariable, @RequestParam, @RequestBody parameters
 * - @PreAuthorize, @Secured, @RolesAllowed authorization
 */
export class SpringEndpointDetector extends BaseDetector {
  readonly id = 'contracts/spring-endpoints';
  readonly category = 'api' as const;
  readonly subcategory = 'contracts';
  readonly name = 'Spring MVC Endpoint Detector';
  readonly description = 'Extracts API endpoint definitions from Spring MVC controllers';
  readonly supportedLanguages: Language[] = ['java'];
  readonly detectionMethod = 'regex' as const;

  private readonly dtoExtractor: SpringDtoExtractor;

  constructor() {
    super();
    this.dtoExtractor = new SpringDtoExtractor();
  }

  /**
   * Detect Spring MVC endpoints.
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    // Check if this is a controller file
    if (!this.isControllerFile(content)) {
      return this.createEmptyResult();
    }

    const result = this.extractEndpoints(content, file);

    return this.createResult([], [], result.confidence, {
      custom: {
        extractedEndpoints: result.endpoints,
        framework: 'spring-mvc',
        controllers: result.controllers,
      },
    });
  }

  /**
   * Extract Spring MVC endpoints for external use.
   */
  extractEndpoints(content: string, file: string): SpringExtractionResult {
    if (!this.isControllerFile(content)) {
      return { endpoints: [], framework: 'spring-mvc', confidence: 0, controllers: [] };
    }

    const endpoints: SpringEndpoint[] = [];
    const controllers: SpringControllerInfo[] = [];

    // Find controller class
    const controllerInfo = this.findControllerClass(content, file);
    if (!controllerInfo) {
      return { endpoints: [], framework: 'spring-mvc', confidence: 0, controllers: [] };
    }

    controllers.push(controllerInfo);

    // Find all methods with mapping annotations
    const methods = this.findMappingMethods(content);

    for (const method of methods) {
      const fullPath = this.combinePaths(controllerInfo.baseRoute, method.route);
      const normalizedPath = this.normalizePath(fullPath);

      // Extract request body parameter
      const bodyParam = method.parameters.find(p => p.source === 'body');
      const requestFields = bodyParam
        ? this.dtoExtractor.extractFields(content, bodyParam.type)
        : [];

      // Extract response fields from return type
      const responseFields = this.extractResponseFields(method.returnType, content);

      // Extract authorization info
      const authorization = this.extractMethodAuth(method.annotations);

      // Merge with class-level authorization
      const mergedAuth = [
        ...(controllerInfo.authorization || []),
        ...authorization,
      ];

      // Build endpoint object, only including optional properties if they have values
      const endpoint: SpringEndpoint = {
        method: method.httpMethod,
        path: fullPath,
        normalizedPath,
        file,
        line: method.line,
        responseFields,
        requestFields,
        framework: 'spring-mvc',
        controller: controllerInfo.name,
        action: method.name,
        authorization: mergedAuth,
        queryParams: method.parameters.filter(p => p.source === 'query'),
        pathVariables: method.parameters.filter(p => p.source === 'path'),
      };

      // Add optional properties only if they have values
      const responseTypeName = this.extractTypeName(method.returnType);
      if (responseTypeName) {
        endpoint.responseTypeName = responseTypeName;
      }
      if (bodyParam?.type) {
        endpoint.requestTypeName = bodyParam.type;
      }

      endpoints.push(endpoint);
    }

    return {
      endpoints,
      framework: 'spring-mvc',
      confidence: endpoints.length > 0 ? 0.9 : 0,
      controllers,
    };
  }

  /**
   * Convert to standard BackendExtractionResult format.
   */
  extractBackendEndpoints(content: string, file: string): BackendExtractionResult {
    const result = this.extractEndpoints(content, file);

    const endpoints: ExtractedEndpoint[] = result.endpoints.map(ep => {
      const endpoint: ExtractedEndpoint = {
        method: ep.method,
        path: ep.path,
        normalizedPath: ep.normalizedPath,
        file: ep.file,
        line: ep.line,
        responseFields: ep.responseFields,
        requestFields: ep.requestFields,
        framework: 'spring-mvc',
      };
      
      // Only add optional properties if they have values
      if (ep.responseTypeName) {
        endpoint.responseTypeName = ep.responseTypeName;
      }
      if (ep.requestTypeName) {
        endpoint.requestTypeName = ep.requestTypeName;
      }
      
      return endpoint;
    });

    return {
      endpoints,
      framework: 'spring-mvc',
      confidence: result.confidence,
    };
  }

  generateQuickFix(): null {
    return null;
  }

  // ============================================
  // Private Methods - Detection
  // ============================================

  /**
   * Check if content contains Spring MVC controller patterns.
   */
  private isControllerFile(content: string): boolean {
    return (
      content.includes('@RestController') ||
      content.includes('@Controller') ||
      (content.includes('@RequestMapping') && content.includes('class'))
    );
  }

  /**
   * Find the controller class definition.
   */
  private findControllerClass(content: string, file: string): SpringControllerInfo | null {
    // Pattern to find controller class with annotations
    const classPattern = /(?:(@RestController|@Controller)\s*(?:\([^)]*\))?\s*)?(?:(@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["'][^)]*\))\s*)?(?:@\w+(?:\([^)]*\))?\s*)*public\s+class\s+(\w+)/g;

    const match = classPattern.exec(content);
    if (!match) {return null;}

    const controllerAnnotation = match[1] || '';
    const baseRoute = match[3] || null;
    const className = match[4] || 'Unknown';
    const line = this.getLineNumber(content, match.index);

    // Check for class-level authorization
    const classAuthBlock = content.substring(Math.max(0, match.index - 500), match.index);
    const authorization = this.extractClassAuth(classAuthBlock);

    return {
      name: className,
      baseRoute,
      isRestController: controllerAnnotation === '@RestController',
      isController: controllerAnnotation === '@Controller',
      file,
      line,
      authorization,
    };
  }

  /**
   * Find all methods with mapping annotations.
   */
  private findMappingMethods(content: string): SpringMethodMapping[] {
    const methods: SpringMethodMapping[] = [];

    // Remove comments to avoid matching annotations in comments
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    // Pattern for mapping annotations followed by method
    // Uses 's' flag (dotAll) to allow . to match newlines, handling multi-line annotations
    // The pattern handles nested generics like ResponseEntity<List<UserResponse>>
    // Matches both @XxxMapping and @RequestMapping(method = ...)
    const methodPattern = /(@(?:Get|Post|Put|Delete|Patch)Mapping\s*(?:\([^)]*\))?|@RequestMapping\s*\([^)]*method\s*=[^)]*\))[\s\S]*?public\s+(?:(?:static|final|synchronized)\s+)*(\w+(?:<(?:[^<>]|<[^<>]*>)*>)?)\s+(\w+)\s*\(([^)]*)\)/g;

    let match;
    while ((match = methodPattern.exec(noComments)) !== null) {
      const annotationBlock = match[1] || '';
      const returnType = match[2] || 'void';
      const methodName = match[3] || '';
      const paramsStr = match[4] || '';
      const line = this.getLineNumber(content, match.index);

      // Parse the mapping annotation
      const mappingInfo = this.parseMappingAnnotation(annotationBlock);
      if (!mappingInfo) {continue;}

      // Parse method parameters
      const parameters = this.parseMethodParameters(paramsStr);

      // Extract all annotations for the method (from the full match, not just annotationBlock)
      const fullAnnotationBlock = match[0].substring(0, match[0].indexOf('public'));
      const annotations = this.extractAnnotations(fullAnnotationBlock);

      methods.push({
        name: methodName,
        httpMethod: mappingInfo.method,
        route: mappingInfo.path,
        returnType,
        parameters,
        annotations,
        line,
      });
    }

    return methods;
  }

  /**
   * Parse a mapping annotation to extract HTTP method and path.
   */
  private parseMappingAnnotation(annotationBlock: string): { method: HttpMethod; path: string | null } | null {
    // Check for specific mapping annotations first
    for (const [annotation, method] of Object.entries(SPRING_MAPPING_ANNOTATIONS)) {
      const pattern = new RegExp(`@${annotation}\\s*(?:\\(\\s*(?:value\\s*=\\s*)?["']([^"']*)["']|\\))?`, 'i');
      const match = annotationBlock.match(pattern);
      if (match) {
        return {
          method,
          path: match[1] ?? null,
        };
      }

      // Check for annotation without value
      const simplePattern = new RegExp(`@${annotation}(?:\\s*\\(\\s*\\))?(?!\\w)`, 'i');
      if (simplePattern.test(annotationBlock)) {
        return {
          method,
          path: null,
        };
      }
    }

    // Check for @RequestMapping with method attribute
    const requestMappingPattern = /@RequestMapping\s*\(\s*([^)]+)\)/i;
    const rmMatch = annotationBlock.match(requestMappingPattern);
    if (rmMatch?.[1]) {
      const args = rmMatch[1];

      // Extract path
      let path: string | null = null;
      const pathMatch = args.match(/(?:value|path)\s*=\s*["']([^"']+)["']/);
      if (pathMatch) {
        path = pathMatch[1] ?? null;
      } else {
        // Check for path as first argument
        const firstArgMatch = args.match(/^["']([^"']+)["']/);
        if (firstArgMatch) {
          path = firstArgMatch[1] ?? null;
        }
      }

      // Extract method
      let method: HttpMethod = 'GET';
      const methodMatch = args.match(/method\s*=\s*(?:RequestMethod\.)?(\w+)/);
      if (methodMatch?.[1]) {
        const methodStr = methodMatch[1].toUpperCase();
        method = REQUEST_METHOD_MAP[methodStr] || REQUEST_METHOD_MAP[`RequestMethod.${methodStr}`] || 'GET';
      }

      return { method, path };
    }

    return null;
  }

  /**
   * Parse method parameters.
   */
  private parseMethodParameters(paramsStr: string): SpringParamInfo[] {
    const params: SpringParamInfo[] = [];
    if (!paramsStr.trim()) {return params;}

    const paramParts = this.splitParameters(paramsStr);

    for (const part of paramParts) {
      const trimmed = part.trim();
      if (!trimmed) {continue;}

      const paramInfo = this.parseParameter(trimmed);
      if (paramInfo) {
        params.push(paramInfo);
      }
    }

    return params;
  }

  /**
   * Parse a single parameter.
   */
  private parseParameter(paramStr: string): SpringParamInfo | null {
    // Determine source from annotation
    let source: SpringParamInfo['source'] = 'unknown';
    let required = true;
    let defaultValue: string | null = null;
    let cleanParam = paramStr;

    // Check for parameter annotations
    for (const [annotation, paramSource] of Object.entries(PARAM_ANNOTATION_MAP)) {
      const annotationPattern = new RegExp(`@${annotation}\\s*(?:\\(([^)]*)\\))?`, 'i');
      const match = paramStr.match(annotationPattern);
      if (match) {
        source = paramSource;
        cleanParam = paramStr.replace(annotationPattern, '').trim();

        // Parse annotation arguments
        if (match[1]) {
          const args = match[1];

          // Check for required attribute
          const requiredMatch = args.match(/required\s*=\s*(true|false)/i);
          if (requiredMatch?.[1]) {
            required = requiredMatch[1].toLowerCase() === 'true';
          }

          // Check for defaultValue attribute
          const defaultMatch = args.match(/defaultValue\s*=\s*["']([^"']*)["']/);
          if (defaultMatch?.[1] !== undefined) {
            defaultValue = defaultMatch[1];
            required = false; // Has default, so not required
          }
        }

        break;
      }
    }

    // Remove any remaining annotations
    cleanParam = cleanParam.replace(/@\w+(?:\([^)]*\))?\s*/g, '').trim();

    // Parse type and name
    const paramMatch = cleanParam.match(/(\w+(?:<[^>]+>)?)\s+(\w+)/);
    if (!paramMatch?.[1] || !paramMatch[2]) {return null;}

    return {
      name: paramMatch[2],
      type: paramMatch[1],
      required,
      defaultValue,
      source,
    };
  }

  /**
   * Extract annotations from a block.
   */
  private extractAnnotations(block: string): SpringAnnotationInfo[] {
    const annotations: SpringAnnotationInfo[] = [];
    const annotationPattern = /@(\w+)(?:\s*\(\s*([^)]*)\s*\))?/g;

    let match;
    while ((match = annotationPattern.exec(block)) !== null) {
      const name = match[1] || '';
      const argsStr = match[2] || '';

      const annotation: SpringAnnotationInfo = {
        name,
        value: null,
        arguments: {},
      };

      if (argsStr) {
        // Check for simple value
        const simpleValueMatch = argsStr.match(/^["']([^"']+)["']$/);
        if (simpleValueMatch?.[1]) {
          annotation.value = simpleValueMatch[1];
        } else {
          // Parse named arguments
          const argPattern = /(\w+)\s*=\s*(?:["']([^"']+)["']|(\w+))/g;
          let argMatch;
          while ((argMatch = argPattern.exec(argsStr)) !== null) {
            const argName = argMatch[1] || '';
            const argValue = argMatch[2] || argMatch[3] || '';
            annotation.arguments[argName] = argValue;
          }

          // Check for value attribute
          if (annotation.arguments['value']) {
            annotation.value = annotation.arguments['value'];
          }
        }
      }

      annotations.push(annotation);
    }

    return annotations;
  }

  // ============================================
  // Private Methods - Authorization
  // ============================================

  /**
   * Extract class-level authorization annotations.
   */
  private extractClassAuth(block: string): SpringAuthInfo[] {
    return this.extractAuthAnnotations(block);
  }

  /**
   * Extract method-level authorization annotations.
   */
  private extractMethodAuth(annotations: SpringAnnotationInfo[]): SpringAuthInfo[] {
    const authInfos: SpringAuthInfo[] = [];

    for (const annotation of annotations) {
      const authInfo = this.parseAuthAnnotation(annotation);
      if (authInfo) {
        authInfos.push(authInfo);
      }
    }

    return authInfos;
  }

  /**
   * Extract authorization annotations from a block.
   */
  private extractAuthAnnotations(block: string): SpringAuthInfo[] {
    const authInfos: SpringAuthInfo[] = [];

    // @PreAuthorize("expression")
    const preAuthorizeMatch = block.match(/@PreAuthorize\s*\(\s*["']([^"']+)["']\s*\)/);
    if (preAuthorizeMatch?.[1]) {
      authInfos.push({
        type: 'PreAuthorize',
        expression: preAuthorizeMatch[1],
        roles: this.extractRolesFromExpression(preAuthorizeMatch[1]),
      });
    }

    // @PostAuthorize("expression")
    const postAuthorizeMatch = block.match(/@PostAuthorize\s*\(\s*["']([^"']+)["']\s*\)/);
    if (postAuthorizeMatch?.[1]) {
      authInfos.push({
        type: 'PostAuthorize',
        expression: postAuthorizeMatch[1],
        roles: this.extractRolesFromExpression(postAuthorizeMatch[1]),
      });
    }

    // @Secured({"ROLE_ADMIN", "ROLE_USER"})
    const securedMatch = block.match(/@Secured\s*\(\s*\{?\s*([^})]+)\s*\}?\s*\)/);
    if (securedMatch?.[1]) {
      const rolesStr = securedMatch[1];
      const roles = this.parseRolesList(rolesStr);
      authInfos.push({
        type: 'Secured',
        expression: null,
        roles,
      });
    }

    // @RolesAllowed({"ADMIN", "USER"})
    const rolesAllowedMatch = block.match(/@RolesAllowed\s*\(\s*\{?\s*([^})]+)\s*\}?\s*\)/);
    if (rolesAllowedMatch?.[1]) {
      const rolesStr = rolesAllowedMatch[1];
      const roles = this.parseRolesList(rolesStr);
      authInfos.push({
        type: 'RolesAllowed',
        expression: null,
        roles,
      });
    }

    return authInfos;
  }

  /**
   * Parse an authorization annotation.
   */
  private parseAuthAnnotation(annotation: SpringAnnotationInfo): SpringAuthInfo | null {
    switch (annotation.name) {
      case 'PreAuthorize':
        return {
          type: 'PreAuthorize',
          expression: annotation.value,
          roles: annotation.value ? this.extractRolesFromExpression(annotation.value) : [],
        };

      case 'PostAuthorize':
        return {
          type: 'PostAuthorize',
          expression: annotation.value,
          roles: annotation.value ? this.extractRolesFromExpression(annotation.value) : [],
        };

      case 'Secured':
        return {
          type: 'Secured',
          expression: null,
          roles: annotation.value ? this.parseRolesList(annotation.value) : [],
        };

      case 'RolesAllowed':
        return {
          type: 'RolesAllowed',
          expression: null,
          roles: annotation.value ? this.parseRolesList(annotation.value) : [],
        };

      default:
        return null;
    }
  }

  /**
   * Extract roles from a SpEL expression.
   */
  private extractRolesFromExpression(expression: string): string[] {
    const roles: string[] = [];

    // Match hasRole('ROLE') or hasAuthority('AUTHORITY')
    const rolePattern = /has(?:Role|Authority|AnyRole|AnyAuthority)\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = rolePattern.exec(expression)) !== null) {
      if (match[1]) {
        roles.push(match[1]);
      }
    }

    return roles;
  }

  /**
   * Parse a comma-separated list of roles.
   */
  private parseRolesList(rolesStr: string): string[] {
    const roles: string[] = [];
    const rolePattern = /["']([^"']+)["']/g;
    let match;
    while ((match = rolePattern.exec(rolesStr)) !== null) {
      if (match[1]) {
        roles.push(match[1]);
      }
    }
    return roles;
  }

  // ============================================
  // Private Methods - Response/Request Fields
  // ============================================

  /**
   * Extract response fields from return type.
   */
  private extractResponseFields(returnType: string, content: string): ContractField[] {
    // Skip void and common non-DTO types
    if (['void', 'Void'].includes(returnType)) {
      return [];
    }

    // Unwrap wrapper types
    const unwrappedType = unwrapType(returnType);

    // Skip if still a wrapper or primitive
    const skipTypes = ['void', 'Void', 'String', 'Object', 'ResponseEntity', 'HttpEntity'];
    if (skipTypes.includes(unwrappedType)) {
      return [];
    }

    return this.dtoExtractor.extractFields(content, unwrappedType);
  }

  /**
   * Extract type name from a potentially generic type.
   */
  private extractTypeName(type: string): string | undefined {
    const unwrapped = unwrapType(type);
    if (['void', 'Void', 'String', 'Object'].includes(unwrapped)) {
      return undefined;
    }

    // Extract base type name
    const match = unwrapped.match(/^(\w+)/);
    return match ? match[1] : undefined;
  }

  // ============================================
  // Private Methods - Path Handling
  // ============================================

  /**
   * Combine controller base route with method route.
   */
  private combinePaths(baseRoute: string | null, methodRoute: string | null): string {
    const base = baseRoute || '';
    const method = methodRoute || '';

    if (!base && !method) {return '/';}
    if (!base) {return method.startsWith('/') ? method : `/${method}`;}
    if (!method) {return base.startsWith('/') ? base : `/${base}`;}

    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const normalizedMethod = method.startsWith('/') ? method : `/${method}`;

    return `${normalizedBase}${normalizedMethod}`;
  }

  /**
   * Normalize Spring path to common format.
   *
   * Spring: /users/{id} → /users/:id
   * Spring: /users/{id:\d+} → /users/:id (strip regex constraints)
   */
  private normalizePath(path: string): string {
    return path
      // Remove regex constraints: {id:\d+} → {id}
      .replace(/\{(\w+):[^}]+\}/g, '{$1}')
      // Convert {param} to :param
      .replace(/\{(\w+)\}/g, ':$1')
      // Clean up double slashes
      .replace(/\/+/g, '/')
      // Ensure leading slash
      .replace(/^([^/])/, '/$1')
      // Remove trailing slash (except for root)
      .replace(/(.)\/$/, '$1');
  }

  // ============================================
  // Private Methods - Utilities
  // ============================================

  /**
   * Split parameters handling nested generics.
   */
  private splitParameters(paramsStr: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of paramsStr) {
      if (char === '<' || char === '(') {depth++;}
      else if (char === '>' || char === ')') {depth--;}
      else if (char === ',' && depth === 0) {
        result.push(current);
        current = '';
        continue;
      }
      current += char;
    }

    if (current.trim()) {
      result.push(current);
    }

    return result;
  }

  /**
   * Get line number for a position in content.
   */
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new Spring endpoint detector.
 */
export function createSpringEndpointDetector(): SpringEndpointDetector {
  return new SpringEndpointDetector();
}

/**
 * Extract Spring MVC endpoints from content.
 */
export function extractSpringEndpoints(content: string, file: string): SpringExtractionResult {
  const detector = new SpringEndpointDetector();
  return detector.extractEndpoints(content, file);
}
