/**
 * Time Utilities
 */

/**
 * Get current ISO timestamp
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Calculate days between two dates
 */
export function daysBetween(a: string | Date, b: string | Date): number {
  const dateA = typeof a === 'string' ? new Date(a) : a;
  const dateB = typeof b === 'string' ? new Date(b) : b;
  const diff = Math.abs(dateB.getTime() - dateA.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days since a date
 */
export function daysSince(date: string | Date): number {
  return daysBetween(date, new Date());
}

/**
 * Check if a date is in the past
 */
export function isPast(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d < new Date();
}

/**
 * Add days to a date
 */
export function addDays(date: string | Date, days: number): string {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Subtract days from a date
 */
export function subtractDays(date: string | Date, days: number): string {
  return addDays(date, -days);
}
