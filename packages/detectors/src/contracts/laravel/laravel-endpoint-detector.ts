/**
 * Laravel Endpoint Detector
 *
 * Main detector for Laravel API endpoints.
 * Orchestrates Route, Controller, Resource, and FormRequest extraction.
 *
 * @module contracts/laravel/laravel-endpoint-detector
 */

import { ControllerExtractor } from './extractors/controller-extractor.js';
import { FormRequestExtractor } from './extractors/form-request-extractor.js';
import { ResourceExtractor } from './extractors/resource-extractor.js';
import { RouteExtractor } from './extractors/route-extractor.js';
import { toContractFields, validationRulesToContractFields } from './types.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { ExtractedEndpoint, BackendExtractionResult } from '../types.js';
import type {
  LaravelRouteInfo,
  LaravelControllerInfo,
  LaravelResourceInfo,
  LaravelFormRequestInfo,
  LaravelExtractionResult,
} from './types.js';
import type { ContractField, HttpMethod, Language } from 'driftdetect-core';

// ============================================================================
// Laravel Endpoint Detector
// ============================================================================

/**
 * Detects Laravel API endpoints.
 *
 * Supports:
 * - Route definitions (Route::get, Route::resource, etc.)
 * - Controller actions with type hints
 * - API Resources for response structure
 * - Form Requests for request validation
 * - Route model binding
 */
export class LaravelEndpointDetector extends BaseDetector {
  readonly id = 'contracts/laravel-endpoints';
  readonly category = 'api' as const;
  readonly subcategory = 'contracts';
  readonly name = 'Laravel Endpoint Detector';
  readonly description = 'Extracts API endpoint definitions from Laravel code';
  readonly supportedLanguages: Language[] = ['php'];
  readonly detectionMethod = 'regex' as const;

  private readonly routeExtractor: RouteExtractor;
  private readonly controllerExtractor: ControllerExtractor;
  private readonly resourceExtractor: ResourceExtractor;
  private readonly formRequestExtractor: FormRequestExtractor;

  constructor() {
    super();
    this.routeExtractor = new RouteExtractor();
    this.controllerExtractor = new ControllerExtractor();
    this.resourceExtractor = new ResourceExtractor();
    this.formRequestExtractor = new FormRequestExtractor();
  }

  /**
   * Detect Laravel API endpoints.
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    // Check if this is Laravel code
    if (!this.isLaravelCode(content)) {
      return this.createEmptyResult();
    }

    // Extract all Laravel components
    const extraction = this.extractLaravelComponents(content, file);

    // Convert to standard endpoint format
    const endpoints = this.convertToEndpoints(extraction, file);

    return this.createResult([], [], extraction.confidence, {
      custom: {
        extractedEndpoints: endpoints,
        framework: 'laravel',
        laravelExtraction: extraction,
      },
    });
  }

  /**
   * Extract Laravel endpoints for external use.
   */
  extractEndpoints(content: string, file: string): BackendExtractionResult {
    if (!this.isLaravelCode(content)) {
      return { endpoints: [], framework: 'laravel', confidence: 0 };
    }

    const extraction = this.extractLaravelComponents(content, file);
    const endpoints = this.convertToEndpoints(extraction, file);

    return {
      endpoints,
      framework: 'laravel',
      confidence: extraction.confidence,
    };
  }

