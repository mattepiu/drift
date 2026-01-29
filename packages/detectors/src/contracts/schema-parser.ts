/**
 * Schema Parser
 *
 * Parses OpenAPI and GraphQL schema files to extract contract definitions.
 * This provides more accurate type information than code analysis.
 */

import type { ExtractedEndpoint } from './types.js';
import type { ContractField, HttpMethod } from 'driftdetect-core';

// ============================================================================
// OpenAPI Parser
// ============================================================================

interface OpenAPISchema {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchemaObject>;
  };
  definitions?: Record<string, OpenAPISchemaObject>; // Swagger 2.0
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  requestBody?: {
    content?: Record<string, { schema?: OpenAPISchemaObject }>;
  };
  parameters?: OpenAPIParameter[];
  responses?: Record<string, OpenAPIResponse>;
}

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'body';
  required?: boolean;
  schema?: OpenAPISchemaObject;
}

interface OpenAPIResponse {
  description?: string;
  content?: Record<string, { schema?: OpenAPISchemaObject }>;
  schema?: OpenAPISchemaObject; // Swagger 2.0
}

interface OpenAPISchemaObject {
  type?: string;
  $ref?: string;
  properties?: Record<string, OpenAPISchemaObject>;
  required?: string[];
  items?: OpenAPISchemaObject;
  allOf?: OpenAPISchemaObject[];
  oneOf?: OpenAPISchemaObject[];
  anyOf?: OpenAPISchemaObject[];
  nullable?: boolean;
}

/**
 * Parse OpenAPI/Swagger schema and extract endpoints
 */
export function parseOpenAPISchema(content: string, file: string): ExtractedEndpoint[] {
  const endpoints: ExtractedEndpoint[] = [];
  
  let schema: OpenAPISchema;
  try {
    schema = JSON.parse(content) as OpenAPISchema;
  } catch {
    // Try YAML parsing (basic)
    try {
      schema = parseBasicYAML(content) as OpenAPISchema;
    } catch {
      return endpoints;
    }
  }
  
  if (!schema.paths) {return endpoints;}
  
  const isSwagger2 = !!schema.swagger;
  const definitions = schema.components?.schemas || schema.definitions || {};
  
  for (const [path, pathItem] of Object.entries(schema.paths)) {
    const methods: Array<[string, OpenAPIOperation | undefined]> = [
      ['GET', pathItem.get],
      ['POST', pathItem.post],
      ['PUT', pathItem.put],
      ['PATCH', pathItem.patch],
      ['DELETE', pathItem.delete],
    ];
    
    for (const [method, operation] of methods) {
      if (!operation) {continue;}
      
      const responseFields = extractOpenAPIResponseFields(operation, definitions, isSwagger2);
      const requestFields = extractOpenAPIRequestFields(operation, definitions, isSwagger2);
      
      endpoints.push({
        method: method as HttpMethod,
        path,
        normalizedPath: normalizePath(path),
        file,
        line: 1,
        responseFields,
        requestFields,
        framework: 'openapi',
      });
    }
  }
  
  return endpoints;
}

function extractOpenAPIResponseFields(
  operation: OpenAPIOperation,
  definitions: Record<string, OpenAPISchemaObject>,
  isSwagger2: boolean
): ContractField[] {
  const responses = operation.responses;
  if (!responses) {return [];}
  
  // Look for 200, 201, or default response
  const successResponse = responses['200'] || responses['201'] || responses['default'];
  if (!successResponse) {return [];}
  
  let schema: OpenAPISchemaObject | undefined;
  
  if (isSwagger2) {
    schema = successResponse.schema;
  } else {
    const content = successResponse.content;
    if (content) {
      const jsonContent = content['application/json'] || Object.values(content)[0];
      schema = jsonContent?.schema;
    }
  }
  
  if (!schema) {return [];}
  
  return resolveSchemaToFields(schema, definitions, new Set());
}

function extractOpenAPIRequestFields(
  operation: OpenAPIOperation,
  definitions: Record<string, OpenAPISchemaObject>,
  isSwagger2: boolean
): ContractField[] {
  // OpenAPI 3.x requestBody
  if (operation.requestBody?.content) {
    const jsonContent = operation.requestBody.content['application/json'] || 
                        Object.values(operation.requestBody.content)[0];
    if (jsonContent?.schema) {
      return resolveSchemaToFields(jsonContent.schema, definitions, new Set());
    }
  }
  
  // Swagger 2.0 body parameter
  if (isSwagger2 && operation.parameters) {
    const bodyParam = operation.parameters.find(p => p.in === 'body');
    if (bodyParam?.schema) {
      return resolveSchemaToFields(bodyParam.schema, definitions, new Set());
    }
  }
  
  return [];
}

