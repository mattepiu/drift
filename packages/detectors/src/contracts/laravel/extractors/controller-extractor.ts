/**
 * Laravel Controller Extractor
 *
 * Extracts controller definitions from Laravel controller files.
 * Handles resource controllers, API controllers, and invokable controllers.
 *
 * @module contracts/laravel/extractors/controller-extractor
 */

import { ClassExtractor } from '../../../php/class-extractor.js';

import type { PhpClassInfo, PhpMethodInfo, PhpParameterInfo } from '../../../php/types.js';
import type {
  LaravelControllerInfo,
  ControllerAction,
  ControllerMiddleware,
  ActionParameter,
  ModelBinding,
  LaravelHttpMethod,
} from '../types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Standard resource controller actions
 */
const RESOURCE_ACTIONS = ['index', 'create', 'store', 'show', 'edit', 'update', 'destroy'];

/**
 * API resource controller actions
 */
const API_RESOURCE_ACTIONS = ['index', 'store', 'show', 'update', 'destroy'];

/**
 * HTTP method mapping for resource actions
 */
const ACTION_HTTP_METHODS: Record<string, LaravelHttpMethod[]> = {
  index: ['GET'],
  create: ['GET'],
  store: ['POST'],
  show: ['GET'],
  edit: ['GET'],
  update: ['PUT', 'PATCH'],
  destroy: ['DELETE'],
};

/**
 * Common request classes
 */
const REQUEST_CLASSES = [
  'Request',
  'FormRequest',
  'Illuminate\\Http\\Request',
];

// ============================================================================
// Controller Extractor
// ============================================================================

/**
 * Extracts Laravel controller definitions
 */
export class ControllerExtractor {
  private readonly classExtractor: ClassExtractor;

  constructor() {
    this.classExtractor = new ClassExtractor();
  }

  /**
   * Extract all controllers from content
   *
   * @param content - PHP source code
   * @param file - File path
   * @returns Array of extracted controllers
   */
  extract(content: string, file: string): LaravelControllerInfo[] {
    const controllers: LaravelControllerInfo[] = [];

    // Extract namespace
    const namespace = this.extractNamespace(content);

    // Extract classes
    const classResult = this.classExtractor.extract(content, file, namespace);

    for (const classInfo of classResult.items) {
      if (this.isController(classInfo)) {
        const controller = this.parseController(classInfo, content, file);
        controllers.push(controller);
      }
    }

    return controllers;
  }

  /**
   * Check if content contains Laravel controllers
   */
  hasControllers(content: string): boolean {
    return (
      content.includes('extends Controller') ||
      content.includes('use Illuminate\\Routing\\Controller') ||
      content.includes('use App\\Http\\Controllers\\Controller')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Check if a class is a controller
   */
  private isController(classInfo: PhpClassInfo): boolean {
    // Check if extends Controller or has Controller in name
    if (classInfo.extends?.includes('Controller')) {return true;}
    if (classInfo.name.endsWith('Controller')) {return true;}
    return false;
  }

  /**
   * Parse a controller class
   */
  private parseController(
    classInfo: PhpClassInfo,
    content: string,
    file: string
  ): LaravelControllerInfo {
    // Extract middleware from constructor
    const middleware = this.extractMiddleware(classInfo, content);

    // Extract actions
    const actions = this.extractActions(classInfo);

    // Determine controller type
    const isResource = this.isResourceController(actions);
    const isApiResource = this.isApiResourceController(actions);
    const isInvokable = this.isInvokableController(classInfo);

    return {
      name: classInfo.name,
      fqn: classInfo.fqn,
      namespace: classInfo.namespace,
      extends: classInfo.extends,
      middleware,
      actions,
      isResource,
      isApiResource,
      isInvokable,
      file,
      line: classInfo.line,
    };
  }

  /**
   * Extract middleware from controller
   */
  private extractMiddleware(classInfo: PhpClassInfo, _content: string): ControllerMiddleware[] {
    const middleware: ControllerMiddleware[] = [];

    // Look for $this->middleware() calls in constructor
    const constructorMethod = classInfo.methods.find(m => m.name === '__construct');
    if (constructorMethod?.body) {
      const middlewareMatches = constructorMethod.body.matchAll(
        /\$this->middleware\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*\[([^\]]*)\])?\s*\)/g
      );

      for (const match of middlewareMatches) {
        const name = match[1] || '';
        const options = match[2] || '';

        const only = this.extractMiddlewareOption(options, 'only');
        const except = this.extractMiddlewareOption(options, 'except');

        middleware.push({
          name,
          only,
          except,
          line: constructorMethod.line,
        });
      }
    }

