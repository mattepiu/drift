/**
 * Laravel Exception Handler Extractor
 *
 * Extracts exception handler configurations from Laravel code.
 *
 * @module errors/laravel/extractors/exception-handler-extractor
 */

import type {
  ExceptionHandlerInfo,
  RenderMethodInfo,
  ReportMethodInfo,
  ReportableCallbackInfo,
  RenderableCallbackInfo,
  ExceptionHandlerExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Exception handler class
 */
const HANDLER_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+(?:Illuminate\\Foundation\\Exceptions\\)?ExceptionHandler\s*\{/g;

/**
 * $dontReport property
 */
const DONT_REPORT_PATTERN = /protected\s+\$dontReport\s*=\s*\[([\s\S]*?)\];/;

/**
 * $dontFlash property
 */
const DONT_FLASH_PATTERN = /protected\s+\$dontFlash\s*=\s*\[([\s\S]*?)\];/;

/**
 * render method with exception type check
 */
const RENDER_METHOD_PATTERN = /public\s+function\s+render\s*\([^)]*\)\s*(?::\s*[\w\\|]+)?\s*\{([\s\S]*?)\n\s*\}/;

/**
 * Exception type check in render
 */
const EXCEPTION_CHECK_PATTERN = /if\s*\(\s*\$\w+\s+instanceof\s+([A-Z][\w\\]+)\s*\)/g;

/**
 * report method
 */
const REPORT_METHOD_PATTERN = /public\s+function\s+report\s*\([^)]*\)\s*(?::\s*[\w\\|]+)?\s*\{([\s\S]*?)\n\s*\}/;

/**
 * $this->reportable() callback
 */
