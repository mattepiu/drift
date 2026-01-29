/**
 * Configuration validator
 * 
 * Single responsibility: Validate configuration values.
 */

import type { DriftConfig, Severity, AIProvider } from '../types/index.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Valid severity values
 */
const VALID_SEVERITIES: Severity[] = ['error', 'warning', 'info', 'hint'];

/**
 * Valid AI providers
 */
const VALID_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'ollama', 'none'];

/**
 * Valid trace levels
 */
const VALID_TRACE_LEVELS = ['off', 'messages', 'verbose'] as const;

/**
 * Validate configuration
 */
export function validateConfig(config: Partial<DriftConfig>): ValidationResult {
  const errors: string[] = [];

  // Validate server config
  if (config.server?.trace !== undefined && !VALID_TRACE_LEVELS.includes(config.server.trace)) {
    errors.push(`Invalid trace level: ${config.server.trace}`);
  }

  // Validate scan config
  if (config.scan !== undefined) {
    if (typeof config.scan.debounceMs === 'number' && config.scan.debounceMs < 0) {
      errors.push('debounceMs must be non-negative');
    }
    if (config.scan.excludePatterns !== undefined && !Array.isArray(config.scan.excludePatterns)) {
      errors.push('excludePatterns must be an array');
    }
  }

  // Validate display config
  if (config.display?.severityFilter !== undefined) {
    for (const severity of config.display.severityFilter) {
      if (!VALID_SEVERITIES.includes(severity)) {
        errors.push(`Invalid severity: ${severity}`);
      }
    }
  }

  // Validate AI config
  if (config.ai !== undefined) {
    if (config.ai.provider !== undefined && !VALID_PROVIDERS.includes(config.ai.provider)) {
      errors.push(`Invalid AI provider: ${config.ai.provider}`);
    }
    if (config.ai.enabled === true && config.ai.provider === 'none') {
      errors.push('AI enabled but provider is "none"');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single config value
 */
export function validateConfigValue(
  section: keyof DriftConfig,
  key: string,
  value: unknown
): ValidationResult {
  const errors: string[] = [];

  switch (section) {
    case 'scan':
      if (key === 'debounceMs' && (typeof value !== 'number' || value < 0)) {
        errors.push('debounceMs must be a non-negative number');
      }
      break;
    case 'display':
      if (key === 'severityFilter' && Array.isArray(value)) {
        for (const v of value) {
          if (!VALID_SEVERITIES.includes(v as Severity)) {
            errors.push(`Invalid severity: ${String(v)}`);
          }
        }
      }
      break;
    case 'ai':
      if (key === 'provider' && !VALID_PROVIDERS.includes(value as AIProvider)) {
        errors.push(`Invalid AI provider: ${String(value)}`);
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
