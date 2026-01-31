/**
 * Sensitive Patterns
 * 
 * Patterns for detecting sensitive data.
 */

/**
 * Patterns for detecting PII
 */
export const PII_PATTERNS = [
  // Email
  { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  // Phone numbers
  { name: 'phone', pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]' },
  // SSN
  { name: 'ssn', pattern: /\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/g, replacement: '[SSN]' },
  // Credit card
  { name: 'credit_card', pattern: /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/g, replacement: '[CREDIT_CARD]' },
  // IP addresses
  { name: 'ip', pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, replacement: '[IP_ADDRESS]' },
];

/**
 * Patterns for detecting secrets
 */
export const SECRET_PATTERNS = [
  // API keys
  { name: 'api_key', pattern: /(?:api[_-]?key|apikey)[=:\s]+['"]?([a-zA-Z0-9_-]{20,})['"]?/gi, replacement: '[API_KEY]' },
  // AWS keys
  { name: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[AWS_KEY]' },
  // JWT tokens
  { name: 'jwt', pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, replacement: '[JWT_TOKEN]' },
  // Private keys
  { name: 'private_key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, replacement: '[PRIVATE_KEY]' },
  // Passwords in strings
  { name: 'password', pattern: /(?:password|passwd|pwd)[=:\s]+['"]?([^'"\s]{8,})['"]?/gi, replacement: '[PASSWORD]' },
];

/**
 * All sensitive patterns
 */
export const ALL_PATTERNS = [...PII_PATTERNS, ...SECRET_PATTERNS];