function resolveSchemaToFields(
  schema: OpenAPISchemaObject,
  definitions: Record<string, OpenAPISchemaObject>,
  visited: Set<string>
): ContractField[] {
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop() || '';
    if (visited.has(refName)) {return [];} // Prevent circular refs
    visited.add(refName);
    
    const refSchema = definitions[refName];
    if (refSchema) {
      return resolveSchemaToFields(refSchema, definitions, visited);
    }
    return [];
  }
  
  // Handle allOf (composition)
  if (schema.allOf) {
    const fields: ContractField[] = [];
    for (const subSchema of schema.allOf) {
      fields.push(...resolveSchemaToFields(subSchema, definitions, visited));
    }
    return fields;
  }
  
  // Handle properties
  if (schema.properties) {
    const required = new Set(schema.required || []);
    const fields: ContractField[] = [];
    
    for (const [name, propSchema] of Object.entries(schema.properties)) {
      const field: ContractField = {
        name,
        type: mapOpenAPIType(propSchema, definitions),
        optional: !required.has(name),
        nullable: propSchema.nullable || false,
      };
      
      // Recurse for nested objects
      if (propSchema.properties || propSchema.$ref) {
        field.children = resolveSchemaToFields(propSchema, definitions, new Set(visited));
      }
      
      fields.push(field);
    }
    
    return fields;
  }
  
  return [];
}

function mapOpenAPIType(schema: OpenAPISchemaObject, definitions: Record<string, OpenAPISchemaObject>): string {
  if (schema.$ref) {
    return schema.$ref.split('/').pop() || 'object';
  }
  
  switch (schema.type) {
    case 'string': return 'string';
    case 'integer':
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'array': {
      const itemType = schema.items ? mapOpenAPIType(schema.items, definitions) : 'unknown';
      return `${itemType}[]`;
    }
    case 'object': return 'object';
    default: return schema.type || 'unknown';
  }
}

// ============================================================================
// GraphQL Parser
// ============================================================================

interface GraphQLField {
  name: string;
  type: string;
  nullable: boolean;
  isList: boolean;
  args?: GraphQLField[] | undefined;
}

interface GraphQLType {
  name: string;
  fields: GraphQLField[];
}

/**
 * Parse GraphQL schema and extract type definitions
 */
export function parseGraphQLSchema(content: string, file: string): ExtractedEndpoint[] {
  const endpoints: ExtractedEndpoint[] = [];
  const types = new Map<string, GraphQLType>();
  
  // Extract type definitions
  const typePattern = /type\s+(\w+)\s*(?:implements\s+[^{]+)?\s*\{([^}]+)\}/g;
  let match;
  
  while ((match = typePattern.exec(content)) !== null) {
    const typeName = match[1];
    const body = match[2];
    if (!typeName || !body) {continue;}
    
    const fields = parseGraphQLFields(body);
    types.set(typeName, { name: typeName, fields });
  }
  
  // Extract Query type as GET endpoints
  const queryType = types.get('Query');
  if (queryType) {
    for (const field of queryType.fields) {
      endpoints.push({
        method: 'GET',
        path: `/graphql/${field.name}`,
        normalizedPath: `/graphql/${field.name}`,
        file,
        line: 1,
        responseFields: resolveGraphQLType(field.type, types),
        requestFields: field.args ? field.args.map(a => ({
          name: a.name,
          type: a.type,
          optional: a.nullable,
          nullable: a.nullable,
        })) : [],
        framework: 'graphql',
      });
    }
  }
  
  // Extract Mutation type as POST endpoints
  const mutationType = types.get('Mutation');
  if (mutationType) {
    for (const field of mutationType.fields) {
      endpoints.push({
        method: 'POST',
        path: `/graphql/${field.name}`,
        normalizedPath: `/graphql/${field.name}`,
        file,
        line: 1,
        responseFields: resolveGraphQLType(field.type, types),
        requestFields: field.args ? field.args.map(a => ({
          name: a.name,
          type: a.type,
          optional: a.nullable,
          nullable: a.nullable,
        })) : [],
        framework: 'graphql',
      });
    }
  }
  
  return endpoints;
}

