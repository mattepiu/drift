/**
 * Laravel Contract Types
 *
 * Type definitions for Laravel API endpoint detection.
 * Covers routes, controllers, resources, and form requests.
 *
 * @module contracts/laravel/types
 */

import type { ContractField } from 'driftdetect-core';

// ============================================================================
// Route Types
// ============================================================================

/**
 * HTTP methods supported by Laravel routes
 */
export type LaravelHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/**
 * Laravel route definition
 */
export interface LaravelRouteInfo {
  /** HTTP method(s) */
  methods: LaravelHttpMethod[];
  /** Route URI pattern */
  uri: string;
  /** Controller class name */
  controller: string | null;
  /** Controller method/action */
  action: string | null;
  /** Closure route (inline handler) */
  isClosure: boolean;
  /** Route name if defined */
  name: string | null;
  /** Middleware applied to route */
  middleware: string[];
  /** Route prefix from group */
  prefix: string | null;
  /** Route parameters */
  parameters: RouteParameter[];
  /** Where constraints */
  whereConstraints: Record<string, string>;
  /** File path */
  file: string;
  /** Line number */
  line: number;
}

/**
 * Route parameter info
 */
export interface RouteParameter {
  /** Parameter name */
  name: string;
  /** Whether parameter is optional */
  optional: boolean;
  /** Regex constraint if any */
  constraint: string | null;
}

/**
 * Route group info
 */
export interface LaravelRouteGroup {
  /** Group prefix */
  prefix: string | null;
  /** Group middleware */
  middleware: string[];
  /** Group namespace */
  namespace: string | null;
  /** Group name prefix */
  as: string | null;
  /** Nested routes */
  routes: LaravelRouteInfo[];
  /** Line number */
  line: number;
}

// ============================================================================
// Controller Types
// ============================================================================

/**
 * Laravel controller info
 */
export interface LaravelControllerInfo {
  /** Controller class name */
  name: string;
  /** Fully qualified class name */
  fqn: string;
  /** Namespace */
  namespace: string | null;
  /** Base controller class */
  extends: string | null;
  /** Controller middleware */
  middleware: ControllerMiddleware[];
  /** Action methods */
  actions: ControllerAction[];
  /** Whether it's a resource controller */
  isResource: boolean;
  /** Whether it's an API resource controller */
  isApiResource: boolean;
  /** Whether it's an invokable controller */
  isInvokable: boolean;
  /** File path */
  file: string;
  /** Line number */
  line: number;
}

/**
 * Controller middleware definition
 */
export interface ControllerMiddleware {
  /** Middleware name/class */
  name: string;
  /** Only apply to these methods */
  only: string[];
  /** Exclude these methods */
  except: string[];
  /** Line number */
  line: number;
}

/**
 * Controller action/method
 */
export interface ControllerAction {
  /** Method name */
  name: string;
  /** HTTP methods this action handles */
  httpMethods: LaravelHttpMethod[];
  /** Form request class if type-hinted */
  formRequest: string | null;
  /** Return type */
  returnType: string | null;
  /** Parameters */
  parameters: ActionParameter[];
  /** Route model binding parameters */
  modelBindings: ModelBinding[];
  /** Line number */
  line: number;
}

/**
 * Action parameter
 */
export interface ActionParameter {
  /** Parameter name */
  name: string;
  /** Type hint */
  type: string | null;
  /** Whether it's a request object */
  isRequest: boolean;
  /** Whether it's a model binding */
  isModelBinding: boolean;
}

/**
 * Route model binding
 */
export interface ModelBinding {
  /** Parameter name */
  parameter: string;
  /** Model class */
  model: string;
  /** Custom key if not 'id' */
  key: string | null;
}

// ============================================================================
// API Resource Types
// ============================================================================

/**
 * Laravel API Resource info
 */
export interface LaravelResourceInfo {
  /** Resource class name */
  name: string;
  /** Fully qualified class name */
  fqn: string;
  /** Namespace */
  namespace: string | null;
  /** Whether it's a resource collection */
  isCollection: boolean;
  /** Fields returned in toArray() */
  fields: ResourceField[];
  /** Conditional fields (whenLoaded, when, etc.) */
  conditionalFields: ConditionalField[];
  /** Additional data merged */
  additionalData: string[];
  /** File path */
  file: string;
  /** Line number */
  line: number;
}