  generateQuickFix(): null {
    return null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Check if content contains Laravel code.
   */
  private isLaravelCode(content: string): boolean {
    return (
      content.includes('use Illuminate\\') ||
      content.includes('use App\\') ||
      content.includes('Route::') ||
      content.includes('extends Controller') ||
      content.includes('extends FormRequest') ||
      content.includes('extends JsonResource')
    );
  }

  /**
   * Extract all Laravel components from content.
   */
  private extractLaravelComponents(content: string, file: string): LaravelExtractionResult {
    const routes = this.routeExtractor.extract(content, file);
    const controllers = this.controllerExtractor.extract(content, file);
    const resources = this.resourceExtractor.extract(content, file);
    const formRequests = this.formRequestExtractor.extract(content, file);

    // Calculate confidence based on what was found
    const hasRoutes = routes.length > 0;
    const hasControllers = controllers.length > 0;
    const hasResources = resources.length > 0;
    const hasFormRequests = formRequests.length > 0;

    let confidence = 0;
    if (hasRoutes) {confidence += 0.3;}
    if (hasControllers) {confidence += 0.3;}
    if (hasResources) {confidence += 0.2;}
    if (hasFormRequests) {confidence += 0.2;}

    return {
      routes,
      controllers,
      resources,
      formRequests,
      confidence,
    };
  }

  /**
   * Convert Laravel extraction to standard endpoint format.
   */
  private convertToEndpoints(
    extraction: LaravelExtractionResult,
    file: string
  ): ExtractedEndpoint[] {
    const endpoints: ExtractedEndpoint[] = [];

    // Build lookup maps
    const controllerMap = new Map<string, LaravelControllerInfo>();
    for (const controller of extraction.controllers) {
      controllerMap.set(controller.name, controller);
    }

    const resourceMap = new Map<string, LaravelResourceInfo>();
    for (const resource of extraction.resources) {
      resourceMap.set(resource.name, resource);
    }

    const formRequestMap = new Map<string, LaravelFormRequestInfo>();
    for (const formRequest of extraction.formRequests) {
      formRequestMap.set(formRequest.name, formRequest);
    }

    // Convert routes to endpoints
    for (const route of extraction.routes) {
      endpoints.push(...this.routeToEndpoints(route, controllerMap, resourceMap, formRequestMap, file));
    }

    // If no routes but have controllers, generate endpoints from controllers
    if (extraction.routes.length === 0 && extraction.controllers.length > 0) {
      for (const controller of extraction.controllers) {
        endpoints.push(...this.controllerToEndpoints(controller, resourceMap, formRequestMap, file));
      }
    }

    return endpoints;
  }

  /**
   * Convert a route to endpoints.
   */
  private routeToEndpoints(
    route: LaravelRouteInfo,
    controllerMap: Map<string, LaravelControllerInfo>,
    resourceMap: Map<string, LaravelResourceInfo>,
    formRequestMap: Map<string, LaravelFormRequestInfo>,
    _file: string
  ): ExtractedEndpoint[] {
    const endpoints: ExtractedEndpoint[] = [];

    // Get controller and action info
    const controller = route.controller ? controllerMap.get(route.controller) : null;
    const action = controller?.actions.find(a => a.name === route.action);

    // Get response fields from resource
    let responseFields: ContractField[] = [];
    if (action?.returnType) {
      const resource = resourceMap.get(action.returnType);
      if (resource) {
        responseFields = toContractFields(resource.fields);
      }
    }

    // Get request fields from form request
    let requestFields: ContractField[] = [];
    if (action?.formRequest) {
      const formRequest = formRequestMap.get(action.formRequest);
      if (formRequest) {
        requestFields = validationRulesToContractFields(formRequest.rules);
      }
    }

    // Create endpoint for each HTTP method
    for (const method of route.methods) {
      const normalizedPath = this.normalizePath(route.uri);

      const endpoint: ExtractedEndpoint = {
        method: method as HttpMethod,
        path: `/${route.uri}`,
        normalizedPath,
        file: route.file,
        line: route.line,
        responseFields,
        requestFields: ['POST', 'PUT', 'PATCH'].includes(method) ? requestFields : [],
        framework: 'laravel',
      };

      if (action?.returnType) {
        endpoint.responseTypeName = action.returnType;
      }

      if (action?.formRequest) {
        endpoint.requestTypeName = action.formRequest;
      }

      endpoints.push(endpoint);
    }

    return endpoints;
  }

  /**
   * Convert a controller to endpoints (when no routes available).
   */
  private controllerToEndpoints(
    controller: LaravelControllerInfo,
    resourceMap: Map<string, LaravelResourceInfo>,
    formRequestMap: Map<string, LaravelFormRequestInfo>,
    _file: string
  ): ExtractedEndpoint[] {
    const endpoints: ExtractedEndpoint[] = [];

    // Generate base path from controller name
    const basePath = this.controllerToPath(controller.name);

    for (const action of controller.actions) {
      // Get response fields from resource
      let responseFields: ContractField[] = [];
      if (action.returnType) {
        const resource = resourceMap.get(action.returnType);
        if (resource) {
          responseFields = toContractFields(resource.fields);
        }
      }

      // Get request fields from form request
      let requestFields: ContractField[] = [];
      if (action.formRequest) {
        const formRequest = formRequestMap.get(action.formRequest);
        if (formRequest) {
          requestFields = validationRulesToContractFields(formRequest.rules);
        }
      }

      // Determine path based on action
      const isDetail = ['show', 'edit', 'update', 'destroy'].includes(action.name);
      const actionPath = isDetail ? `${basePath}/:id` : basePath;

      for (const method of action.httpMethods) {
        endpoints.push({
          method: method as HttpMethod,
          path: actionPath,
          normalizedPath: actionPath,
          file: controller.file,
          line: action.line,
          responseFields,
          requestFields: ['POST', 'PUT', 'PATCH'].includes(method) ? requestFields : [],
          framework: 'laravel',
          ...(action.returnType && { responseTypeName: action.returnType }),
          ...(action.formRequest && { requestTypeName: action.formRequest }),
        });
      }
    }

    return endpoints;
  }

  /**
   * Normalize a Laravel route path to standard format.
   */
  private normalizePath(uri: string): string {
    // Convert Laravel {param} to :param
    return '/' + uri.replace(/\{(\w+)\??}/g, ':$1');
  }

  /**
   * Convert controller name to path.
   */
  private controllerToPath(controllerName: string): string {
    // Remove 'Controller' suffix and convert to kebab-case
    const name = controllerName.replace(/Controller$/, '');
    return '/' + name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Laravel endpoint detector.
 */
export function createLaravelEndpointDetector(): LaravelEndpointDetector {
  return new LaravelEndpointDetector();
}
