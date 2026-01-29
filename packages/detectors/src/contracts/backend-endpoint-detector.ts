/**
 * Backend Endpoint Detector
 *
 * Extracts API endpoint definitions from backend code.
 * Supports Python (FastAPI, Flask, Django) and TypeScript (Express).
 */

import { BaseDetector } from '../base/base-detector.js';
import { AspNetEndpointDetector } from './aspnet/aspnet-endpoint-detector.js';
import { DjangoEndpointDetector } from './django/django-endpoint-detector.js';

import type { ExtractedEndpoint, BackendExtractionResult } from './types.js';
import type { DetectionContext, DetectionResult } from '../base/base-detector.js';
import type { ContractField, HttpMethod, Language } from 'driftdetect-core';

// ============================================================================
// FastAPI Pattern Matchers
// ============================================================================

const FASTAPI_ROUTE_PATTERNS = [
  /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/gi,
  /@(?:app|router)\.api_route\s*\(\s*["']([^"']+)["']/gi,
];

const FLASK_ROUTE_PATTERNS = [
  /@(?:app|bp|blueprint)\.(route|get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/gi,
];

const EXPRESS_ROUTE_PATTERNS = [
  /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
];

// ============================================================================
// Field Extraction Helpers
// ============================================================================

// Response wrappers that don't represent actual response schema
const RESPONSE_WRAPPERS = new Set([
  'JSONResponse', 'Response', 'HTMLResponse', 'PlainTextResponse',
  'RedirectResponse', 'StreamingResponse', 'FileResponse',
  'jsonify', 'make_response',  // Flask
]);

// Field names that are artifacts and should be filtered out
const ARTIFACT_FIELD_NAMES = new Set([
  '_model', '__model', 'model_', '_type', '__type',
]);

/**
 * Extract fields from a Pydantic model class definition
 */
function extractPydanticModelFields(content: string, modelName: string): ContractField[] {
  const fields: ContractField[] = [];
  
  // Skip response wrappers - they don't have meaningful fields
  if (RESPONSE_WRAPPERS.has(modelName)) {
    return fields;
  }
  
  // Find the class definition: class ModelName(BaseModel):
  const classPattern = new RegExp(`class\\s+${modelName}\\s*\\([^)]*\\)\\s*:`, 'g');
  const classMatch = classPattern.exec(content);
  if (!classMatch) {return fields;}
  
  const classStart = classMatch.index + classMatch[0].length;
  const lines = content.substring(classStart).split('\n');
  
  // Parse fields until we hit another class or unindented line
  for (let i = 0; i < lines.length && i < 30; i++) {
    const line = lines[i];
    if (!line) {continue;}
    
    // Stop at next class definition or unindented non-empty line
    if (i > 0 && line.match(/^[^\s]/) && line.trim()) {break;}
    if (line.match(/^class\s+/)) {break;}
    
    // Match field definitions: field_name: Type or field_name: Optional[Type] = default
    const fieldMatch = line.match(/^\s+(\w+)\s*:\s*(?:Optional\[)?(\w+)(?:\])?\s*(?:=.*)?$/);
    if (fieldMatch?.[1] && fieldMatch[2]) {
      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];
      const isOptional = line.includes('Optional[') || line.includes('= None') || line.includes('= Field(');
      
      // Skip private fields, class methods, and artifact names
      if (!fieldName.startsWith('_') && fieldName !== 'class' && !ARTIFACT_FIELD_NAMES.has(fieldName)) {
        fields.push({
          name: fieldName,
          type: mapPythonType(fieldType),
          optional: isOptional,
          nullable: line.includes('= None'),
          line: 0,
        });
      }
    }
  }
  
  return fields;
}

/**
 * Map Python types to generic types
 */
function mapPythonType(pythonType: string): string {
  const typeMap: Record<string, string> = {
    'str': 'string',
    'int': 'number',
    'float': 'number',
    'bool': 'boolean',
    'list': 'array',
    'dict': 'object',
    'List': 'array',
    'Dict': 'object',
    'Any': 'any',
  };
  return typeMap[pythonType] || pythonType;
}

/**
 * Extract response_model from FastAPI decorator
 */
function extractResponseModel(content: string, decoratorLine: number): string | null {
  const lines = content.split('\n');
  // Look at the decorator line and possibly the next few lines (for multi-line decorators)
  const decoratorContent = lines.slice(decoratorLine - 1, decoratorLine + 2).join(' ');
  
  const responseModelMatch = decoratorContent.match(/response_model\s*=\s*(\w+)/);
  return responseModelMatch?.[1] ? responseModelMatch[1] : null;
}

function extractPythonResponseFields(content: string, line: number): ContractField[] {
  const fields: ContractField[] = [];
  const lines = content.split('\n');
  const endLine = Math.min(line + 50, lines.length);
  
  // First, check if there's a response_model in the decorator
  const responseModel = extractResponseModel(content, line);
  if (responseModel && !RESPONSE_WRAPPERS.has(responseModel)) {
    const modelFields = extractPydanticModelFields(content, responseModel);
    if (modelFields.length > 0) {
      return modelFields;
    }
  }
  
  // Fallback: scan function body for return statements
  let foundFields = false;
  
  for (let i = line; i < endLine; i++) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    // Stop at next function/class definition
    if (i > line && lineContent.match(/^(?:def|class|@)\s/)) {break;}
    
    // Pattern 1: return {...} - direct dict return
    const dictMatch = lineContent.match(/return\s*\{([^}]+)\}/);
    if (dictMatch?.[1]) {
      extractDictFields(dictMatch[1], i + 1, fields);
      foundFields = true;
      continue;
    }
    
    // Pattern 2: return JSONResponse({...}) or jsonify({...}) - wrapper with dict
    const wrapperDictMatch = lineContent.match(/return\s+(\w+)\s*\(\s*\{([^}]+)\}/);
    if (wrapperDictMatch?.[1] && wrapperDictMatch[2]) {
      const wrapperName = wrapperDictMatch[1];
      if (RESPONSE_WRAPPERS.has(wrapperName)) {
        extractDictFields(wrapperDictMatch[2], i + 1, fields);
        foundFields = true;
        continue;
      }
    }
    
    // Pattern 3: return SomeModel(...) - Pydantic model return (without response_model)
    if (!foundFields && !responseModel) {
      const modelMatch = lineContent.match(/return\s+(\w+)\s*\(/);
      if (modelMatch?.[1]) {
        const modelName = modelMatch[1];
        if (!RESPONSE_WRAPPERS.has(modelName)) {
          // Try to extract fields from the model definition
          const modelFields = extractPydanticModelFields(content, modelName);
          if (modelFields.length > 0) {
            fields.push(...modelFields);
            foundFields = true;
          }
        }
      }
    }
  }
  
  return fields;
}