    return middleware;
  }

  /**
   * Extract middleware option (only/except)
   */
  private extractMiddlewareOption(options: string, key: string): string[] {
    const pattern = new RegExp(`['"]${key}['"]\\s*=>\\s*\\[([^\\]]+)\\]`);
    const match = options.match(pattern);
    if (match) {
      return match[1]?.split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean) || [];
    }
    return [];
  }

  /**
   * Extract controller actions
   */
  private extractActions(classInfo: PhpClassInfo): ControllerAction[] {
    const actions: ControllerAction[] = [];

    for (const method of classInfo.methods) {
      // Skip non-public methods and magic methods
      if (method.visibility !== 'public') {continue;}
      if (method.name.startsWith('__')) {continue;}

      const action = this.parseAction(method);
      actions.push(action);
    }

    return actions;
  }

  /**
   * Parse a controller action
   */
  private parseAction(method: PhpMethodInfo): ControllerAction {
    // Determine HTTP methods based on action name
    const httpMethods = ACTION_HTTP_METHODS[method.name] || this.inferHttpMethods(method);

    // Extract form request
    const formRequest = this.extractFormRequest(method);

    // Extract parameters
    const parameters = this.extractActionParameters(method);

    // Extract model bindings
    const modelBindings = this.extractModelBindings(method);

    return {
      name: method.name,
      httpMethods,
      formRequest,
      returnType: method.returnType?.raw || null,
      parameters,
      modelBindings,
      line: method.line,
    };
  }

  /**
   * Infer HTTP methods from action name/signature
   */
  private inferHttpMethods(method: PhpMethodInfo): LaravelHttpMethod[] {
    const name = method.name.toLowerCase();

    // Common naming patterns
    if (name.startsWith('get') || name.startsWith('list') || name.startsWith('show') || name.startsWith('fetch')) {
      return ['GET'];
    }
    if (name.startsWith('post') || name.startsWith('create') || name.startsWith('store') || name.startsWith('add')) {
      return ['POST'];
    }
    if (name.startsWith('put') || name.startsWith('update') || name.startsWith('edit')) {
      return ['PUT', 'PATCH'];
    }
    if (name.startsWith('delete') || name.startsWith('destroy') || name.startsWith('remove')) {
      return ['DELETE'];
    }

    // Default to GET
    return ['GET'];
  }

  /**
   * Extract form request from action parameters
   */
  private extractFormRequest(method: PhpMethodInfo): string | null {
    for (const param of method.parameters) {
      if (param.type) {
        const typeName = param.type.types[0] || '';
        // Check if it's a form request (ends with Request but not just Request)
        if (typeName.endsWith('Request') && typeName !== 'Request' && !typeName.includes('\\Http\\Request')) {
          return typeName;
        }
      }
    }
    return null;
  }

  /**
   * Extract action parameters
   */
  private extractActionParameters(method: PhpMethodInfo): ActionParameter[] {
    return method.parameters.map(param => ({
      name: param.name,
      type: param.type?.raw || null,
      isRequest: this.isRequestParameter(param),
      isModelBinding: this.isModelBindingParameter(param),
    }));
  }

  /**
   * Check if parameter is a request object
   */
  private isRequestParameter(param: PhpParameterInfo): boolean {
    if (!param.type) {return false;}
    const typeName = param.type.types[0] || '';
    return REQUEST_CLASSES.some(rc => typeName.includes(rc)) || typeName.endsWith('Request');
  }

  /**
   * Check if parameter is a model binding
   */
  private isModelBindingParameter(param: PhpParameterInfo): boolean {
    if (!param.type) {return false;}
    const typeName = param.type.types[0] || '';
    // Model bindings are typically Eloquent models (not Request, not primitive)
    return (
      !this.isRequestParameter(param) &&
      !param.type.isBuiltin &&
      /^[A-Z]/.test(typeName)
    );
  }

  /**
   * Extract model bindings from action
   */
  private extractModelBindings(method: PhpMethodInfo): ModelBinding[] {
    const bindings: ModelBinding[] = [];

    for (const param of method.parameters) {
      if (this.isModelBindingParameter(param) && param.type) {
        bindings.push({
          parameter: param.name,
          model: param.type.types[0] || '',
          key: null, // Would need route definition to determine custom key
        });
      }
    }

    return bindings;
  }

  /**
   * Check if controller is a resource controller
   */
  private isResourceController(actions: ControllerAction[]): boolean {
    const actionNames = actions.map(a => a.name);
    const resourceCount = RESOURCE_ACTIONS.filter(a => actionNames.includes(a)).length;
    return resourceCount >= 5; // At least 5 of 7 resource actions
  }

  /**
   * Check if controller is an API resource controller
   */
  private isApiResourceController(actions: ControllerAction[]): boolean {
    const actionNames = actions.map(a => a.name);
    // Has API resource actions but NOT create/edit
    const hasApiActions = API_RESOURCE_ACTIONS.every(a => actionNames.includes(a));
    const hasFormActions = actionNames.includes('create') || actionNames.includes('edit');
    return hasApiActions && !hasFormActions;
  }

  /**
   * Check if controller is invokable
   */
  private isInvokableController(classInfo: PhpClassInfo): boolean {
    return classInfo.methods.some(m => m.name === '__invoke');
  }

  /**
   * Extract namespace from content
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
  }
}

/**
 * Create a new controller extractor instance
 */
export function createControllerExtractor(): ControllerExtractor {
  return new ControllerExtractor();
}
