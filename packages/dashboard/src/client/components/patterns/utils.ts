/**
 * Pattern Tab Utilities
 * 
 * Data transformation, aggregation, and helper functions.
 */

import { CATEGORY_ORDER, CATEGORY_CONFIG, CONFIDENCE_THRESHOLDS } from './constants';

import type { 
  CategoryGroup, 
  DetectorGroup, 
  PatternMetrics, 
  PatternStatistics,
  SortConfig,
  ReviewablePattern,
} from './types';
import type { Pattern, PatternCategory, PatternStatus } from '../../types';

// ============================================================================
// Metrics Calculation
// ============================================================================

export function calculateMetrics(patterns: Pattern[]): PatternMetrics {
  if (patterns.length === 0) {
    return {
      totalLocations: 0,
      totalOutliers: 0,
      avgConfidence: 0,
      minConfidence: 0,
      maxConfidence: 0,
      complianceRate: 0,
    };
  }

  const totalLocations = patterns.reduce((sum, p) => sum + p.locationCount, 0);
  const totalOutliers = patterns.reduce((sum, p) => sum + p.outlierCount, 0);
  const confidences = patterns.map(p => p.confidence.score);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const total = totalLocations + totalOutliers;

  return {
    totalLocations,
    totalOutliers,
    avgConfidence,
    minConfidence: Math.min(...confidences),
    maxConfidence: Math.max(...confidences),
    complianceRate: total > 0 ? totalLocations / total : 1,
  };
}

export function calculateStatistics(patterns: Pattern[]): PatternStatistics {
  const byStatus: Record<PatternStatus, number> = {
    discovered: 0,
    approved: 0,
    ignored: 0,
  };

  const byCategory: Record<PatternCategory, number> = {} as Record<PatternCategory, number>;
  const byConfidenceLevel = { high: 0, medium: 0, low: 0, uncertain: 0 };

  let totalOutliers = 0;
  let totalConfidence = 0;
  let totalLocations = 0;

  for (const pattern of patterns) {
    byStatus[pattern.status]++;
    byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
    totalOutliers += pattern.outlierCount;
    totalConfidence += pattern.confidence.score;
    totalLocations += pattern.locationCount;

    if (pattern.confidence.score >= CONFIDENCE_THRESHOLDS.HIGH) {
      byConfidenceLevel.high++;
    } else if (pattern.confidence.score >= CONFIDENCE_THRESHOLDS.MEDIUM) {
      byConfidenceLevel.medium++;
    } else if (pattern.confidence.score >= CONFIDENCE_THRESHOLDS.LOW) {
      byConfidenceLevel.low++;
    } else {
      byConfidenceLevel.uncertain++;
    }
  }

  const discovered = patterns.filter(p => p.status === 'discovered');
  const needsReview = discovered.filter(p => p.confidence.score < CONFIDENCE_THRESHOLDS.HIGH).length;
  const readyForApproval = discovered.filter(p => p.confidence.score >= CONFIDENCE_THRESHOLDS.HIGH).length;
  const total = totalLocations + totalOutliers;

  return {
    total: patterns.length,
    byStatus,
    byCategory,
    byConfidenceLevel,
    needsReview,
    readyForApproval,
    totalOutliers,
    avgConfidence: patterns.length > 0 ? totalConfidence / patterns.length : 0,
    complianceRate: total > 0 ? totalLocations / total : 1,
  };
}

// ============================================================================
// Pattern Grouping
// ============================================================================

function extractDetectorName(patternName: string): string {
  return patternName
    .replace(/ Detector$/, '')
    .replace(/ Pattern$/, '')
    .trim();
}

function getDominantStatus(statuses: Set<PatternStatus>): PatternStatus {
  if (statuses.has('approved')) {return 'approved';}
  if (statuses.has('ignored')) {return 'ignored';}
  return 'discovered';
}