function extractDictFields(dictContent: string, line: number, fields: ContractField[]): void {
  const keyMatches = dictContent.matchAll(/["'](\w+)["']\s*:/g);
  for (const match of keyMatches) {
    if (match[1] && !ARTIFACT_FIELD_NAMES.has(match[1])) {
      fields.push({
        name: match[1],
        type: 'unknown',
        optional: false,
        nullable: false,
        line,
      });
    }
  }
}

// ============================================================================
// Request Body Extraction
// ============================================================================

/**
 * Extract request body type from FastAPI function parameters
 * Looks for patterns like: def endpoint(body: RequestModel) or def endpoint(data: RequestModel = Body(...))
 */
function extractPythonRequestFields(content: string, line: number): ContractField[] {
  const lines = content.split('\n');
  
  // Find the function definition (should be right after the decorator)
  for (let i = line; i < Math.min(line + 5, lines.length); i++) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    // Match function definition: def func_name(params):
    const funcMatch = lineContent.match(/def\s+\w+\s*\(([^)]+)\)/);
    if (!funcMatch?.[1]) {continue;}
    
    const params = funcMatch[1];
    
    // Look for typed parameters that could be request bodies
    // Pattern 1: param: ModelName (Pydantic model)
    // Pattern 2: param: ModelName = Body(...)
    // Pattern 3: param: ModelName = Depends(...)
    const paramMatches = params.matchAll(/(\w+)\s*:\s*(\w+)(?:\s*=\s*(?:Body|Depends)\s*\([^)]*\))?/g);
    
    for (const match of paramMatches) {
      const paramName = match[1];
      const typeName = match[2];
      if (!paramName || !typeName) {continue;}
      
      // Skip common non-body parameters
      if (['Request', 'Response', 'BackgroundTasks', 'Depends', 'str', 'int', 'float', 'bool'].includes(typeName)) {
        continue;
      }
      
      // Skip path/query parameters (usually simple types or have default values without Body())
      if (paramName === 'request' || paramName === 'response' || paramName === 'db') {
        continue;
      }
      
      // Try to extract fields from the Pydantic model
      const modelFields = extractPydanticModelFields(content, typeName);
      if (modelFields.length > 0) {
        return modelFields;
      }
    }
  }
  
  return [];
}

/**
 * Extract request body from Express route handler
 * Looks for req.body usage patterns
 */
