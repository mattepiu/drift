/**
 * Violations Tab Utilities
 * 
 * Data transformation, aggregation, and helper functions.
 */

import { SEVERITY_ORDER, SEVERITY_CONFIG, CATEGORY_CONFIG, CATEGORY_ORDER, DISPLAY_LIMITS } from './constants';

import type { 
  ViolationMetrics, 
  ViolationStatistics, 
  FileGroup, 
  PatternGroup,
  CategoryGroup,
  SeverityGroup,
  SortConfig,
} from './types';
import type { Violation, Severity } from '../../types';

// ============================================================================
// Metrics Calculation
// ============================================================================

export function calculateMetrics(violations: Violation[]): ViolationMetrics {
  const bySeverity: Record<Severity, number> = {
    error: 0,
    warning: 0,
    info: 0,
    hint: 0,
  };

  const byPattern: Record<string, number> = {};
  const byFile: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const v of violations) {
    bySeverity[v.severity]++;
    byPattern[v.patternId] = (byPattern[v.patternId] || 0) + 1;
    byFile[v.file] = (byFile[v.file] || 0) + 1;
    
    const category = extractCategory(v.patternId, v.patternName);
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  return {
    total: violations.length,
    bySeverity,
    byPattern,
    byFile,
    byCategory,
    criticalCount: bySeverity.error + bySeverity.warning,
  };
}

// ============================================================================
// Category Extraction
// ============================================================================

