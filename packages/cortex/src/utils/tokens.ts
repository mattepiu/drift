/**
 * Token Estimation Utilities
 * 
 * Rough token estimation for budget management.
 */

/**
 * Estimate tokens for a string
 * Rough approximation: ~4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for a JSON object
 */
export function estimateObjectTokens(obj: unknown): number {
  const json = JSON.stringify(obj);
  return estimateTokens(json);
}

/**
 * Check if content fits within a token budget
 */
export function fitsInBudget(text: string, budget: number): boolean {
  return estimateTokens(text) <= budget;
}

/**
 * Truncate text to fit within a token budget
 */
export function truncateToFit(text: string, budget: number): string {
  const maxChars = budget * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}