function extractExpressRequestFields(content: string, line: number): ContractField[] {
  const fields: ContractField[] = [];
  const lines = content.split('\n');
  const endLine = Math.min(line + 50, lines.length);
  const seenFields = new Set<string>();
  
  for (let i = line; i < endLine; i++) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    // Stop at next route definition
    if (i > line && lineContent.match(/(?:app|router)\.(get|post|put|patch|delete)\s*\(/)) {break;}
    
    // Pattern 1: const { field1, field2 } = req.body
    const destructureMatch = lineContent.match(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*req\.body/);
    if (destructureMatch?.[1]) {
      const fieldNames = destructureMatch[1].split(',').map(f => f.trim().split(':')[0]?.trim()).filter(Boolean);
      for (const name of fieldNames) {
        if (name && !seenFields.has(name)) {
          seenFields.add(name);
          fields.push({
            name,
            type: 'unknown',
            optional: false,
            nullable: false,
            line: i + 1,
          });
        }
      }
    }
    
    // Pattern 2: req.body.fieldName
    const dotAccessMatches = lineContent.matchAll(/req\.body\.(\w+)/g);
    for (const match of dotAccessMatches) {
      const name = match[1];
      if (name && !seenFields.has(name)) {
        seenFields.add(name);
        fields.push({
          name,
          type: 'unknown',
          optional: false,
          nullable: false,
          line: i + 1,
        });
      }
    }
    
    // Pattern 3: req.body['fieldName'] or req.body["fieldName"]
    const bracketAccessMatches = lineContent.matchAll(/req\.body\[["'](\w+)["']\]/g);
    for (const match of bracketAccessMatches) {
      const name = match[1];
      if (name && !seenFields.has(name)) {
        seenFields.add(name);
        fields.push({
          name,
          type: 'unknown',
          optional: false,
          nullable: false,
          line: i + 1,
        });
      }
    }
  }
  
  return fields;
}

function extractExpressResponseFields(content: string, line: number): ContractField[] {
  const fields: ContractField[] = [];
  const lines = content.split('\n');
  const endLine = Math.min(line + 50, lines.length);
  
  for (let i = line; i < endLine; i++) {
    const lineContent = lines[i];
    if (!lineContent) {continue;}
    
    const jsonMatch = lineContent.match(/res\.(?:json|send)\s*\(\s*\{([^}]+)\}/);
    if (jsonMatch?.[1]) {
      const objContent = jsonMatch[1];
      const keyMatches = objContent.matchAll(/(\w+)\s*:/g);
      for (const match of keyMatches) {
        if (match[1]) {
          fields.push({
            name: match[1],
            type: 'unknown',
            optional: false,
            nullable: false,
            line: i + 1,
          });
        }
      }
    }
  }
  
  return fields;
}

function normalizePath(path: string): string {
  return path
    .replace(/\{(\w+)\}/g, ':$1')
    .replace(/<(\w+)>/g, ':$1')
    .replace(/\$\{(\w+)\}/g, ':$1');
}

// ============================================================================
// Backend Endpoint Detector
// ============================================================================

export class BackendEndpointDetector extends BaseDetector {
  readonly id = 'contracts/backend-endpoints';
  readonly category = 'api' as const;
  readonly subcategory = 'contracts';
  readonly name = 'Backend Endpoint Detector';
  readonly description = 'Extracts API endpoint definitions from backend code for contract matching';
  readonly supportedLanguages: Language[] = ['python', 'typescript', 'javascript', 'csharp'];
  readonly detectionMethod = 'regex' as const;

  private readonly djangoDetector: DjangoEndpointDetector;
  private readonly aspnetDetector: AspNetEndpointDetector;

  constructor() {
    super();
    this.djangoDetector = new DjangoEndpointDetector();
    this.aspnetDetector = new AspNetEndpointDetector();
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, language, file } = context;
    
    let result: BackendExtractionResult;
    
    if (language === 'csharp') {
      // Use ASP.NET detector for C#
      const aspnetResult = this.aspnetDetector.extractControllerEndpoints(content, file);
      if (aspnetResult.confidence === 0) {
        // Try minimal API
        const minimalResult = this.aspnetDetector.extractMinimalApiEndpoints(content, file);
        result = {
          endpoints: minimalResult.endpoints.map(e => ({
            method: e.method,
            path: e.path,
            normalizedPath: e.normalizedPath,
            file: e.file,
            line: e.line,
            responseFields: e.responseFields,
            requestFields: e.requestFields,
            framework: e.framework,
          })),
          framework: minimalResult.framework,
          confidence: minimalResult.confidence,
        };
      } else {
        result = {
          endpoints: aspnetResult.endpoints.map(e => ({
            method: e.method,
            path: e.path,
            normalizedPath: e.normalizedPath,
            file: e.file,
            line: e.line,
            responseFields: e.responseFields,
            requestFields: e.requestFields,
            framework: e.framework,
          })),
          framework: aspnetResult.framework,
          confidence: aspnetResult.confidence,
        };
      }
    } else if (language === 'python') {
      // Detect Python framework
      const framework = this.detectPythonFramework(content);
      
      if (framework === 'django') {
        result = this.djangoDetector.extractEndpoints(content, file);
      } else {
        result = this.extractPythonEndpoints(content, file);
      }
    } else if (language === 'typescript' || language === 'javascript') {
      result = this.extractExpressEndpoints(content, file);
    } else {
      return this.createEmptyResult();
    }
    
    return this.createResult([], [], result.confidence, {
      custom: {
        extractedEndpoints: result.endpoints,
        framework: result.framework,
      },
    });
  }

  /**
   * Detect which Python framework is being used.
   */
  private detectPythonFramework(content: string): 'django' | 'fastapi' | 'flask' | 'unknown' {
    if (content.includes('from rest_framework') || content.includes('import rest_framework')) {
      return 'django';
    }
    if (content.includes('from django.') || content.includes('import django.')) {
      // Check for DRF-specific patterns
      if (content.includes('ViewSet') || content.includes('APIView') || content.includes('@api_view')) {
        return 'django';
      }
    }
    if (content.includes('from fastapi') || content.includes('import fastapi')) {
      return 'fastapi';
    }
    if (content.includes('from flask') || content.includes('import flask')) {
      return 'flask';
    }
    return 'unknown';
  }

  private extractPythonEndpoints(content: string, file: string): BackendExtractionResult {
    const endpoints: ExtractedEndpoint[] = [];
    let framework = 'unknown';
    
    if (content.includes('from fastapi') || content.includes('import fastapi')) {
      framework = 'fastapi';
    } else if (content.includes('from flask') || content.includes('import flask')) {
      framework = 'flask';
    }
    
    const patterns = framework === 'fastapi' ? FASTAPI_ROUTE_PATTERNS : FLASK_ROUTE_PATTERNS;
    
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        const method = (match[1]?.toUpperCase() || 'GET') as HttpMethod;
        const path = match[2] || match[1] || '';
        if (!path) {continue;}
        
        const line = content.substring(0, match.index).split('\n').length;
        
        // Extract request fields for POST/PUT/PATCH methods
        const requestFields = ['POST', 'PUT', 'PATCH'].includes(method)
          ? extractPythonRequestFields(content, line)
          : [];
        
        endpoints.push({
          method,
          path,
          normalizedPath: normalizePath(path),
          file,
          line,
          responseFields: extractPythonResponseFields(content, line),
          requestFields,
          framework,
        });
      }
    }
    
    return {
      endpoints,
      framework,
      confidence: endpoints.length > 0 ? 0.8 : 0,
    };
  }

  private extractExpressEndpoints(content: string, file: string): BackendExtractionResult {
    const endpoints: ExtractedEndpoint[] = [];
    const framework = 'express';
    
    if (content.includes('import React') || content.includes('from "react"')) {
      return { endpoints: [], framework, confidence: 0 };
    }
    
    for (const pattern of EXPRESS_ROUTE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        const method = (match[1]?.toUpperCase() || 'GET') as HttpMethod;
        const path = match[2] || '';
        if (!path) {continue;}
        
        const line = content.substring(0, match.index).split('\n').length;
        
        // Extract request fields for POST/PUT/PATCH methods
        const requestFields = ['POST', 'PUT', 'PATCH'].includes(method)
          ? extractExpressRequestFields(content, line)
          : [];
        
        endpoints.push({
          method,
          path,
          normalizedPath: normalizePath(path),
          file,
          line,
          responseFields: extractExpressResponseFields(content, line),
          requestFields,
          framework,
        });
      }
    }
    
    return {
      endpoints,
      framework,
      confidence: endpoints.length > 0 ? 0.8 : 0,
    };
  }

  generateQuickFix(): null {
    return null;
  }
}

export function createBackendEndpointDetector(): BackendEndpointDetector {
  return new BackendEndpointDetector();
}

export function extractBackendEndpoints(
  content: string,
  file: string,
  language: 'python' | 'typescript' | 'javascript'
): BackendExtractionResult {
  const detector = new BackendEndpointDetector();
  
  if (language === 'python') {
    return (detector as any).extractPythonEndpoints(content, file);
  } else {
    return (detector as any).extractExpressEndpoints(content, file);
  }
}
