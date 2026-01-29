/**
 * Django ViewSet Extractor
 *
 * Extracts ViewSet and APIView definitions from Django REST Framework code.
 * Handles ModelViewSet, ViewSet, APIView, and function-based views.
 *
 * @module contracts/django/viewset-extractor
 */

import type {
  DjangoViewSetInfo,
  DjangoAPIViewInfo,
  DjangoFunctionViewInfo,
  DjangoActionInfo,
} from './types.js';
import type { HttpMethod } from 'driftdetect-core';

// ============================================
// Regex Patterns
// ============================================

/**
 * Pattern to match ViewSet class definitions.
 */
const VIEWSET_CLASS_PATTERN = /class\s+(\w+)\s*\(\s*([\w.,\s]+)\s*\)\s*:/g;

/**
 * Pattern to match @action decorator.
 */
const ACTION_DECORATOR_PATTERN = /@action\s*\(([^)]*)\)/g;

/**
 * Pattern to match @api_view decorator.
 */
const API_VIEW_DECORATOR_PATTERN = /@api_view\s*\(\s*\[([^\]]*)\]\s*\)/g;

/**
 * Pattern to match @permission_classes decorator.
 */
const PERMISSION_CLASSES_PATTERN = /@permission_classes\s*\(\s*\[([^\]]*)\]\s*\)/g;

/**
 * Pattern to match @throttle_classes decorator.
 */
const THROTTLE_CLASSES_PATTERN = /@throttle_classes\s*\(\s*\[([^\]]*)\]\s*\)/g;

/**
 * Pattern to match queryset assignment.
 */
const QUERYSET_PATTERN = /queryset\s*=\s*([^\n]+)/;

/**
 * Pattern to match serializer_class assignment.
 */
const SERIALIZER_CLASS_PATTERN = /serializer_class\s*=\s*(\w+)/;

/**
 * Pattern to match permission_classes assignment.
 */
const PERMISSION_CLASSES_ATTR_PATTERN = /permission_classes\s*=\s*\[([^\]]*)\]/;

/**
 * Pattern to match authentication_classes assignment.
 */
const AUTH_CLASSES_PATTERN = /authentication_classes\s*=\s*\[([^\]]*)\]/;

/**
 * Pattern to match HTTP method definitions in APIView.
 */
