/**
 * Django Endpoint Detector
 *
 * Main detector for Django REST Framework endpoints.
 * Orchestrates ViewSet, APIView, Serializer, and URL extraction.
 *
 * @module contracts/django/django-endpoint-detector
 */

import { DjangoSerializerExtractor } from './serializer-extractor.js';
import { VIEWSET_ACTION_METHODS, toContractFields } from './types.js';
import { DjangoURLExtractor } from './url-extractor.js';
import { DjangoViewSetExtractor } from './viewset-extractor.js';
import { BaseDetector } from '../../base/base-detector.js';

import type { DetectionContext, DetectionResult } from '../../base/base-detector.js';
import type { ExtractedEndpoint, BackendExtractionResult } from '../types.js';
import type {
  DjangoViewSetInfo,
  DjangoAPIViewInfo,
  DjangoFunctionViewInfo,
  DjangoSerializerInfo,
  DjangoExtractionResult,
} from './types.js';
import type { ContractField, HttpMethod, Language } from 'driftdetect-core';

// ============================================
// Django Endpoint Detector
// ============================================

/**
 * Detects Django REST Framework API endpoints.
 *
 * Supports:
 * - ModelViewSet and ViewSet classes
 * - APIView and generic views
 * - @api_view decorated functions
 * - Serializer field extraction
 * - Router URL pattern generation
 */
export class DjangoEndpointDetector extends BaseDetector {
  readonly id = 'contracts/django-endpoints';
  readonly category = 'api' as const;
  readonly subcategory = 'contracts';
  readonly name = 'Django REST Framework Endpoint Detector';
  readonly description = 'Extracts API endpoint definitions from Django REST Framework code';
  readonly supportedLanguages: Language[] = ['python'];
  readonly detectionMethod = 'regex' as const;

  private readonly viewsetExtractor: DjangoViewSetExtractor;
  private readonly serializerExtractor: DjangoSerializerExtractor;
  private readonly urlExtractor: DjangoURLExtractor;

  constructor() {
    super();
    this.viewsetExtractor = new DjangoViewSetExtractor();
    this.serializerExtractor = new DjangoSerializerExtractor();
    this.urlExtractor = new DjangoURLExtractor();
  }

  /**
   * Detect Django REST Framework endpoints.
   */
  async detect(context: DetectionContext): Promise<DetectionResult> {
    const { content, file } = context;

    // Check if this is Django code
    if (!this.isDjangoCode(content)) {
      return this.createEmptyResult();
    }

    // Extract all Django components
    const extraction = this.extractDjangoComponents(content, file);

    // Convert to standard endpoint format
    const endpoints = this.convertToEndpoints(extraction, file);

    return this.createResult([], [], extraction.confidence, {
      custom: {
        extractedEndpoints: endpoints,
        framework: 'django',
        djangoExtraction: extraction,
      },
    });
  }

  /**
   * Extract Django REST Framework endpoints for external use.
   */
  extractEndpoints(content: string, file: string): BackendExtractionResult {
    if (!this.isDjangoCode(content)) {
      return { endpoints: [], framework: 'django', confidence: 0 };
    }

    const extraction = this.extractDjangoComponents(content, file);
    const endpoints = this.convertToEndpoints(extraction, file);

    return {
      endpoints,
      framework: 'django',
      confidence: extraction.confidence,
    };
  }

