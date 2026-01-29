/**
 * ASP.NET Core Endpoint Detector
 *
 * Extracts API endpoint definitions from ASP.NET Core controllers and minimal APIs.
 * Uses tree-sitter-c-sharp for semantic parsing when available, falls back to regex.
 */

import { BaseDetector } from '../../base/base-detector.js';

import type {
  AspNetEndpoint,
  AspNetExtractionResult,
  AspNetController,
  AspNetParameter,
  AspNetAuthAttribute,
} from './types.js';
import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { ContractField, HttpMethod, Language } from 'driftdetect-core';

// ============================================================================
// Type Mapping
// ============================================================================

const CSHARP_TYPE_MAP: Record<string, string> = {
  'string': 'string',
  'String': 'string',
  'int': 'number',
  'Int32': 'number',
  'long': 'number',
  'Int64': 'number',
  'float': 'number',
  'Single': 'number',
  'double': 'number',
  'Double': 'number',
  'decimal': 'number',
  'Decimal': 'number',
  'bool': 'boolean',
  'Boolean': 'boolean',
  'DateTime': 'string',
  'DateTimeOffset': 'string',
  'DateOnly': 'string',
  'TimeOnly': 'string',
  'Guid': 'string',
  'object': 'object',
  'dynamic': 'any',
};

function mapCSharpType(csharpType: string): string {
  // Handle nullable types
  const baseType = csharpType.replace('?', '').trim();
  
  // Handle generic collections
  if (baseType.startsWith('List<') || baseType.startsWith('IEnumerable<') || 
      baseType.startsWith('IList<') || baseType.startsWith('ICollection<') ||
      baseType.endsWith('[]')) {
    return 'array';
  }
  
  if (baseType.startsWith('Dictionary<') || baseType.startsWith('IDictionary<')) {
    return 'object';
  }
  
  // Handle Task<T> - extract inner type
  const taskMatch = baseType.match(/Task<(.+)>/);
  if (taskMatch?.[1]) {
    return mapCSharpType(taskMatch[1]);
  }
  
  // Handle ActionResult<T>, IActionResult<T>
  const actionResultMatch = baseType.match(/(?:I)?ActionResult<(.+)>/);
  if (actionResultMatch?.[1]) {
    return mapCSharpType(actionResultMatch[1]);
  }
  
  return CSHARP_TYPE_MAP[baseType] || baseType.toLowerCase();
}

// ============================================================================
// Path Normalization
// ============================================================================

function normalizePath(path: string): string {
  return path
    // Convert {param} to :param
    .replace(/\{(\w+)(?::[^}]+)?\}/g, ':$1')
    // Remove [controller] placeholder - will be replaced with actual controller name
    .replace(/\[controller\]/gi, '')
    // Remove [action] placeholder
    .replace(/\[action\]/gi, '')
    // Clean up double slashes
    .replace(/\/+/g, '/')
    // Ensure leading slash
    .replace(/^([^/])/, '/$1')
    // Remove trailing slash
    .replace(/\/$/, '');
}

function resolveControllerRoute(baseRoute: string | null, controllerName: string): string {
  if (!baseRoute) {return '';}
  
  return baseRoute
    .replace(/\[controller\]/gi, controllerName.replace(/Controller$/, '').toLowerCase())
    .replace(/\[action\]/gi, '');
}

function combineRoutes(controllerRoute: string, actionRoute: string | null): string {
  const base = controllerRoute || '';
  const action = actionRoute || '';
  
  if (!base && !action) {return '/';}
  if (!base) {return action.startsWith('/') ? action : `/${action}`;}
  if (!action) {return base.startsWith('/') ? base : `/${base}`;}
  
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedAction = action.startsWith('/') ? action : `/${action}`;
  
  return `${normalizedBase}${normalizedAction}`;
}

// ============================================================================
// ASP.NET Endpoint Detector
// ============================================================================

export class AspNetEndpointDetector extends BaseDetector {
  readonly id = 'contracts/aspnet-endpoints';
  readonly category = 'api' as const;
  readonly subcategory = 'contracts';
  readonly name = 'ASP.NET Core Endpoint Detector';
  readonly description = 'Extracts API endpoint definitions from ASP.NET Core controllers and minimal APIs';
  readonly supportedLanguages: Language[] = ['csharp'];
  readonly detectionMethod = 'custom' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    // Detect if this is a controller file or minimal API
    const isController = this.isControllerFile(content);
    const isMinimalApi = this.isMinimalApiFile(content);
    
