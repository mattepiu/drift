/**
 * Frontend Type Detector
 *
 * Extracts API call definitions and their associated TypeScript types
 * from frontend code. Supports fetch, axios, and react-query patterns.
 */

import { BaseDetector } from '../base/base-detector.js';

import type { ExtractedApiCall, FrontendExtractionResult } from './types.js';
import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { ContractField, HttpMethod, Language } from 'driftdetect-core';

// ============================================================================
// API Call Pattern Matchers
// ============================================================================

const FETCH_PATTERNS = [
  /fetch\s*\(\s*["'`]([^"'`]+)["'`](?:\s*,\s*\{[^}]*method\s*:\s*["'](\w+)["'][^}]*\})?\s*\)/gi,
  /fetch\s*\(\s*`([^`]+)`(?:\s*,\s*\{[^}]*method\s*:\s*["'](\w+)["'][^}]*\})?\s*\)/gi,
];

const AXIOS_PATTERNS = [
  /axios\.(get|post|put|patch|delete)\s*(?:<[^(]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/gi,
  /axios\s*\(\s*\{[^}]*url\s*:\s*["'`]([^"'`]+)["'`][^}]*method\s*:\s*["'](\w+)["'][^}]*\}/gi,
];

// Patterns for axios client instances (e.g., apiClient.get('/api/...'))
// Note: Uses a more permissive pattern for generics to handle nested types like <ApiResponse<User[]>>
const AXIOS_CLIENT_PATTERNS = [
  /(\w+Client|\w+Api|api|client)\.(get|post|put|patch|delete)\s*(?:<[^(]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/gi,
];

const REACT_QUERY_PATTERNS = [
  /useQuery\s*(?:<[^>]+>)?\s*\(\s*\{[^}]*queryFn\s*:[^}]*fetch\s*\(\s*["'`]([^"'`]+)["'`]/gi,
  /useMutation\s*(?:<[^>]+>)?\s*\(\s*\{[^}]*mutationFn\s*:[^}]*axios\.(post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
];

// ============================================================================
// Type Extraction Helpers (Enhanced)
// ============================================================================

/**
 * Extract fields from a TypeScript interface or type alias
 * Handles nested types, generics, and extends/intersection
 */
function extractTypeFields(content: string, typeName: string, visited: Set<string> = new Set()): ContractField[] {
  if (visited.has(typeName)) {return [];} // Prevent circular refs
  visited.add(typeName);
  
  const fields: ContractField[] = [];
  
  // Try interface first
  const interfacePattern = new RegExp(
    `interface\\s+${typeName}(?:<[^>]+>)?\\s*(?:extends\\s+([^{]+))?\\s*\\{([^}]+)\\}`,
    'gs'
  );
  
  let match = interfacePattern.exec(content);
  if (match) {
    const extendsClause = match[1];
    const body = match[2];
    
    // Handle extends - extract parent fields first
    if (extendsClause) {
      const parentTypes = extendsClause.split(',').map(t => t.trim());
      for (const parent of parentTypes) {
        const parentName = parent.split('<')[0]?.trim();
        if (parentName) {
          fields.push(...extractTypeFields(content, parentName, visited));
        }
      }
    }
    
    if (body) {
      fields.push(...parseTypeBody(body, content, visited));
    }
    return fields;
  }
  
  // Try type alias
  const typePattern = new RegExp(
    `type\\s+${typeName}(?:<[^>]+>)?\\s*=\\s*([^;]+);`,
    'gs'
  );
  
  match = typePattern.exec(content);
  if (match?.[1]) {
    const typeBody = match[1].trim();
    
    // Handle intersection types (Type1 & Type2)
    if (typeBody.includes('&')) {
      const parts = typeBody.split('&').map(p => p.trim());
      for (const part of parts) {
        if (part.startsWith('{')) {
          // Inline object type
          const innerBody = part.slice(1, -1);
          fields.push(...parseTypeBody(innerBody, content, visited));
        } else {
          // Reference to another type
          const refName = part.split('<')[0]?.trim();
          if (refName) {
            fields.push(...extractTypeFields(content, refName, visited));
          }
        }
      }
      return fields;
    }
    
    // Handle object literal type
    if (typeBody.startsWith('{')) {
      const innerBody = typeBody.slice(1, -1);
      fields.push(...parseTypeBody(innerBody, content, visited));
      return fields;
    }
    
    // Handle reference to another type
    const refName = typeBody.split('<')[0]?.trim();
    if (refName && refName !== typeName) {
      return extractTypeFields(content, refName, visited);
    }
  }
  
  return fields;
}

/**
 * Parse the body of a type/interface definition
 */
function parseTypeBody(body: string, fullContent: string, visited: Set<string>): ContractField[] {
  const fields: ContractField[] = [];
  
  // Handle multi-line and nested structures
  const lines = body.split(/[;\n]/).filter(l => l.trim());
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) {continue;}
    
    // Match: fieldName?: Type or fieldName: Type
    const fieldMatch = trimmed.match(/^(\w+)(\?)?:\s*(.+)$/);
    if (!fieldMatch) {continue;}
    
    const name = fieldMatch[1];
    const optional = fieldMatch[2] === '?';
    let typeStr = fieldMatch[3];
    if (!name || !typeStr) {continue;}
    
    typeStr = typeStr.trim();
    
    // Handle nullable (| null or null |)
    const nullable = typeStr.includes('| null') || typeStr.includes('null |');
    typeStr = typeStr.replace(/\s*\|\s*null/g, '').replace(/null\s*\|\s*/g, '').trim();
    
    // Handle undefined union
    const hasUndefined = typeStr.includes('| undefined');
    typeStr = typeStr.replace(/\s*\|\s*undefined/g, '').trim();
    
    const field: ContractField = {
      name,
      type: normalizeTypeString(typeStr),
      optional: optional || hasUndefined,
      nullable,
    };
    
    // Recurse for nested object types
    if (typeStr.startsWith('{')) {
      const nestedBody = extractNestedBody(typeStr);
      if (nestedBody) {
        field.children = parseTypeBody(nestedBody, fullContent, visited);
      }
    } else if (!isPrimitiveType(typeStr)) {
      // Try to resolve reference type
      const refName = typeStr.replace(/\[\]$/, '').split('<')[0]?.trim();
      if (refName && !visited.has(refName)) {
        const refFields = extractTypeFields(fullContent, refName, new Set(visited));
        if (refFields.length > 0) {
          field.children = refFields;
        }
      }
    }
    
    fields.push(field);
  }
  
  return fields;
}

/**
 * Extract nested object body handling balanced braces
 */
function extractNestedBody(typeStr: string): string | null {
  if (!typeStr.startsWith('{')) {return null;}
  
  let depth = 0;
  let start = -1;
  
  for (let i = 0; i < typeStr.length; i++) {
    if (typeStr[i] === '{') {
      if (depth === 0) {start = i + 1;}
      depth++;
    } else if (typeStr[i] === '}') {
      depth--;
      if (depth === 0) {
        return typeStr.slice(start, i);
      }
    }
  }
  
  return null;
}

/**
 * Normalize type string for comparison
 */
function normalizeTypeString(typeStr: string): string {
  // Handle arrays
  if (typeStr.endsWith('[]')) {
    return `${normalizeTypeString(typeStr.slice(0, -2))}[]`;
  }
  
  // Handle Array<T>
  const arrayMatch = typeStr.match(/^Array<(.+)>$/);
  if (arrayMatch?.[1]) {
    return `${normalizeTypeString(arrayMatch[1])}[]`;
  }
  
  // Handle Promise<T>
  const promiseMatch = typeStr.match(/^Promise<(.+)>$/);
  if (promiseMatch?.[1]) {
    return normalizeTypeString(promiseMatch[1]);
  }
  
  // Map common types
  const typeMap: Record<string, string> = {
    'String': 'string',
    'Number': 'number',
    'Boolean': 'boolean',
    'Object': 'object',
  };
  
  return typeMap[typeStr] || typeStr;
}

function isPrimitiveType(typeStr: string): boolean {
  const primitives = ['string', 'number', 'boolean', 'null', 'undefined', 'any', 'unknown', 'void', 'never'];
  const normalized = typeStr.toLowerCase().replace(/\[\]$/, '');
  return primitives.includes(normalized);
}

function findResponseType(content: string, line: number): string | undefined {
  const lines = content.split('\n');
  
  // Look backwards for type annotations
  for (let i = line - 1; i >= Math.max(0, line - 10); i--) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    const constMatch = lineContent.match(/const\s+\w+\s*:\s*(\w+)/);
    if (constMatch?.[1]) {return constMatch[1];}
    
    const thenMatch = lineContent.match(/\.then\s*\(\s*\([^)]*\)\s*:\s*(\w+)/);
    if (thenMatch?.[1]) {return thenMatch[1];}
    
    const genericMatch = lineContent.match(/fetch\s*<\s*(\w+)\s*>/);
    if (genericMatch?.[1]) {return genericMatch[1];}
    
    const axiosGenericMatch = lineContent.match(/axios\.\w+\s*<\s*(\w+)\s*>/);
    if (axiosGenericMatch?.[1]) {return axiosGenericMatch[1];}
  }
  
  // Look forward for type assertions
  for (let i = line; i < Math.min(lines.length, line + 5); i++) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    const asMatch = lineContent.match(/as\s+(\w+)/);
    if (asMatch?.[1]) {return asMatch[1];}
    
    const jsonAsMatch = lineContent.match(/\.json\(\)\s+as\s+(\w+)/);
    if (jsonAsMatch?.[1]) {return jsonAsMatch[1];}
  }
  
  return undefined;
}

/**
 * Find the enclosing function and extract its return type
 * Handles patterns like: async function foo(): Promise<{ field: type }> { ... }
 * Also handles: async function foo(): Promise<TypeName> { ... }
 */
function findFunctionReturnType(content: string, line: number): ContractField[] {
  const lines = content.split('\n');
  
  // Look backwards to find the function declaration
  for (let i = line - 1; i >= Math.max(0, line - 20); i--) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    // Match: async function name(...): Promise<{ ... }> or (): Promise<{ ... }> =>
    const promiseMatch = lineContent.match(/:\s*Promise\s*<\s*\{([^}]+)\}/);
    if (promiseMatch?.[1]) {
      return extractInlineTypeFields(promiseMatch[1]);
    }
    
    // Match named type: ): Promise<TypeName>
    const namedPromiseMatch = lineContent.match(/:\s*Promise\s*<\s*(\w+)\s*>/);
    if (namedPromiseMatch?.[1]) {
      const typeName = namedPromiseMatch[1];
      // Look up the type definition in the file
      const typeFields = extractTypeFields(content, typeName);
      if (typeFields.length > 0) {
        return typeFields;
      }
    }
    
    // Stop if we hit another function or class
    if (lineContent.match(/^(?:export\s+)?(?:async\s+)?function\s/) && i < line - 1) {break;}
    if (lineContent.match(/^(?:export\s+)?class\s/)) {break;}
  }
  
  return [];
}

/**
 * Extract fields from inline type definition like { field: type; field2: type2 }
 */
function extractInlineTypeFields(typeBody: string): ContractField[] {
  const fields: ContractField[] = [];
  
  // Match field: type patterns (with optional ? for optional fields)
  const fieldPattern = /(\w+)(\?)?:\s*([^;,]+)/g;
  let match;
  
  while ((match = fieldPattern.exec(typeBody)) !== null) {
    const name = match[1];
    const optional = match[2] === '?';
    let type = match[3];
    if (!name || !type) {continue;}
    
    type = type.trim();
    const nullable = type.includes('| null') || type.includes('null |');
    type = type.replace(/\s*\|\s*null/g, '').replace(/null\s*\|\s*/g, '').trim();
    
    fields.push({ name, type, optional, nullable });
  }
  
  return fields;
}

/**
 * Combined function to extract response fields from various sources
 */
function extractResponseFields(content: string, line: number): { responseType: string | undefined; fields: ContractField[] } {
  // First try to find a named type
  const responseType = findResponseType(content, line);
  if (responseType) {
    const fields = extractTypeFields(content, responseType);
    if (fields.length > 0) {
      return { responseType, fields };
    }
  }
  
  // Then try to extract from function return type (Promise<{ ... }>)
  const inlineFields = findFunctionReturnType(content, line);
  if (inlineFields.length > 0) {
    return { responseType: undefined, fields: inlineFields };
  }
  
  return { responseType, fields: [] };
}

/**
 * Extract request body type from API call
 * Looks for the second argument in fetch/axios calls or the data property
 */
function extractRequestFields(content: string, line: number): { requestType: string | undefined; fields: ContractField[] } {
  const lines = content.split('\n');
  
  // Look at the API call line and surrounding context
  for (let i = Math.max(0, line - 3); i < Math.min(lines.length, line + 5); i++) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    // Pattern 1: axios.post<ResponseType>(url, requestData) - look for typed request
    // Pattern 2: fetch(url, { body: JSON.stringify(data) })
    // Pattern 3: apiClient.post(url, data)
    
    // Look for body: JSON.stringify(variable) or body: variable
    const bodyMatch = lineContent.match(/body\s*:\s*(?:JSON\.stringify\s*\(\s*)?(\w+)/);
    if (bodyMatch?.[1]) {
      const varName = bodyMatch[1];
      // Try to find the type of this variable
      const varType = findVariableType(content, varName, i);
      if (varType) {
        const fields = extractTypeFields(content, varType);
        if (fields.length > 0) {
          return { requestType: varType, fields };
        }
      }
    }
    
    // Look for second argument in axios calls: axios.post(url, data)
    const axiosDataMatch = lineContent.match(/axios\.\w+\s*(?:<[^>]+>)?\s*\([^,]+,\s*(\w+)/);
    if (axiosDataMatch?.[1]) {
      const varName = axiosDataMatch[1];
      const varType = findVariableType(content, varName, i);
      if (varType) {
        const fields = extractTypeFields(content, varType);
        if (fields.length > 0) {
          return { requestType: varType, fields };
        }
      }
    }
    
    // Look for inline object: { field1, field2 } or { field1: value1 }
    const inlineObjMatch = lineContent.match(/(?:body|data)\s*:\s*\{([^}]+)\}/);
    if (inlineObjMatch?.[1]) {
      const fields = extractInlineObjectFields(inlineObjMatch[1]);
      if (fields.length > 0) {
        return { requestType: undefined, fields };
      }
    }
  }
  
  return { requestType: undefined, fields: [] };
}

/**
 * Find the type of a variable by looking for its declaration
 */
function findVariableType(content: string, varName: string, nearLine: number): string | undefined {
  const lines = content.split('\n');
  
  // Look backwards for variable declaration
  for (let i = nearLine; i >= Math.max(0, nearLine - 30); i--) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    // Pattern: const varName: TypeName = ...
    const typedDeclMatch = lineContent.match(new RegExp(`(?:const|let|var)\\s+${varName}\\s*:\\s*(\\w+)`));
    if (typedDeclMatch?.[1]) {
      return typedDeclMatch[1];
    }
    
    // Pattern: const varName = value as TypeName
    const asMatch = lineContent.match(new RegExp(`(?:const|let|var)\\s+${varName}\\s*=.*\\s+as\\s+(\\w+)`));
    if (asMatch?.[1]) {
      return asMatch[1];
    }
  }
  
  // Look for function parameter type
  for (let i = nearLine; i >= Math.max(0, nearLine - 50); i--) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    // Pattern: function name(varName: TypeName) or (varName: TypeName) =>
    const paramMatch = lineContent.match(new RegExp(`${varName}\\s*:\\s*(\\w+)`));
    if (paramMatch?.[1]) {
      return paramMatch[1];
    }
  }
  
  return undefined;
}

/**
 * Extract fields from inline object literal like { field1, field2: value }
 */
function extractInlineObjectFields(objContent: string): ContractField[] {
  const fields: ContractField[] = [];
  
  // Match shorthand properties (field1) and key-value pairs (field1: value)
  const parts = objContent.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {continue;}
    
    // Shorthand: just the field name
    const shorthandMatch = trimmed.match(/^(\w+)$/);
    if (shorthandMatch?.[1]) {
      fields.push({
        name: shorthandMatch[1],
        type: 'unknown',
        optional: false,
        nullable: false,
      });
      continue;
    }
    
    // Key-value: field: value
    const kvMatch = trimmed.match(/^(\w+)\s*:/);
    if (kvMatch?.[1]) {
      fields.push({
        name: kvMatch[1],
        type: 'unknown',
        optional: false,
        nullable: false,
      });
    }
  }
  
  return fields;
}

function normalizePath(path: string): string {
  return path
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\{(\w+)\}/g, ':$1')
    .replace(/\/+/g, '/');
}

// ============================================================================
// Frontend Type Detector
// ============================================================================

export class FrontendTypeDetector extends BaseDetector {
  readonly id = 'contracts/frontend-types';
  readonly category = 'api' as const;
  readonly subcategory = 'contracts';
  readonly name = 'Frontend Type Detector';
  readonly description = 'Extracts API call definitions and TypeScript types from frontend code';
  readonly supportedLanguages: Language[] = ['typescript', 'javascript'];
  readonly detectionMethod = 'regex' as const;

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;
    
    if (this.isBackendFile(content, file)) {
      return this.createEmptyResult();
    }
    
    const result = this.extractApiCalls(content, file);
    
    return this.createResult([], [], result.confidence, {
      custom: {
        extractedApiCalls: result.apiCalls,
        library: result.library,
      },
    });
  }

  private isBackendFile(content: string, _file: string): boolean {
    // Detect by content patterns, not file path
    // Express/Koa/Hapi server patterns
    if (content.includes('express()') || content.includes('app.listen') ||
        content.includes('router.get(') || content.includes('router.post(') ||
        content.includes('res.json(') || content.includes('res.send(') ||
        content.includes('req.body') || content.includes('req.params')) {
      // But not if it also has React/frontend patterns
      if (!content.includes('import React') && !content.includes("from 'react'") &&
          !content.includes('useState') && !content.includes('useEffect')) {
        return true;
      }
    }
    
    return false;
  }

  private extractApiCalls(content: string, file: string): FrontendExtractionResult {
    const apiCalls: ExtractedApiCall[] = [];
    let library = 'fetch';
    
    if (content.includes('import axios') || content.includes("from 'axios'")) {
      library = 'axios';
    } else if (content.includes('@tanstack/react-query') || content.includes('useQuery')) {
      library = 'react-query';
    }
    
    // Extract fetch calls
    for (const pattern of FETCH_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        const path = match[1];
        if (!path) {continue;}
        
        const method = (match[2]?.toUpperCase() || 'GET') as HttpMethod;
        const line = content.substring(0, match.index).split('\n').length;
        
        if (!path.startsWith('/api') && !path.startsWith('http')) {continue;}
        
        const { responseType, fields: responseFields } = extractResponseFields(content, line);
        const { requestType, fields: requestFields } = ['POST', 'PUT', 'PATCH'].includes(method)
          ? extractRequestFields(content, line)
          : { requestType: undefined, fields: [] };
        
        const apiCall: ExtractedApiCall = {
          method,
          path,
          normalizedPath: normalizePath(path),
          file,
          line,
          responseFields,
          requestFields,
          library: 'fetch',
        };
        if (responseType) {
          apiCall.responseType = responseType;
        }
        if (requestType) {
          apiCall.requestType = requestType;
        }
        apiCalls.push(apiCall);
      }
    }
    
    // Extract axios calls
    for (const pattern of AXIOS_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        let method: HttpMethod;
        let path: string;
        
        if (match[1] && ['get', 'post', 'put', 'patch', 'delete'].includes(match[1].toLowerCase())) {
          method = match[1].toUpperCase() as HttpMethod;
          path = match[2] || '';
        } else {
          path = match[1] || '';
          method = (match[2]?.toUpperCase() || 'GET') as HttpMethod;
        }
        
        if (!path) {continue;}
        
        const line = content.substring(0, match.index).split('\n').length;
        
        if (!path.startsWith('/api') && !path.startsWith('http')) {continue;}
        
        const { responseType, fields: responseFields } = extractResponseFields(content, line);
        const { requestType, fields: requestFields } = ['POST', 'PUT', 'PATCH'].includes(method)
          ? extractRequestFields(content, line)
          : { requestType: undefined, fields: [] };
        
        const apiCall: ExtractedApiCall = {
          method,
          path,
          normalizedPath: normalizePath(path),
          file,
          line,
          responseFields,
          requestFields,
          library: 'axios',
        };
        if (responseType) {
          apiCall.responseType = responseType;
        }
        if (requestType) {
          apiCall.requestType = requestType;
        }
        apiCalls.push(apiCall);
      }
    }
    
    // Extract react-query calls
    for (const pattern of REACT_QUERY_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        let method: HttpMethod = 'GET';
        let path: string;
        
        if (match[2]) {
          method = (match[1]?.toUpperCase() || 'POST') as HttpMethod;
          path = match[2];
        } else {
          path = match[1] || '';
        }
        
        if (!path) {continue;}
        
        const line = content.substring(0, match.index).split('\n').length;
        
        if (!path.startsWith('/api') && !path.startsWith('http')) {continue;}
        
        const { responseType, fields: responseFields } = extractResponseFields(content, line);
        const { requestType, fields: requestFields } = ['POST', 'PUT', 'PATCH'].includes(method)
          ? extractRequestFields(content, line)
          : { requestType: undefined, fields: [] };
        
        const apiCall: ExtractedApiCall = {
          method,
          path,
          normalizedPath: normalizePath(path),
          file,
          line,
          responseFields,
          requestFields,
          library: 'react-query',
        };
        if (responseType) {
          apiCall.responseType = responseType;
        }
        if (requestType) {
          apiCall.requestType = requestType;
        }
        apiCalls.push(apiCall);
      }
    }
    
    // Extract axios client instance calls (e.g., apiClient.get('/api/...'))
    for (const pattern of AXIOS_CLIENT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        const method = (match[2]?.toUpperCase() || 'GET') as HttpMethod;
        const path = match[3] || '';
        
        if (!path) {continue;}
        
        const line = content.substring(0, match.index).split('\n').length;
        
        if (!path.startsWith('/api') && !path.startsWith('http')) {continue;}
        
        const { responseType, fields: responseFields } = extractResponseFields(content, line);
        const { requestType, fields: requestFields } = ['POST', 'PUT', 'PATCH'].includes(method)
          ? extractRequestFields(content, line)
          : { requestType: undefined, fields: [] };
        
        const apiCall: ExtractedApiCall = {
          method,
          path,
          normalizedPath: normalizePath(path),
          file,
          line,
          responseFields,
          requestFields,
          library: 'axios',
        };
        if (responseType) {
          apiCall.responseType = responseType;
        }
        if (requestType) {
          apiCall.requestType = requestType;
        }
        apiCalls.push(apiCall);
      }
    }
    
    return {
      apiCalls,
      library,
      confidence: apiCalls.length > 0 ? 0.75 : 0,
    };
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createFrontendTypeDetector(): FrontendTypeDetector {
  return new FrontendTypeDetector();
}

export function extractFrontendApiCalls(content: string, file: string): FrontendExtractionResult {
  const detector = new FrontendTypeDetector();
  return (detector as any).extractApiCalls(content, file);
}