export function extractCategory(patternId: string, patternName?: string): string {
  // First try to extract from patternName if available (more reliable)
  // Pattern names look like: "HTTP Methods Detector", "Barrel Exports Detector", "Typography Detector"
  if (patternName) {
    const lowerName = patternName.toLowerCase();
    
    const nameToCategory: Record<string, string> = {
      // Security
      'sql injection': 'security',
      'xss': 'security',
      'csrf': 'security',
      'credential': 'security',
      'secret': 'security',
      'sanitiz': 'security',
      'security': 'security',
      
      // Auth
      'auth': 'auth',
      'rbac': 'auth',
      'permission': 'auth',
      'role': 'auth',
      'session': 'auth',
      'token': 'auth',
      'jwt': 'auth',
      'audit': 'auth',
      
      // API
      'http method': 'api',
      'route': 'api',
      'endpoint': 'api',
      'response envelope': 'api',
      'rest': 'api',
      'api': 'api',
      
      // Data Access
      'database': 'data-access',
      'query': 'data-access',
      'repository': 'data-access',
      'data access': 'data-access',
      
      // Errors
      'error': 'errors',
      'exception': 'errors',
      
      // Structural
      'barrel': 'structural',
      'import': 'structural',
      'export': 'structural',
      'file naming': 'structural',
      'directory': 'structural',
      'module': 'structural',
      'package': 'structural',
      'circular': 'structural',
      
      // Components
      'component': 'components',
      'composition': 'components',
      'state pattern': 'components',
      'ref forward': 'components',
      'hook': 'components',
      'prop': 'components',
      
      // Styling
      'typography': 'styling',
      'color': 'styling',
      'spacing': 'styling',
      'z-index': 'styling',
      'responsive': 'styling',
      'tailwind': 'styling',
      'css': 'styling',
      'style': 'styling',
      'class naming': 'styling',
      
      // Performance
      'performance': 'performance',
      'lazy': 'performance',
      'memo': 'performance',
      'cache': 'performance',
    };
    
    for (const [keyword, category] of Object.entries(nameToCategory)) {
      if (lowerName.includes(keyword)) {
        return category;
      }
    }
  }
  
  // Fall back to patternId parsing if patternName didn't match
  // Pattern IDs can follow multiple formats:
  // - Slash-based: api/route-structure/restful, styling/typography/tailwind
  // - Dash-based: component-structure-single-file, file-naming-kebab-case
  // - Hash-based: f9c0bd869f7ef730 (won't match anything useful)
  
  const lowerPatternId = patternId.toLowerCase();
  
  // First, try to extract from slash-based format (most reliable)
  if (lowerPatternId.includes('/')) {
    const slashParts = lowerPatternId.split('/');
    const firstPart = slashParts[0];
    
    // Direct category matches from first slash segment
    const slashCategoryMap: Record<string, string> = {
      'api': 'api',
      'auth': 'auth',
      'security': 'security',
      'styling': 'styling',
      'structural': 'structural',
      'components': 'components',
      'component': 'components',
      'data': 'data-access',
      'database': 'data-access',
      'error': 'errors',
      'errors': 'errors',
      'performance': 'performance',
      'testing': 'testing',
      'documentation': 'documentation',
    };
    
    if (slashCategoryMap[firstPart]) {
      return slashCategoryMap[firstPart];
    }
  }
  
  // Fall back to dash-based parsing
  const parts = lowerPatternId.replace(/\//g, '-').split('-');
  
  // Map common prefixes to categories
  const categoryMap: Record<string, string> = {
    // Security
    'security': 'security',
    'xss': 'security',
    'injection': 'security',
    'csrf': 'security',
    'sanitize': 'security',
    'validate': 'security',
    'credential': 'security',
    'secret': 'security',
    
    // Auth
    'auth': 'auth',
    'authentication': 'auth',
    'authorization': 'auth',
    'rbac': 'auth',
    'permission': 'auth',
    'role': 'auth',
    'session': 'auth',
    'token': 'auth',
    'jwt': 'auth',
    'audit': 'auth',
    
    // API
    'api': 'api',
    'endpoint': 'api',
    'rest': 'api',
    'route': 'api',
    'handler': 'api',
    'controller': 'api',
    'middleware': 'api',
    'request': 'api',
    'response': 'api',
    'http': 'api',
    
    // Data Access
    'data': 'data-access',
    'database': 'data-access',
    'sql': 'data-access',
    'query': 'data-access',
    'repository': 'data-access',
    'model': 'data-access',
    'schema': 'data-access',
    'migration': 'data-access',
    
    // Errors
    'error': 'errors',
    'exception': 'errors',
    'throw': 'errors',
    'catch': 'errors',
    'handling': 'errors',
    
    // Structural
    'structural': 'structural',
    'file': 'structural',
    'directory': 'structural',
    'naming': 'structural',
    'import': 'structural',
    'export': 'structural',
    'module': 'structural',
    'package': 'structural',
    'barrel': 'structural',
    'circular': 'structural',
    
    // Components
    'component': 'components',
    'components': 'components',
    'react': 'components',
    'vue': 'components',
    'angular': 'components',
    'hook': 'components',
    'prop': 'components',
    'state': 'components',
    'render': 'components',
    'ref': 'components',
    'composition': 'components',
    
    // Styling
    'style': 'styling',
    'styling': 'styling',
    'css': 'styling',
    'typography': 'styling',
    'color': 'styling',
    'spacing': 'styling',
    'layout': 'styling',
    'theme': 'styling',
    'tailwind': 'styling',
    'class': 'styling',
    
    // Performance
    'performance': 'performance',
    'perf': 'performance',
    'optimization': 'performance',
    'cache': 'performance',
    'lazy': 'performance',
    'memo': 'performance',
  };

  // Check first few parts for category match
  for (const part of parts.slice(0, 3)) {
    if (categoryMap[part]) {
      return categoryMap[part];
    }
  }

  return 'other';
}

export function calculateStatistics(
  violations: Violation[],
  realtimeCount: number = 0
): ViolationStatistics {
  const metrics = calculateMetrics(violations);
  
  const byPattern = new Map<string, { name: string; count: number }>();
  for (const v of violations) {
    const existing = byPattern.get(v.patternId);
    if (existing) {
      existing.count++;
    } else {
      byPattern.set(v.patternId, { name: v.patternName, count: 1 });
    }
  }

  const topFiles = Object.entries(metrics.byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, DISPLAY_LIMITS.TOP_FILES)
    .map(([file, count]) => ({ file, count }));

  const topPatterns = Array.from(byPattern.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, DISPLAY_LIMITS.TOP_PATTERNS)
    .map(([id, { name, count }]) => ({ id, name, count }));

  const topCategories = Object.entries(metrics.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, DISPLAY_LIMITS.TOP_CATEGORIES)
    .map(([category, count]) => ({ 
      category, 
      count, 
      icon: CATEGORY_CONFIG[category]?.icon || '📋' 
    }));

  return {
    total: violations.length,
    bySeverity: metrics.bySeverity,
    byCategory: metrics.byCategory,
    byPattern,
    affectedFiles: Object.keys(metrics.byFile).length,
    topFiles,
    topPatterns,
    topCategories,
    realtimeCount,
    trend: 'stable', // Could be calculated from historical data
  };
}

// ============================================================================
// Grouping Functions
// ============================================================================

export function groupByFile(violations: Violation[]): FileGroup[] {
  const groups = new Map<string, Violation[]>();

  for (const v of violations) {
    const existing = groups.get(v.file);
    if (existing) {
      existing.push(v);
    } else {
      groups.set(v.file, [v]);
    }
  }

  return Array.from(groups.entries())
    .map(([file, fileViolations]) => {
      const bySeverity: Record<Severity, number> = {
        error: 0,
        warning: 0,
        info: 0,
        hint: 0,
      };

      for (const v of fileViolations) {
        bySeverity[v.severity]++;
      }

      const maxSeverity = getMaxSeverity(bySeverity);

      return {
        file,
        violations: fileViolations.sort((a, b) => a.range.start.line - b.range.start.line),
        metrics: {
          total: fileViolations.length,
          bySeverity,
          maxSeverity,
        },
      };
    })
    .sort((a, b) => {
      // Sort by max severity, then by count
      const severityDiff = getSeverityPriority(b.metrics.maxSeverity) - getSeverityPriority(a.metrics.maxSeverity);
      if (severityDiff !== 0) {return severityDiff;}
      return b.metrics.total - a.metrics.total;
    });
}

export function groupByPattern(violations: Violation[]): PatternGroup[] {
  const groups = new Map<string, { name: string; violations: Violation[] }>();

  for (const v of violations) {
    const existing = groups.get(v.patternId);
    if (existing) {
      existing.violations.push(v);
    } else {
      groups.set(v.patternId, { name: v.patternName, violations: [v] });
    }
  }

  return Array.from(groups.entries())
    .map(([patternId, { name, violations: patternViolations }]) => {
      const bySeverity: Record<Severity, number> = {
        error: 0,
        warning: 0,
        info: 0,
        hint: 0,
      };

      const files = new Set<string>();
      for (const v of patternViolations) {
        bySeverity[v.severity]++;
        files.add(v.file);
      }

      return {
        patternId,
        patternName: name,
        violations: patternViolations,
        metrics: {
          total: patternViolations.length,
          bySeverity,
          affectedFiles: files.size,
        },
      };
    })
    .sort((a, b) => b.metrics.total - a.metrics.total);
}

export function groupByCategory(violations: Violation[]): CategoryGroup[] {
  const groups = new Map<string, Violation[]>();

  for (const v of violations) {
    const category = extractCategory(v.patternId, v.patternName);
    const existing = groups.get(category);
    if (existing) {
      existing.push(v);
    } else {
      groups.set(category, [v]);
    }
  }

  return CATEGORY_ORDER
    .filter(category => groups.has(category))
    .map(category => {
      const categoryViolations = groups.get(category) || [];
      const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG['other']!;
      
      const bySeverity: Record<Severity, number> = {
        error: 0,
        warning: 0,
        info: 0,
        hint: 0,
      };

      const files = new Set<string>();
      const patterns = new Set<string>();
      
      for (const v of categoryViolations) {
        bySeverity[v.severity]++;
        files.add(v.file);
        patterns.add(v.patternId);
      }

      return {
        category,
        displayName: config.label,
        icon: config.icon,
        violations: categoryViolations,
        metrics: {
          total: categoryViolations.length,
          bySeverity,
          affectedFiles: files.size,
          patterns: Array.from(patterns),
        },
      };
    });
}

export function groupBySeverity(violations: Violation[]): SeverityGroup[] {
  const groups = new Map<Severity, Violation[]>();

  for (const v of violations) {
    const existing = groups.get(v.severity);
    if (existing) {
      existing.push(v);
    } else {
      groups.set(v.severity, [v]);
    }
  }

  return SEVERITY_ORDER
    .filter(severity => groups.has(severity))
    .map(severity => {
      const severityViolations = groups.get(severity) || [];
      
      // Group violations within this severity by category
      const categories = groupByCategory(severityViolations);

      return {
        severity,
        violations: severityViolations,
        categories,
      };
    });
}

// ============================================================================
// Sorting Functions
// ============================================================================

export function sortViolations(violations: Violation[], config: SortConfig): Violation[] {
  const sorted = [...violations];
  const multiplier = config.direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (config.field) {
      case 'severity':
        return multiplier * (getSeverityPriority(b.severity) - getSeverityPriority(a.severity));
      case 'category': {
        const catA = extractCategory(a.patternId, a.patternName);
        const catB = extractCategory(b.patternId, b.patternName);
        const priorityA = CATEGORY_CONFIG[catA]?.priority ?? 0;
        const priorityB = CATEGORY_CONFIG[catB]?.priority ?? 0;
        return multiplier * (priorityB - priorityA);
      }
      case 'file':
        return multiplier * a.file.localeCompare(b.file);
      case 'pattern':
        return multiplier * a.patternName.localeCompare(b.patternName);
      case 'line':
        return multiplier * (a.range.start.line - b.range.start.line);
      default:
        return 0;
    }
  });

  return sorted;
}