const HTTP_METHOD_PATTERN = /def\s+(get|post|put|patch|delete|head|options|trace)\s*\(/gi;

// ============================================
// ViewSet Extractor Class
// ============================================

/**
 * Extracts Django REST Framework ViewSet and APIView definitions.
 */
export class DjangoViewSetExtractor {
  /**
   * Extract all ViewSets from Python content.
   *
   * @param content - Python source code
   * @param file - File path
   * @returns Array of ViewSet information
   */
  extractViewSets(content: string, file: string): DjangoViewSetInfo[] {
    const viewsets: DjangoViewSetInfo[] = [];

    VIEWSET_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = VIEWSET_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1];
      const bases = match[2];

      if (!name || !bases) {continue;}

      // Check if this is a ViewSet class
      if (!this.isViewSetClass(bases)) {continue;}

      const line = this.getLineNumber(content, match.index);
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      const viewset = this.parseViewSet(name, bases, classBody, file, line);
      viewsets.push(viewset);
    }

    return viewsets;
  }

  /**
   * Extract all APIViews from Python content.
   *
   * @param content - Python source code
   * @param file - File path
   * @returns Array of APIView information
   */
  extractAPIViews(content: string, file: string): DjangoAPIViewInfo[] {
    const apiViews: DjangoAPIViewInfo[] = [];

    VIEWSET_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = VIEWSET_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1];
      const bases = match[2];

      if (!name || !bases) {continue;}

      // Check if this is an APIView class (but not ViewSet)
      if (!this.isAPIViewClass(bases) || this.isViewSetClass(bases)) {continue;}

      const line = this.getLineNumber(content, match.index);
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      const apiView = this.parseAPIView(name, bases, classBody, file, line);
      apiViews.push(apiView);
    }

    return apiViews;
  }

  /**
   * Extract all function-based views with @api_view decorator.
   *
   * @param content - Python source code
   * @param file - File path
   * @returns Array of function view information
   */
  extractFunctionViews(content: string, file: string): DjangoFunctionViewInfo[] {
    const functionViews: DjangoFunctionViewInfo[] = [];

    API_VIEW_DECORATOR_PATTERN.lastIndex = 0;

    let match;
    while ((match = API_VIEW_DECORATOR_PATTERN.exec(content)) !== null) {
      const methodsStr = match[1];
      const line = this.getLineNumber(content, match.index);

      // Find the function definition after the decorator
      const afterDecorator = content.substring(match.index + match[0].length);
      const funcMatch = afterDecorator.match(/(?:@\w+[^\n]*\n)*\s*def\s+(\w+)\s*\(/);

      if (!funcMatch?.[1]) {continue;}

      const funcName = funcMatch[1];
      const methods = this.parseMethodsList(methodsStr ?? '');

      // Look for permission_classes decorator
      const permissionClasses = this.extractDecoratorList(
        content.substring(match.index - 200, match.index + 200),
        PERMISSION_CLASSES_PATTERN
      );

      // Look for throttle_classes decorator
      const throttleClasses = this.extractDecoratorList(
        content.substring(match.index - 200, match.index + 200),
        THROTTLE_CLASSES_PATTERN
      );

      functionViews.push({
        name: funcName,
        methods,
        permissionClasses,
        throttleClasses,
        file,
        line,
      });
    }

    return functionViews;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Check if base classes indicate a ViewSet.
   */
  private isViewSetClass(bases: string): boolean {
    const viewsetBases = [
      'ViewSet',
      'ModelViewSet',
      'ReadOnlyModelViewSet',
      'GenericViewSet',
      'viewsets.ViewSet',
      'viewsets.ModelViewSet',
      'viewsets.ReadOnlyModelViewSet',
      'viewsets.GenericViewSet',
    ];

    return viewsetBases.some((base) => bases.includes(base));
  }

  /**
   * Check if base classes indicate an APIView.
   */
  private isAPIViewClass(bases: string): boolean {
    const apiViewBases = [
      'APIView',
      'GenericAPIView',
      'CreateAPIView',
      'ListAPIView',
      'RetrieveAPIView',
      'DestroyAPIView',
      'UpdateAPIView',
      'ListCreateAPIView',
      'RetrieveUpdateAPIView',
      'RetrieveDestroyAPIView',
      'RetrieveUpdateDestroyAPIView',
      'views.APIView',
      'generics.GenericAPIView',
      'generics.CreateAPIView',
      'generics.ListAPIView',
      'generics.RetrieveAPIView',
      'generics.DestroyAPIView',
      'generics.UpdateAPIView',
      'generics.ListCreateAPIView',
      'generics.RetrieveUpdateAPIView',
      'generics.RetrieveDestroyAPIView',
      'generics.RetrieveUpdateDestroyAPIView',
    ];

    return apiViewBases.some((base) => bases.includes(base));
  }

  /**
   * Extract the class body.
   */
  private extractClassBody(content: string, startIndex: number): string {
    const lines = content.substring(startIndex).split('\n');
    const bodyLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) {continue;}

      // Stop at next class definition
      if (i > 0 && /^class\s+\w+/.test(line)) {break;}

      // Stop at unindented non-empty line
      if (i > 0 && line.trim() && !line.startsWith(' ') && !line.startsWith('\t')) {break;}

      bodyLines.push(line);

      if (bodyLines.length > 300) {break;}
    }

    return bodyLines.join('\n');
  }

  /**
   * Parse a ViewSet class.
   */
  private parseViewSet(
    name: string,
    bases: string,
    classBody: string,
    file: string,
    line: number
  ): DjangoViewSetInfo {
    const baseClass = this.extractPrimaryBase(bases, 'ViewSet');

    // Extract queryset
    const querysetMatch = QUERYSET_PATTERN.exec(classBody);
    const queryset = querysetMatch?.[1]?.trim() ?? null;

    // Extract model from queryset
    const modelClass = this.extractModelFromQueryset(queryset);

    // Extract serializer_class
    const serializerMatch = SERIALIZER_CLASS_PATTERN.exec(classBody);
    const serializerClass = serializerMatch?.[1] ?? null;

    // Extract permission_classes
    const permissionMatch = PERMISSION_CLASSES_ATTR_PATTERN.exec(classBody);
    const permissionClasses = permissionMatch?.[1]
      ? this.parseClassList(permissionMatch[1])
      : [];

    // Extract authentication_classes
    const authMatch = AUTH_CLASSES_PATTERN.exec(classBody);
    const authenticationClasses = authMatch?.[1]
      ? this.parseClassList(authMatch[1])
      : [];

    // Extract custom actions
    const customActions = this.extractCustomActions(classBody);

    return {
      name,
      baseClass,
      modelClass,
      serializerClass,
      permissionClasses,
      authenticationClasses,
      customActions,
      queryset,
      file,
      line,
    };
  }

  /**
   * Parse an APIView class.
   */
  private parseAPIView(
    name: string,
    bases: string,
    classBody: string,
    file: string,
    line: number
  ): DjangoAPIViewInfo {
    const baseClass = this.extractPrimaryBase(bases, 'APIView');

    // Extract serializer_class
    const serializerMatch = SERIALIZER_CLASS_PATTERN.exec(classBody);
    const serializerClass = serializerMatch?.[1] ?? null;

    // Extract permission_classes
    const permissionMatch = PERMISSION_CLASSES_ATTR_PATTERN.exec(classBody);
    const permissionClasses = permissionMatch?.[1]
      ? this.parseClassList(permissionMatch[1])
      : [];

    // Extract HTTP methods
    const methods = this.extractHTTPMethods(classBody);

    return {
      name,
      baseClass,
      methods,
      serializerClass,
      permissionClasses,
      file,
      line,
    };
  }

  /**
   * Extract the primary base class.
   */
  private extractPrimaryBase(bases: string, defaultBase: string): string {
    const parts = bases.split(',').map((b) => b.trim());
    for (const part of parts) {
      if (part.includes('ViewSet') || part.includes('APIView')) {
        return part.replace(/^(?:viewsets|views|generics)\./, '');
      }
    }
    return parts[0]?.replace(/^(?:viewsets|views|generics)\./, '') ?? defaultBase;
  }

  /**
   * Extract model class from queryset expression.
   */
  private extractModelFromQueryset(queryset: string | null): string | null {
    if (!queryset) {return null;}

    // Pattern: Model.objects.all() or Model.objects.filter(...)
    const match = queryset.match(/(\w+)\.objects/);
    return match?.[1] ?? null;
  }

  /**
   * Extract custom actions from ViewSet.
   */
  private extractCustomActions(classBody: string): DjangoActionInfo[] {
    const actions: DjangoActionInfo[] = [];

    ACTION_DECORATOR_PATTERN.lastIndex = 0;

    let match;
    while ((match = ACTION_DECORATOR_PATTERN.exec(classBody)) !== null) {
      const argsStr = match[1] ?? '';
      const line = this.getLineNumber(classBody, match.index);

      // Find the method name after the decorator
      const afterDecorator = classBody.substring(match.index + match[0].length);
      const methodMatch = afterDecorator.match(/\s*def\s+(\w+)\s*\(/);

      if (!methodMatch?.[1]) {continue;}

      const action = this.parseActionDecorator(methodMatch[1], argsStr, line);
      actions.push(action);
    }

    return actions;
  }

  /**
   * Parse @action decorator arguments.
   */
  private parseActionDecorator(
    methodName: string,
    argsStr: string,
    line: number
  ): DjangoActionInfo {
    // Parse methods
    const methodsMatch = argsStr.match(/methods\s*=\s*\[([^\]]*)\]/);
    const methods = methodsMatch?.[1]
      ? this.parseMethodsList(methodsMatch[1])
      : ['GET' as HttpMethod];

    // Parse detail
    const detailMatch = argsStr.match(/detail\s*=\s*(True|False)/);
    const detail = detailMatch?.[1] === 'True';

    // Parse url_path
    const urlPathMatch = argsStr.match(/url_path\s*=\s*['"]([^'"]+)['"]/);
    const urlPath = urlPathMatch?.[1] ?? null;

    // Parse url_name
    const urlNameMatch = argsStr.match(/url_name\s*=\s*['"]([^'"]+)['"]/);
    const urlName = urlNameMatch?.[1] ?? null;

    return {
      name: methodName,
      methods,
      detail,
      urlPath,
      urlName,
      line,
    };
  }

  /**
   * Extract HTTP methods from APIView class body.
   */
  private extractHTTPMethods(classBody: string): HttpMethod[] {
    const methods: HttpMethod[] = [];

    HTTP_METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = HTTP_METHOD_PATTERN.exec(classBody)) !== null) {
      const method = match[1]?.toUpperCase() as HttpMethod;
      if (method && !methods.includes(method)) {
        methods.push(method);
      }
    }

    return methods;
  }

  /**
   * Parse a list of HTTP methods from string.
   */
  private parseMethodsList(methodsStr: string): HttpMethod[] {
    const methods: HttpMethod[] = [];
    const parts = methodsStr.split(',');

    for (const part of parts) {
      const cleaned = part.trim().replace(/['"]/g, '').toUpperCase();
      if (cleaned && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(cleaned)) {
        methods.push(cleaned as HttpMethod);
      }
    }

    return methods.length > 0 ? methods : ['GET'];
  }

  /**
   * Parse a list of class names.
   */
  private parseClassList(classesStr: string): string[] {
    return classesStr
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  }

  /**
   * Extract list from decorator pattern.
   */
  private extractDecoratorList(content: string, pattern: RegExp): string[] {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (!match?.[1]) {return [];}
    return this.parseClassList(match[1]);
  }

  /**
   * Get line number from character offset.
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}