/**
 * Resource field
 */
export interface ResourceField {
  /** Field name in output */
  name: string;
  /** Source property/method */
  source: string;
  /** Inferred type */
  type: string | null;
  /** Whether field is always present */
  required: boolean;
  /** Line number */
  line: number;
}

/**
 * Conditional resource field
 */
export interface ConditionalField {
  /** Field name */
  name: string;
  /** Condition type */
  conditionType: 'whenLoaded' | 'when' | 'mergeWhen' | 'whenNotNull';
  /** Condition value/relation */
  condition: string;
  /** Nested resource if applicable */
  nestedResource: string | null;
  /** Line number */
  line: number;
}

// ============================================================================
// Form Request Types
// ============================================================================

/**
 * Laravel Form Request info
 */
export interface LaravelFormRequestInfo {
  /** Form request class name */
  name: string;
  /** Fully qualified class name */
  fqn: string;
  /** Namespace */
  namespace: string | null;
  /** Validation rules */
  rules: ValidationRule[];
  /** Authorization logic present */
  hasAuthorization: boolean;
  /** Custom messages */
  hasCustomMessages: boolean;
  /** Custom attributes */
  hasCustomAttributes: boolean;
  /** Prepared for validation hook */
  hasPrepareForValidation: boolean;
  /** File path */
  file: string;
  /** Line number */
  line: number;
}

/**
 * Validation rule
 */
export interface ValidationRule {
  /** Field name */
  field: string;
  /** Rules as array */
  rules: string[];
  /** Whether field is required */
  required: boolean;
  /** Whether field is nullable */
  nullable: boolean;
  /** Inferred type from rules */
  inferredType: string | null;
  /** Line number */
  line: number;
}

// ============================================================================
// Extraction Result Types
// ============================================================================

/**
 * Complete Laravel extraction result
 */
export interface LaravelExtractionResult {
  /** Extracted routes */
  routes: LaravelRouteInfo[];
  /** Extracted controllers */
  controllers: LaravelControllerInfo[];
  /** Extracted API resources */
  resources: LaravelResourceInfo[];
  /** Extracted form requests */
  formRequests: LaravelFormRequestInfo[];
  /** Overall confidence */
  confidence: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Standard Laravel resource controller actions
 */
export const RESOURCE_ACTIONS: Record<string, LaravelHttpMethod> = {
  index: 'GET',
  create: 'GET',
  store: 'POST',
  show: 'GET',
  edit: 'GET',
  update: 'PUT',
  destroy: 'DELETE',
};

/**
 * API resource controller actions (no create/edit)
 */
export const API_RESOURCE_ACTIONS: Record<string, LaravelHttpMethod> = {
  index: 'GET',
  store: 'POST',
  show: 'GET',
  update: 'PUT',
  destroy: 'DELETE',
};

/**
 * Convert validation rules to inferred type
 */
export function inferTypeFromRules(rules: string[]): string | null {
  for (const rule of rules) {
    const lower = rule.toLowerCase();
    if (lower === 'string' || lower.startsWith('string:')) {return 'string';}
    if (lower === 'integer' || lower === 'int') {return 'number';}
    if (lower === 'numeric' || lower === 'decimal') {return 'number';}
    if (lower === 'boolean' || lower === 'bool') {return 'boolean';}
    if (lower === 'array') {return 'array';}
    if (lower === 'date' || lower.startsWith('date_format')) {return 'string';}
    if (lower === 'email') {return 'string';}
    if (lower === 'url') {return 'string';}
    if (lower === 'uuid') {return 'string';}
    if (lower === 'json') {return 'object';}
    if (lower === 'file' || lower === 'image') {return 'file';}
  }
  return null;
}

/**
 * Convert resource fields to contract fields
 */
export function toContractFields(fields: ResourceField[]): ContractField[] {
  return fields.map(field => ({
    name: field.name,
    type: field.type || 'unknown',
    required: field.required,
    optional: !field.required,
    nullable: !field.required,
  }));
}

/**
 * Convert validation rules to contract fields
 */
export function validationRulesToContractFields(rules: ValidationRule[]): ContractField[] {
  return rules.map(rule => ({
    name: rule.field,
    type: rule.inferredType || 'unknown',
    required: rule.required,
    optional: !rule.required,
    nullable: rule.nullable,
  }));
}
