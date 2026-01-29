/**
 * RequestMiddleware - Request/response interceptors
 * 
 * Single responsibility: Add retry, timeout, and logging to LSP requests.
 */

import { CONNECTION_CONFIG } from './connection-config.js';

import type { Logger } from '../infrastructure/index.js';
import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * Request options
 */
export interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Default request options
 */
const DEFAULT_OPTIONS: Required<RequestOptions> = {
  timeout: CONNECTION_CONFIG.requestTimeout,
  retries: 2,
  retryDelay: 500,
};

/**
 * Middleware for LSP requests with retry and timeout
 */
export class RequestMiddleware {
  constructor(
    private readonly client: LanguageClient,
    private readonly logger: Logger
  ) {}

  /**
   * Send a request with retry and timeout
   */
  async request<T>(
    method: string,
    params?: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        const result = await this.sendWithTimeout<T>(method, params, opts.timeout);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < opts.retries) {
          this.logger.warn(
            `Request ${method} failed (attempt ${String(attempt + 1)}/${String(opts.retries + 1)}): ${lastError.message}`
          );
          await this.delay(opts.retryDelay * (attempt + 1));
        }
      }
    }

    this.logger.error(`Request ${method} failed after ${String(opts.retries + 1)} attempts`);
    throw lastError;
  }

  /**
   * Send a notification (fire and forget)
   */
  notify(method: string, params?: unknown): void {
    try {
      void this.client.sendNotification(method, params);
    } catch (error) {
      this.logger.error(`Notification ${method} failed:`, error);
    }
  }

  private async sendWithTimeout<T>(
    method: string,
    params: unknown,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request ${method} timed out after ${String(timeout)}ms`));
      }, timeout);

      this.client
        .sendRequest<T>(method, params)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function for creating request middleware
 */
export function createRequestMiddleware(
  client: LanguageClient,
  logger: Logger
): RequestMiddleware {
  return new RequestMiddleware(client, logger);
}