const REPORTABLE_PATTERN = /\$this->reportable\s*\(\s*function\s*\(\s*([A-Z][\w\\]+)\s+\$\w+\s*\)/g;

/**
 * $this->renderable() callback
 */
const RENDERABLE_PATTERN = /\$this->renderable\s*\(\s*function\s*\(\s*([A-Z][\w\\]+)\s+\$\w+/g;

/**
 * ->stop() chain
 */
const STOP_PATTERN = /->stop\s*\(\s*\)/;

/**
 * Response type detection
 */
const JSON_RESPONSE_PATTERN = /response\s*\(\s*\)\s*->json|Response::json|return\s+response\s*\(\s*\[/;
const VIEW_RESPONSE_PATTERN = /return\s+view\s*\(|View::make/;
const REDIRECT_RESPONSE_PATTERN = /return\s+redirect\s*\(|Redirect::/;

// ============================================================================
// Exception Handler Extractor
// ============================================================================

/**
 * Extracts Laravel exception handler configurations
 */
export class ExceptionHandlerExtractor {
  /**
   * Extract exception handler info from content
   */
  extract(content: string, file: string): ExceptionHandlerExtractionResult {
    const handlers = this.extractHandlers(content, file);
    const confidence = handlers.length > 0 ? 0.9 : 0;

    return {
      handlers,
      confidence,
    };
  }

  /**
   * Check if content contains exception handler
   */
  hasHandler(content: string): boolean {
    return (
      content.includes('extends ExceptionHandler') ||
      content.includes('Illuminate\\Foundation\\Exceptions\\ExceptionHandler')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract exception handlers
   */
  private extractHandlers(content: string, file: string): ExceptionHandlerInfo[] {
    const handlers: ExceptionHandlerInfo[] = [];
    HANDLER_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = HANDLER_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const line = this.getLineNumber(content, match.index);

      // Extract class body
      const classBody = this.extractClassBody(content, match.index + match[0].length);

      // Extract namespace
      const namespace = this.extractNamespace(content);

      // Extract properties
      const dontReport = this.extractArrayProperty(classBody, DONT_REPORT_PATTERN);
      const dontFlash = this.extractArrayProperty(classBody, DONT_FLASH_PATTERN);

      // Extract methods
      const renderMethods = this.extractRenderMethods(classBody, line);
      const reportMethods = this.extractReportMethods(classBody, line);
      const reportableCallbacks = this.extractReportableCallbacks(classBody, line);
      const renderableCallbacks = this.extractRenderableCallbacks(classBody, line);

      handlers.push({
        name,
        fqn: namespace ? `${namespace}\\${name}` : name,
        namespace,
        dontReport,
        dontFlash,
        renderMethods,
        reportMethods,
        reportableCallbacks,
        renderableCallbacks,
        file,
        line,
      });
    }

    return handlers;
  }

  /**
   * Extract render methods
   */
  private extractRenderMethods(classBody: string, classLine: number): RenderMethodInfo[] {
    const methods: RenderMethodInfo[] = [];

    const renderMatch = classBody.match(RENDER_METHOD_PATTERN);
    if (renderMatch?.[1]) {
      const methodBody = renderMatch[1];
      const methodLine = classLine + this.getLineNumber(classBody.substring(0, classBody.indexOf('function render')), 0);

      // Find exception type checks
      EXCEPTION_CHECK_PATTERN.lastIndex = 0;
      let checkMatch;
      while ((checkMatch = EXCEPTION_CHECK_PATTERN.exec(methodBody)) !== null) {
        const exceptionType = checkMatch[1] || '';
        const checkLine = methodLine + this.getLineNumber(methodBody.substring(0, checkMatch.index), 0);

        // Determine response type
        const afterCheck = methodBody.substring(checkMatch.index, checkMatch.index + 500);
        let responseType: RenderMethodInfo['responseType'] = 'response';

        if (JSON_RESPONSE_PATTERN.test(afterCheck)) {
          responseType = 'json';
        } else if (VIEW_RESPONSE_PATTERN.test(afterCheck)) {
          responseType = 'view';
        } else if (REDIRECT_RESPONSE_PATTERN.test(afterCheck)) {
          responseType = 'redirect';
        }

        methods.push({
          exceptionType,
          responseType,
          line: checkLine,
        });
      }
    }

    return methods;
  }

  /**
   * Extract report methods
   */
  private extractReportMethods(classBody: string, classLine: number): ReportMethodInfo[] {
    const methods: ReportMethodInfo[] = [];

    const reportMatch = classBody.match(REPORT_METHOD_PATTERN);
    if (reportMatch?.[1]) {
      const methodBody = reportMatch[1];
      const methodLine = classLine + this.getLineNumber(classBody.substring(0, classBody.indexOf('function report')), 0);

      // Find exception type checks
      EXCEPTION_CHECK_PATTERN.lastIndex = 0;
      let checkMatch;
      while ((checkMatch = EXCEPTION_CHECK_PATTERN.exec(methodBody)) !== null) {
        const exceptionType = checkMatch[1] || '';
        const checkLine = methodLine + this.getLineNumber(methodBody.substring(0, checkMatch.index), 0);

        // Try to find logging channel
        const afterCheck = methodBody.substring(checkMatch.index, checkMatch.index + 300);
        const channelMatch = afterCheck.match(/Log::channel\s*\(\s*['"](\w+)['"]\s*\)/);
        const channel = channelMatch ? channelMatch[1] || null : null;

        methods.push({
          exceptionType,
          channel,
          line: checkLine,
        });
      }
    }

    return methods;
  }

  /**
   * Extract reportable callbacks
   */
  private extractReportableCallbacks(classBody: string, classLine: number): ReportableCallbackInfo[] {
    const callbacks: ReportableCallbackInfo[] = [];
    REPORTABLE_PATTERN.lastIndex = 0;

    let match;
    while ((match = REPORTABLE_PATTERN.exec(classBody)) !== null) {
      const exceptionType = match[1] || '';
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      // Check for ->stop()
      const afterCallback = classBody.substring(match.index, match.index + 500);
      const stopsPropagation = STOP_PATTERN.test(afterCallback);

      callbacks.push({
        exceptionType,
        stopsPropagation,
        line,
      });
    }

    return callbacks;
  }

  /**
   * Extract renderable callbacks
   */
  private extractRenderableCallbacks(classBody: string, classLine: number): RenderableCallbackInfo[] {
    const callbacks: RenderableCallbackInfo[] = [];
    RENDERABLE_PATTERN.lastIndex = 0;

    let match;
    while ((match = RENDERABLE_PATTERN.exec(classBody)) !== null) {
      const exceptionType = match[1] || '';
      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);

      // Determine response type
      const afterCallback = classBody.substring(match.index, match.index + 500);
      let responseType = 'response';

      if (JSON_RESPONSE_PATTERN.test(afterCallback)) {
        responseType = 'json';
      } else if (VIEW_RESPONSE_PATTERN.test(afterCallback)) {
        responseType = 'view';
      } else if (REDIRECT_RESPONSE_PATTERN.test(afterCallback)) {
        responseType = 'redirect';
      }

      callbacks.push({
        exceptionType,
        responseType,
        line,
      });
    }

    return callbacks;
  }

  /**
   * Extract array property
   */
  private extractArrayProperty(content: string, pattern: RegExp): string[] {
    const match = content.match(pattern);
    if (!match?.[1]) {return [];}

    return match[1]
      .match(/([A-Z][\w\\]+)::class/g)
      ?.map(m => m.replace('::class', '')) || [];
  }

  /**
   * Extract namespace
   */
  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
  }

  /**
   * Extract class body
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

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new exception handler extractor
 */
export function createExceptionHandlerExtractor(): ExceptionHandlerExtractor {
  return new ExceptionHandlerExtractor();
}