// ============================================================================
// Severity Helpers
// ============================================================================

export function getSeverityPriority(severity: Severity): number {
  return SEVERITY_CONFIG[severity].priority;
}

export function getMaxSeverity(bySeverity: Record<Severity, number>): Severity {
  for (const severity of SEVERITY_ORDER) {
    if (bySeverity[severity] > 0) {
      return severity;
    }
  }
  return 'hint';
}

export function getSeverityColor(severity: Severity): string {
  return SEVERITY_CONFIG[severity].color;
}

export function getSeverityBgColor(severity: Severity): string {
  return SEVERITY_CONFIG[severity].bgColor;
}

export function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
}

// ============================================================================
// Format Helpers
// ============================================================================

export function formatFilePath(path: string, maxLength = 50): string {
  if (path.length <= maxLength) {return path;}
  const parts = path.split('/');
  const filename = parts.pop() || '';
  if (filename.length >= maxLength - 3) {
    return '...' + filename.slice(-(maxLength - 3));
  }
  return '.../' + filename;
}

export function formatLineRange(start: { line: number; character: number }, end: { line: number; character: number }): string {
  if (start.line === end.line) {
    return `L${start.line}:${start.character}-${end.character}`;
  }
  return `L${start.line}:${start.character} - L${end.line}:${end.character}`;
}

export function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

// ============================================================================
// Merge Helpers
// ============================================================================

export function mergeViolations(
  fetched: Violation[],
  realtime: Violation[]
): Violation[] {
  const existingIds = new Set(fetched.map(v => v.id));
  const newViolations = realtime.filter(v => !existingIds.has(v.id));
  return [...newViolations, ...fetched];
}