    let result: AspNetExtractionResult;
    
    if (isController) {
      result = this.extractControllerEndpoints(content, file);
    } else if (isMinimalApi) {
      result = this.extractMinimalApiEndpoints(content, file);
    } else {
      return this.createEmptyResult();
    }
    
    return this.createResult([], [], result.confidence, {
      custom: {
        extractedEndpoints: result.endpoints,
        framework: result.framework,
        controllers: result.controllers,
      },
    });
  }

  /**
   * Check if file contains ASP.NET Core controller patterns
   */
  private isControllerFile(content: string): boolean {
    return (
      content.includes('[ApiController]') ||
      content.includes('[Controller]') ||
      content.includes(': ControllerBase') ||
      content.includes(': Controller')
    );
  }

  /**
   * Check if file contains minimal API patterns
   */
  private isMinimalApiFile(content: string): boolean {
    return (
      (content.includes('app.MapGet') ||
       content.includes('app.MapPost') ||
       content.includes('app.MapPut') ||
       content.includes('app.MapDelete') ||
       content.includes('app.MapPatch')) &&
      !this.isControllerFile(content)
    );
  }

  /**
   * Extract endpoints from ASP.NET Core controller
   */
  extractControllerEndpoints(content: string, file: string): AspNetExtractionResult {
    const endpoints: AspNetEndpoint[] = [];
    const controllers: AspNetController[] = [];
    
    // Find controller class
    const controllerMatch = content.match(/(?:\[ApiController\][\s\S]*?)?(?:\[Route\s*\(\s*["']([^"']+)["']\s*\)\][\s\S]*?)?public\s+class\s+(\w+Controller)\s*:\s*(?:ControllerBase|Controller)/);
    
    if (!controllerMatch) {
      return { endpoints: [], framework: 'aspnet-core', confidence: 0, controllers: [] };
    }
    
    const baseRoute = controllerMatch[1] || null;
    const controllerName = controllerMatch[2] || 'Unknown';
    const controllerLine = content.substring(0, controllerMatch.index).split('\n').length;
    
    const controller: AspNetController = {
      name: controllerName,
      baseRoute,
      isApiController: content.includes('[ApiController]'),
      file,
      line: controllerLine,
    };
    controllers.push(controller);
    
    const resolvedBaseRoute = resolveControllerRoute(baseRoute, controllerName);
    
    // Find all action methods with HTTP attributes
    const methodPattern = /(\[(?:Http(?:Get|Post|Put|Patch|Delete|Head|Options))(?:\s*\(\s*["']([^"']*?)["']\s*\))?\][\s\S]*?)public\s+(?:async\s+)?(?:Task<)?(?:ActionResult<)?(\w+(?:<[^>]+>)?)\??(?:>)?(?:>)?\s+(\w+)\s*\(([^)]*)\)/g;
    
    let match;
    while ((match = methodPattern.exec(content)) !== null) {
      const attributeBlock = match[1] || '';
      const routeTemplate = match[2] || null;
      const returnType = match[3] || 'void';
      const actionName = match[4] || '';
      const paramsStr = match[5] || '';
      
      // Extract HTTP method from attribute
      const httpMethodMatch = attributeBlock.match(/\[Http(Get|Post|Put|Patch|Delete|Head|Options)/i);
      if (!httpMethodMatch) {continue;}
      
      const method = httpMethodMatch[1]?.toUpperCase() as HttpMethod || 'GET';
      const line = content.substring(0, match.index).split('\n').length;
      
      // Build full path
      const fullPath = combineRoutes(resolvedBaseRoute, routeTemplate);
      const normalizedPath = normalizePath(fullPath);
      
      // Extract parameters
      const parameters = this.extractParameters(paramsStr, content);
      
      // Extract authorization attributes
      const authAttributes = this.extractAuthAttributes(attributeBlock);
      
      // Extract request fields from [FromBody] parameter
      const requestFields = this.extractRequestFields(parameters, content);
      
      // Extract response fields from return type
      const responseFields = this.extractResponseFields(returnType, content);
      
      endpoints.push({
        method,
        path: fullPath || '/',
        normalizedPath: normalizedPath || '/',
        file,
        line,
        responseFields,
        requestFields,
        framework: 'aspnet-core',
        controller: controllerName,
        action: actionName,
        authorization: authAttributes,
      });
    }
    
    return {
      endpoints,
      framework: 'aspnet-core',
      confidence: endpoints.length > 0 ? 0.9 : 0,
      controllers,
    };
  }

  /**
   * Extract endpoints from minimal API style
   */
  extractMinimalApiEndpoints(content: string, file: string): AspNetExtractionResult {
    const endpoints: AspNetEndpoint[] = [];
    
    // Pattern for minimal API: app.MapGet("/path", handler)
    const minimalApiPattern = /app\.Map(Get|Post|Put|Patch|Delete)\s*\(\s*["']([^"']+)["']/gi;
    
    let match;
    while ((match = minimalApiPattern.exec(content)) !== null) {
      const method = match[1]?.toUpperCase() as HttpMethod || 'GET';
      const path = match[2] || '/';
      const line = content.substring(0, match.index).split('\n').length;
      
      endpoints.push({
        method,
        path,
        normalizedPath: normalizePath(path),
        file,
        line,
        responseFields: [],
        requestFields: [],
        framework: 'aspnet-core',
        controller: 'MinimalApi',
        action: `Map${method}`,
        authorization: [],
      });
    }
    
    return {
      endpoints,
      framework: 'aspnet-minimal',
      confidence: endpoints.length > 0 ? 0.8 : 0,
      controllers: [],
    };
  }

  /**
   * Extract parameters from method signature
   */
  private extractParameters(paramsStr: string, _content: string): AspNetParameter[] {
    const params: AspNetParameter[] = [];
    if (!paramsStr.trim()) {return params;}
    
    // Split by comma, but handle generic types
    const paramParts = this.splitParameters(paramsStr);
    
    for (const part of paramParts) {
      const trimmed = part.trim();
      if (!trimmed) {continue;}
      
      // Check for source attributes
      let source: AspNetParameter['source'] = 'unknown';
      let cleanPart = trimmed;
      
      if (trimmed.includes('[FromBody]')) {
        source = 'body';
        cleanPart = trimmed.replace('[FromBody]', '').trim();
      } else if (trimmed.includes('[FromQuery]')) {
        source = 'query';
        cleanPart = trimmed.replace('[FromQuery]', '').trim();
      } else if (trimmed.includes('[FromRoute]')) {
        source = 'route';
        cleanPart = trimmed.replace('[FromRoute]', '').trim();
      } else if (trimmed.includes('[FromHeader]')) {
        source = 'header';
        cleanPart = trimmed.replace('[FromHeader]', '').trim();
      } else if (trimmed.includes('[FromForm]')) {
        source = 'form';
        cleanPart = trimmed.replace('[FromForm]', '').trim();
      } else if (trimmed.includes('[FromServices]')) {
        source = 'services';
        cleanPart = trimmed.replace('[FromServices]', '').trim();
      }
      
      // Parse type and name
      const paramMatch = cleanPart.match(/(\w+(?:<[^>]+>)?)\??\s+(\w+)(?:\s*=\s*(.+))?/);
      if (paramMatch) {
        params.push({
          name: paramMatch[2] || '',
          type: paramMatch[1] || 'unknown',
          source,
          optional: cleanPart.includes('?') || !!paramMatch[3],
          defaultValue: paramMatch[3] || null,
        });
      }
    }
    
    return params;
  }

  /**
   * Split parameters handling generic types
   */
  private splitParameters(paramsStr: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of paramsStr) {
      if (char === '<') {depth++;}
      else if (char === '>') {depth--;}
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
   * Extract authorization attributes
   */
  private extractAuthAttributes(attributeBlock: string): AspNetAuthAttribute[] {
    const attrs: AspNetAuthAttribute[] = [];
    
    // Check for [Authorize]
    const authorizeMatch = attributeBlock.match(/\[Authorize(?:\s*\(([^)]*)\))?\]/);
    if (authorizeMatch) {
      const attr: AspNetAuthAttribute = {
        name: 'Authorize',
        roles: [],
        policy: null,
        authenticationSchemes: [],
      };
      
      if (authorizeMatch[1]) {
        const args = authorizeMatch[1];
        
        // Extract Roles
        const rolesMatch = args.match(/Roles\s*=\s*["']([^"']+)["']/);
        if (rolesMatch?.[1]) {
          attr.roles = rolesMatch[1].split(',').map(r => r.trim());
        }
        
        // Extract Policy
        const policyMatch = args.match(/Policy\s*=\s*["']([^"']+)["']/);
        if (policyMatch?.[1]) {
          attr.policy = policyMatch[1];
        }
        
        // Extract AuthenticationSchemes
        const schemesMatch = args.match(/AuthenticationSchemes\s*=\s*["']([^"']+)["']/);
        if (schemesMatch?.[1]) {
          attr.authenticationSchemes = schemesMatch[1].split(',').map(s => s.trim());
        }
      }
      
      attrs.push(attr);
    }
    
    // Check for [AllowAnonymous]
    if (attributeBlock.includes('[AllowAnonymous]')) {
      attrs.push({
        name: 'AllowAnonymous',
        roles: [],
        policy: null,
        authenticationSchemes: [],
      });
    }
    
    return attrs;
  }

  /**
   * Extract request fields from [FromBody] parameter type
   */
  private extractRequestFields(parameters: AspNetParameter[], content: string): ContractField[] {
    const bodyParam = parameters.find(p => p.source === 'body');
    if (!bodyParam) {return [];}
    
    return this.extractDtoFields(bodyParam.type, content);
  }

  /**
   * Extract response fields from return type
   */
  private extractResponseFields(returnType: string, content: string): ContractField[] {
    // Skip wrapper types
    if (['IActionResult', 'ActionResult', 'Task', 'void', 'Ok', 'NotFound', 'BadRequest'].includes(returnType)) {
      return [];
    }
    
    return this.extractDtoFields(returnType, content);
  }

  /**
   * Extract fields from a DTO/record type
   */
  private extractDtoFields(typeName: string, content: string): ContractField[] {
    const fields: ContractField[] = [];
    
    // Handle generic types - extract inner type
    const genericMatch = typeName.match(/(?:List|IEnumerable|IList|ICollection)<(\w+)>/);
    const actualType = genericMatch ? genericMatch[1] : typeName;
    if (!actualType) {return fields;}
    
    // Find class/record definition
    const classPattern = new RegExp(
      `(?:public\\s+)?(?:record|class)\\s+${actualType}(?:<[^>]+>)?(?:\\s*\\([^)]*\\))?(?:\\s*:\\s*[^{]+)?\\s*\\{`,
      'g'
    );
    
    const classMatch = classPattern.exec(content);
    if (!classMatch) {
      // Try to find record with primary constructor
      const recordPattern = new RegExp(
        `public\\s+record\\s+${actualType}\\s*\\(([^)]+)\\)`,
        'g'
      );
      const recordMatch = recordPattern.exec(content);
      if (recordMatch?.[1]) {
        // Parse primary constructor parameters as fields
        const params = this.splitParameters(recordMatch[1]);
        for (const param of params) {
          const paramMatch = param.trim().match(/(\w+(?:<[^>]+>)?)\??\s+(\w+)/);
          if (paramMatch?.[1] && paramMatch[2]) {
            fields.push({
              name: paramMatch[2],
              type: mapCSharpType(paramMatch[1]),
              optional: param.includes('?') || param.includes('= '),
              nullable: param.includes('?'),
              line: 0,
            });
          }
        }
      }
      return fields;
    }
    
    // Extract properties from class body
    const classStart = classMatch.index + classMatch[0].length;
    const classBody = this.extractClassBody(content, classStart);
    
    // Match properties: public Type Name { get; set; }
    const propPattern = /public\s+(\w+(?:<[^>]+>)?)\??\s+(\w+)\s*\{\s*get;/g;
    let propMatch;
    
    while ((propMatch = propPattern.exec(classBody)) !== null) {
      if (propMatch[1] && propMatch[2]) {
        fields.push({
          name: propMatch[2],
          type: mapCSharpType(propMatch[1]),
          optional: classBody.substring(propMatch.index, propMatch.index + propMatch[0].length + 20).includes('?'),
          nullable: classBody.substring(propMatch.index, propMatch.index + propMatch[0].length + 20).includes('?'),
          line: 0,
        });
      }
    }
    
    return fields;
  }

  /**
   * Extract class body handling nested braces
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

  generateQuickFix(): null {
    return null;
  }
}

export function createAspNetEndpointDetector(): AspNetEndpointDetector {
  return new AspNetEndpointDetector();
}

export function extractAspNetEndpoints(content: string, file: string): AspNetExtractionResult {
  const detector = new AspNetEndpointDetector();
  
  if (detector['isControllerFile'](content)) {
    return detector.extractControllerEndpoints(content, file);
  } else if (detector['isMinimalApiFile'](content)) {
    return detector.extractMinimalApiEndpoints(content, file);
  }
  
  return { endpoints: [], framework: 'aspnet-core', confidence: 0, controllers: [] };
}