function parseGraphQLFields(body: string): GraphQLField[] {
  const fields: GraphQLField[] = [];
  const lines = body.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {continue;}
    
    // Match: fieldName(args): Type or fieldName: Type
    const fieldMatch = trimmed.match(/^(\w+)(?:\(([^)]*)\))?\s*:\s*(.+?)(?:\s*#.*)?$/);
    if (!fieldMatch) {continue;}
    
    const [, name, argsStr, typeStr] = fieldMatch;
    if (!name || !typeStr) {continue;}
    
    const { type, nullable, isList } = parseGraphQLType(typeStr);
    const args = argsStr ? parseGraphQLArgs(argsStr) : undefined;
    
    fields.push({ name, type, nullable, isList, args });
  }
  
  return fields;
}

function parseGraphQLArgs(argsStr: string): GraphQLField[] {
  const args: GraphQLField[] = [];
  const argParts = argsStr.split(',');
  
  for (const part of argParts) {
    const argMatch = part.trim().match(/^(\w+)\s*:\s*(.+)$/);
    if (!argMatch) {continue;}
    
    const [, name, typeStr] = argMatch;
    if (!name || !typeStr) {continue;}
    
    const { type, nullable, isList } = parseGraphQLType(typeStr);
    args.push({ name, type, nullable, isList });
  }
  
  return args;
}

function parseGraphQLType(typeStr: string): { type: string; nullable: boolean; isList: boolean } {
  let type = typeStr.trim();
  let nullable = true;
  let isList = false;
  
  // Check for non-null (!)
  if (type.endsWith('!')) {
    nullable = false;
    type = type.slice(0, -1);
  }
  
  // Check for list ([Type])
  if (type.startsWith('[') && type.endsWith(']')) {
    isList = true;
    type = type.slice(1, -1);
    // Inner type might also have !
    if (type.endsWith('!')) {
      type = type.slice(0, -1);
    }
  }
  
  return { type, nullable, isList };
}

function resolveGraphQLType(typeName: string, types: Map<string, GraphQLType>): ContractField[] {
  const typeInfo = types.get(typeName);
  if (!typeInfo) {
    // Scalar type
    return [];
  }
  
  return typeInfo.fields.map(f => ({
    name: f.name,
    type: f.isList ? `${f.type}[]` : f.type,
    optional: f.nullable,
    nullable: f.nullable,
  }));
}

// ============================================================================
// Helpers
// ============================================================================

function normalizePath(path: string): string {
  return path
    .replace(/\{(\w+)\}/g, ':$1')
    .replace(/<(\w+)>/g, ':$1')
    .replace(/\$\{[^}]+\}/g, ':param');
}

/**
 * Basic YAML parser for simple OpenAPI schemas
 * (For full YAML support, use a proper library)
 */
function parseBasicYAML(content: string): unknown {
  // Very basic YAML to JSON conversion for simple cases
  // This handles indentation-based structure
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [{ obj: result, indent: -1 }];
  
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) {continue;}
    
    const indent = line.search(/\S/);
    const trimmed = line.trim();
    
    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }
    
    const parent = stack[stack.length - 1]!.obj;
    
    // Parse key: value
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {continue;}
    
    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();
    
    // Handle quoted strings
    if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
      value = (value as string).slice(1, -1);
    } else if ((value as string).startsWith("'") && (value as string).endsWith("'")) {
      value = (value as string).slice(1, -1);
    } else if (value === '' || value === '{}') {
      // Nested object
      value = {};
      stack.push({ obj: value as Record<string, unknown>, indent });
    } else if (value === '[]') {
      value = [];
    } else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (!isNaN(Number(value))) {
      value = Number(value);
    }
    
    parent[key] = value;
  }
  
  return result;
}

export function isSchemaFile(file: string): boolean {
  const lower = file.toLowerCase();
  return (
    lower.endsWith('openapi.json') ||
    lower.endsWith('openapi.yaml') ||
    lower.endsWith('openapi.yml') ||
    lower.endsWith('swagger.json') ||
    lower.endsWith('swagger.yaml') ||
    lower.endsWith('swagger.yml') ||
    lower.includes('schema.graphql') ||
    lower.endsWith('.graphql')
  );
}