export function groupPatternsByCategory(patterns: Pattern[]): CategoryGroup[] {
  // Group by category -> detector name
  const categoryMap = new Map<PatternCategory, Map<string, Pattern[]>>();

  for (const pattern of patterns) {
    const category = pattern.category;
    if (!categoryMap.has(category)) {
      categoryMap.set(category, new Map());
    }

    const detectorMap = categoryMap.get(category)!;
    const detectorName = extractDetectorName(pattern.name);

    if (!detectorMap.has(detectorName)) {
      detectorMap.set(detectorName, []);
    }
    detectorMap.get(detectorName)!.push(pattern);
  }

  // Convert to sorted array
  const result: CategoryGroup[] = [];

  for (const category of CATEGORY_ORDER) {
    const detectorMap = categoryMap.get(category);
    if (!detectorMap || detectorMap.size === 0) {continue;}

    const config = CATEGORY_CONFIG[category];
    const detectors: DetectorGroup[] = [];

    for (const [detectorName, pats] of detectorMap) {
      const metrics = calculateMetrics(pats);
      const statuses = new Set(pats.map(p => p.status));

      detectors.push({
        id: `${category}-${detectorName}`,
        detectorName,
        category,
        patterns: pats,
        metrics,
        statuses,
        dominantStatus: getDominantStatus(statuses),
      });
    }

    // Sort detectors by location count (most common first)
    detectors.sort((a, b) => b.metrics.totalLocations - a.metrics.totalLocations);

    const categoryMetrics = calculateMetrics(
      detectors.flatMap(d => d.patterns)
    );

    result.push({
      category,
      label: config.label,
      description: config.description,
      icon: config.icon,
      detectors,
      metrics: categoryMetrics,
      patternCount: detectors.reduce((sum, d) => sum + d.patterns.length, 0),
    });
  }

  return result;
}

// ============================================================================
// Sorting
// ============================================================================

export function sortPatterns(patterns: Pattern[], config: SortConfig): Pattern[] {
  const sorted = [...patterns];
  const multiplier = config.direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (config.field) {
      case 'name':
        return multiplier * a.name.localeCompare(b.name);
      case 'confidence':
        return multiplier * (a.confidence.score - b.confidence.score);
      case 'locations':
        return multiplier * (a.locationCount - b.locationCount);
      case 'outliers':
        return multiplier * (a.outlierCount - b.outlierCount);
      case 'status':
        return multiplier * a.status.localeCompare(b.status);
      case 'category':
        return multiplier * a.category.localeCompare(b.category);
      default:
        return 0;
    }
  });

  return sorted;
}

// ============================================================================
// Review Helpers
// ============================================================================

export function getReviewablePatterns(
  patterns: Pattern[],
  type: 'quick' | 'needs-review'
): ReviewablePattern[] {
  const threshold = CONFIDENCE_THRESHOLDS.HIGH;

  const filtered = patterns.filter(p => {
    if (p.status !== 'discovered') {return false;}
    return type === 'quick' 
      ? p.confidence.score >= threshold
      : p.confidence.score < threshold;
  });

  return filtered.map(p => ({
    ...p,
    reviewPriority: calculateReviewPriority(p, type),
    reviewReason: getReviewReason(p, type),
  })).sort((a, b) => b.reviewPriority - a.reviewPriority);
}

function calculateReviewPriority(pattern: Pattern, type: 'quick' | 'needs-review'): number {
  if (type === 'quick') {
    // Higher confidence = higher priority for quick approval
    return pattern.confidence.score * 100 + pattern.locationCount;
  }
  // More outliers + lower confidence = higher priority for review
  return pattern.outlierCount * 10 + (1 - pattern.confidence.score) * 100;
}

function getReviewReason(pattern: Pattern, type: 'quick' | 'needs-review'): string {
  if (type === 'quick') {
    return `${Math.round(pattern.confidence.score * 100)}% confidence with ${pattern.locationCount} consistent locations`;
  }
  
  const reasons: string[] = [];
  if (pattern.confidence.score < CONFIDENCE_THRESHOLDS.MEDIUM) {
    reasons.push('low confidence');
  }
  if (pattern.outlierCount > 0) {
    reasons.push(`${pattern.outlierCount} outliers`);
  }
  return reasons.length > 0 ? reasons.join(', ') : 'needs manual verification';
}

// ============================================================================
// Confidence Helpers
// ============================================================================

export function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' | 'uncertain' {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) {return 'high';}
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) {return 'medium';}
  if (score >= CONFIDENCE_THRESHOLDS.LOW) {return 'low';}
  return 'uncertain';
}

export function getConfidenceColor(score: number): string {
  const level = getConfidenceLevel(score);
  switch (level) {
    case 'high': return 'text-status-approved';
    case 'medium': return 'text-severity-warning';
    case 'low': return 'text-orange-400';
    case 'uncertain': return 'text-severity-error';
  }
}

// ============================================================================
// Format Helpers
// ============================================================================

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatCompactNumber(value: number): string {
  if (value >= 1000000) {return `${(value / 1000000).toFixed(1)}M`;}
  if (value >= 1000) {return `${(value / 1000).toFixed(1)}K`;}
  return value.toString();
}

export function truncatePath(path: string, maxLength = 50): string {
  if (path.length <= maxLength) {return path;}
  const parts = path.split('/');
  const filename = parts.pop() || '';
  if (filename.length >= maxLength - 3) {
    return '...' + filename.slice(-(maxLength - 3));
  }
  return '.../' + filename;
}