  generateQuickFix(): null {
    return null;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Check if content contains Django REST Framework code.
   */
  private isDjangoCode(content: string): boolean {
    return (
      content.includes('from rest_framework') ||
      content.includes('import rest_framework') ||
      content.includes('from django.') ||
      content.includes('import django.')
    );
  }

  /**
   * Extract all Django components from content.
   */
  private extractDjangoComponents(content: string, file: string): DjangoExtractionResult {
    const viewsets = this.viewsetExtractor.extractViewSets(content, file);
    const apiViews = this.viewsetExtractor.extractAPIViews(content, file);
    const functionViews = this.viewsetExtractor.extractFunctionViews(content, file);
    const serializers = this.serializerExtractor.extractSerializers(content, file);
    const urlPatterns = this.urlExtractor.extractURLPatterns(content, file);
    const routers = this.urlExtractor.extractRouters(content, file);

    // Calculate confidence based on what was found
    const hasEndpoints = viewsets.length > 0 || apiViews.length > 0 || functionViews.length > 0;
    const hasSerializers = serializers.length > 0;
    const hasUrls = urlPatterns.length > 0 || routers.length > 0;

    let confidence = 0;
    if (hasEndpoints) {confidence += 0.4;}
    if (hasSerializers) {confidence += 0.3;}
    if (hasUrls) {confidence += 0.3;}

    return {
      viewsets,
      apiViews,
      functionViews,
      serializers,
      urlPatterns,
      routers,
      confidence,
    };
  }

  /**
   * Convert Django extraction to standard endpoint format.
   */
  private convertToEndpoints(
    extraction: DjangoExtractionResult,
    file: string
  ): ExtractedEndpoint[] {
    const endpoints: ExtractedEndpoint[] = [];

    // Build serializer map for field lookup
    const serializerMap = new Map<string, DjangoSerializerInfo>();
    for (const serializer of extraction.serializers) {
      serializerMap.set(serializer.name, serializer);
    }

    // Convert ViewSets
    for (const viewset of extraction.viewsets) {
      endpoints.push(...this.viewsetToEndpoints(viewset, serializerMap, file));
    }

    // Convert APIViews
    for (const apiView of extraction.apiViews) {
      endpoints.push(...this.apiViewToEndpoints(apiView, serializerMap, file));
    }

    // Convert function views
    for (const funcView of extraction.functionViews) {
      endpoints.push(...this.functionViewToEndpoints(funcView, file));
    }

    return endpoints;
  }

  /**
   * Convert a ViewSet to endpoints.
   */
  private viewsetToEndpoints(
    viewset: DjangoViewSetInfo,
    serializerMap: Map<string, DjangoSerializerInfo>,
    file: string
  ): ExtractedEndpoint[] {
    const endpoints: ExtractedEndpoint[] = [];

    // Get serializer fields
    const responseFields = viewset.serializerClass
      ? this.getSerializerFields(viewset.serializerClass, serializerMap)
      : [];

    // Determine which standard actions are available based on base class
    const actions = this.getViewSetActions(viewset.baseClass);

    // Generate endpoints for standard actions
    for (const [action, method] of Object.entries(actions)) {
      const isDetail = ['retrieve', 'update', 'partial_update', 'destroy'].includes(action);
      const path = isDetail ? `/${viewset.name.toLowerCase()}/:id` : `/${viewset.name.toLowerCase()}`;

      const endpoint: ExtractedEndpoint = {
        method: method,
        path,
        normalizedPath: path,
        file,
        line: viewset.line,
        responseFields,
        requestFields: ['create', 'update', 'partial_update'].includes(action) ? responseFields : [],
        framework: 'django',
      };

      if (viewset.serializerClass) {
        endpoint.responseTypeName = viewset.serializerClass;
      }

      endpoints.push(endpoint);
    }

    // Generate endpoints for custom actions
    for (const action of viewset.customActions) {
      for (const method of action.methods) {
        const basePath = `/${viewset.name.toLowerCase()}`;
        const actionPath = action.urlPath ?? action.name;
        const path = action.detail
          ? `${basePath}/:id/${actionPath}`
          : `${basePath}/${actionPath}`;

        endpoints.push({
          method,
          path,
          normalizedPath: path,
          file,
          line: action.line,
          responseFields: [],
          requestFields: [],
          framework: 'django',
        });
      }
    }

    return endpoints;
  }

  /**
   * Convert an APIView to endpoints.
   */
  private apiViewToEndpoints(
    apiView: DjangoAPIViewInfo,
    serializerMap: Map<string, DjangoSerializerInfo>,
    file: string
  ): ExtractedEndpoint[] {
    const endpoints: ExtractedEndpoint[] = [];

    // Get serializer fields
    const responseFields = apiView.serializerClass
      ? this.getSerializerFields(apiView.serializerClass, serializerMap)
      : [];

    // Generate endpoint for each HTTP method
    for (const method of apiView.methods) {
      const path = `/${apiView.name.toLowerCase().replace(/view$/, '')}`;

      const endpoint: ExtractedEndpoint = {
        method,
        path,
        normalizedPath: path,
        file,
        line: apiView.line,
        responseFields,
        requestFields: ['POST', 'PUT', 'PATCH'].includes(method) ? responseFields : [],
        framework: 'django',
      };

      if (apiView.serializerClass) {
        endpoint.responseTypeName = apiView.serializerClass;
      }

      endpoints.push(endpoint);
    }

    return endpoints;
  }

  /**
   * Convert a function view to endpoints.
   */
  private functionViewToEndpoints(
    funcView: DjangoFunctionViewInfo,
    file: string
  ): ExtractedEndpoint[] {
    const endpoints: ExtractedEndpoint[] = [];

    for (const method of funcView.methods) {
      const path = `/${funcView.name.replace(/_/g, '-')}`;

      endpoints.push({
        method,
        path,
        normalizedPath: path,
        file,
        line: funcView.line,
        responseFields: [],
        requestFields: [],
        framework: 'django',
      });
    }

    return endpoints;
  }

  /**
   * Get fields from a serializer.
   */
  private getSerializerFields(
    serializerName: string,
    serializerMap: Map<string, DjangoSerializerInfo>
  ): ContractField[] {
    const serializer = serializerMap.get(serializerName);
    if (!serializer) {return [];}

    return toContractFields(serializer.fields);
  }

  /**
   * Get available actions for a ViewSet base class.
   */
  private getViewSetActions(baseClass: string): Record<string, HttpMethod> {
    switch (baseClass) {
      case 'ModelViewSet':
        return { ...VIEWSET_ACTION_METHODS };

      case 'ReadOnlyModelViewSet':
        return {
          list: 'GET',
          retrieve: 'GET',
        };

      case 'ViewSet':
      case 'GenericViewSet':
        // No default actions - only custom actions
        return {};

      default:
        // Assume full CRUD for unknown base classes
        return { ...VIEWSET_ACTION_METHODS };
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new Django endpoint detector.
 */
export function createDjangoEndpointDetector(): DjangoEndpointDetector {
  return new DjangoEndpointDetector();
}
