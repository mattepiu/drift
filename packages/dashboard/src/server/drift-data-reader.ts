/**
 * DriftDataReader
 *
 * Reads and parses data from the .drift/ folder structure.
 * Provides methods for accessing patterns, violations, files, and configuration.
 *
 * OPTIMIZED: Uses DataLake for fast reads with pre-computed views.
 * Falls back to direct file reading when lake data is unavailable.
 *
 * @requirements 1.6 - THE Dashboard_Server SHALL read pattern and violation data from the existing `.drift/` folder structure
 * @requirements 8.1 - THE Dashboard_Server SHALL expose GET `/api/patterns` to list all patterns
 * @requirements 8.2 - THE Dashboard_Server SHALL expose GET `/api/patterns/:id` to get pattern details with locations
 * @requirements 8.6 - THE Dashboard_Server SHALL expose GET `/api/violations` to list all violations
 * @requirements 8.7 - THE Dashboard_Server SHALL expose GET `/api/files` to get the file tree
 * @requirements 8.8 - THE Dashboard_Server SHALL expose GET `/api/files/:path` to get patterns and violations for a specific file
 * @requirements 8.9 - THE Dashboard_Server SHALL expose GET `/api/stats` to get overview statistics
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { createDataLake } from 'driftdetect-core';
import type { 
  DataLake, 
  StatusView, 
  TrendsView,
  PatternFile,
  PatternStatus,
  PatternCategory,
  PatternLocation,
  OutlierLocation,
  StoredPattern,
  Severity,
} from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface PatternQuery {
  category?: string;
  status?: string;
  minConfidence?: number;
  search?: string;
}

export interface ViolationQuery {
  severity?: string;
  file?: string;
  patternId?: string;
  search?: string;
}

/**
 * Pattern representation for the dashboard API
 */
export interface DashboardPattern {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  status: PatternStatus;
  description: string;
  confidence: {
    score: number;
    level: string;
  };
  locationCount: number;
  outlierCount: number;
  severity: string;
  metadata: {
    firstSeen: string;
    lastSeen: string;
    tags?: string[] | undefined;
  };
}

/**
 * Pattern with full location details for the dashboard API
 */
export interface DashboardPatternWithLocations extends DashboardPattern {
  locations: SemanticLocation[];
  outliers: OutlierWithDetails[];
}

/**
 * Semantic location for the dashboard
 */
export interface SemanticLocation {
  file: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Outlier with reason details
 */
export interface OutlierWithDetails extends SemanticLocation {
  reason: string;
  deviationScore?: number | undefined;
}

/**
 * Violation representation for the dashboard API
 */
export interface DashboardViolation {
  id: string;
  patternId: string;
  patternName: string;
  severity: string;
  file: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  expected: string;
  actual: string;
}

/**
 * File tree node for hierarchical file structure
 * @requirements 8.7 - GET `/api/files` to get the file tree
 */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  patternCount?: number;
  violationCount?: number;
  severity?: Severity;
}

/**
 * File details with patterns and violations
 * @requirements 8.8 - GET `/api/files/:path` to get patterns and violations for a specific file
 */
export interface FileDetails {
  path: string;
  language: string;
  lineCount: number;
  patterns: Array<{
    id: string;
    name: string;
    category: PatternCategory;
    locations: SemanticLocation[];
  }>;
  violations: DashboardViolation[];
}

/**
 * Drift configuration
 * @requirements 8.10, 8.11 - Configuration management
 */
export interface DriftConfig {
  version: string;
  detectors: DetectorConfigEntry[];
  severityOverrides: Record<string, Severity>;
  ignorePatterns: string[];
  watchOptions?: {
    debounce: number;
    categories?: PatternCategory[];
  };
}

/**
 * Detector configuration entry
 */
export interface DetectorConfigEntry {
  id: string;
  name: string;
  enabled: boolean;
  category: PatternCategory;
  options?: Record<string, unknown>;
}

/**
 * Dashboard statistics
 * @requirements 8.9 - GET `/api/stats` to get overview statistics
 */
export interface DashboardStats {
  healthScore: number;
  patterns: {
    total: number;
    byStatus: Record<PatternStatus, number>;
    byCategory: Record<PatternCategory, number>;
  };
  violations: {
    total: number;
    bySeverity: Record<Severity, number>;
  };
  files: {
    total: number;
    scanned: number;
  };
  detectors: {
    active: number;
    total: number;
  };
  lastScan: string | null;
}

/**
 * Contract representation for the dashboard API
 */
export interface DashboardContract {
  id: string;
  method: string;
  endpoint: string;
  status: string;
  backend: {
    file: string;
    line: number;
    framework: string;
    responseFields: Array<{ name: string; type: string; optional: boolean }>;
  };
  frontend: Array<{
    file: string;
    line: number;
    library: string;
    responseType?: string;
    responseFields: Array<{ name: string; type: string; optional: boolean }>;
  }>;
  mismatches: Array<{
    fieldPath: string;
    mismatchType: string;
    description: string;
    severity: string;
  }>;
  mismatchCount: number;
  confidence: {
    score: number;
    level: string;
  };
  metadata: {
    firstSeen: string;
    lastSeen: string;
    verifiedAt?: string;
  };
}

/**
 * Contract statistics for the dashboard
 */
export interface DashboardContractStats {
  totalContracts: number;
  byStatus: Record<string, number>;
  byMethod: Record<string, number>;
  totalMismatches: number;
  mismatchesByType: Record<string, number>;
}

// ============================================================================
// Trend / History Types
// ============================================================================

/**
 * A snapshot of a single pattern's state at a point in time
 */
export interface PatternSnapshot {
  patternId: string;
  patternName: string;
  category: PatternCategory;
  confidence: number;
  locationCount: number;
  outlierCount: number;
  complianceRate: number;
  status: PatternStatus;
}

/**
 * Category summary in a snapshot
 */
export interface CategorySummary {
  patternCount: number;
  avgConfidence: number;
  totalLocations: number;
  totalOutliers: number;
  complianceRate: number;
}

/**
 * A full snapshot of all patterns at a point in time
 */
export interface HistorySnapshot {
  timestamp: string;
  date: string;
  patterns: PatternSnapshot[];
  summary: {
    totalPatterns: number;
    avgConfidence: number;
    totalLocations: number;
    totalOutliers: number;
    overallComplianceRate: number;
    byCategory: Record<string, CategorySummary>;
  };
}

/**
 * A detected regression or improvement
 */
export interface PatternTrend {
  patternId: string;
  patternName: string;
  category: PatternCategory;
  type: 'regression' | 'improvement' | 'stable';
  metric: 'confidence' | 'compliance' | 'outliers';
  previousValue: number;
  currentValue: number;
  change: number;
  changePercent: number;
  severity: 'critical' | 'warning' | 'info';
  firstSeen: string;
  details: string;
}

/**
 * Aggregated trends for the dashboard
 */
export interface TrendSummary {
  period: '7d' | '30d' | '90d';
  startDate: string;
  endDate: string;
  regressions: PatternTrend[];
  improvements: PatternTrend[];
  stable: number;
  overallTrend: 'improving' | 'declining' | 'stable';
  healthDelta: number;
  categoryTrends: Record<string, {
    trend: 'improving' | 'declining' | 'stable';
    avgConfidenceChange: number;
    complianceChange: number;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const PATTERNS_DIR = 'patterns';
const STATUS_DIRS: PatternStatus[] = ['discovered', 'approved', 'ignored'];

const PATTERN_CATEGORIES: PatternCategory[] = [
  'structural',
  'components',
  'styling',
  'api',
  'auth',
  'errors',
  'data-access',
  'testing',
  'logging',
  'security',
  'config',
  'types',
  'performance',
  'accessibility',
  'documentation',
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a PatternLocation to SemanticLocation
 */
function toSemanticLocation(loc: PatternLocation): SemanticLocation {
  return {
    file: loc.file,
    range: {
      start: { line: loc.line, character: loc.column },
      end: { line: loc.endLine ?? loc.line, character: loc.endColumn ?? loc.column },
    },
  };
}

/**
 * Convert an OutlierLocation to OutlierWithDetails
 */
function toOutlierWithDetails(outlier: OutlierLocation): OutlierWithDetails {
  return {
    file: outlier.file,
    range: {
      start: { line: outlier.line, character: outlier.column },
      end: { line: outlier.endLine ?? outlier.line, character: outlier.endColumn ?? outlier.column },
    },
    reason: outlier.reason,
    deviationScore: outlier.deviationScore,
  };
}

/**
 * Generate a unique violation ID from pattern and outlier
 */
function generateViolationId(patternId: string, outlier: OutlierLocation): string {
  return `${patternId}-${outlier.file}-${outlier.line}-${outlier.column}`;
}

// ============================================================================
// DriftDataReader Class
// ============================================================================

export class DriftDataReader {
  private readonly driftDir: string;
  private readonly patternsDir: string;
  private readonly dataLake: DataLake;
  private lakeInitialized = false;

  constructor(driftDir: string) {
    this.driftDir = driftDir;
    this.patternsDir = path.join(driftDir, PATTERNS_DIR);
    
    // Initialize DataLake for optimized reads
    // rootDir is the parent of .drift/
    const rootDir = path.dirname(driftDir);
    this.dataLake = createDataLake({ rootDir });
  }

  /**
   * Get the drift directory path
   */
  get directory(): string {
    return this.driftDir;
  }

  /**
   * Initialize the data lake (lazy initialization)
   */
  private async initializeLake(): Promise<boolean> {
    if (this.lakeInitialized) {return true;}
    try {
      await this.dataLake.initialize();
      this.lakeInitialized = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all patterns, optionally filtered
   * OPTIMIZED: Uses DataLake pattern shards for fast category-based queries
   *
   * @requirements 8.1 - List all patterns
   */
  async getPatterns(query?: PatternQuery): Promise<DashboardPattern[]> {
    // OPTIMIZATION: Try DataLake first for fast reads
    if (await this.initializeLake()) {
      try {
        const lakePatterns = await this.getPatternsFromLake(query);
        if (lakePatterns && lakePatterns.length > 0) {
          return lakePatterns;
        }
      } catch {
        // Fall through to direct file reading
      }
    }

    // Fallback: Read patterns from all status directories
    const patterns: DashboardPattern[] = [];

    for (const status of STATUS_DIRS) {
      const statusDir = path.join(this.patternsDir, status);
      
      if (!(await fileExists(statusDir))) {
        continue;
      }

      // Dynamically read all JSON files in this status directory
      try {
        const files = await fs.readdir(statusDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        for (const jsonFile of jsonFiles) {
          const filePath = path.join(statusDir, jsonFile);
          const category = jsonFile.replace('.json', '') as PatternCategory;

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const patternFile = JSON.parse(content) as PatternFile;

            for (const stored of patternFile.patterns) {
              const dashboardPattern = this.storedToDashboardPattern(stored, category, status);
              patterns.push(dashboardPattern);
            }
          } catch (error) {
            // Skip files that can't be parsed
            console.error(`Error reading pattern file ${filePath}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error reading status directory ${statusDir}:`, error);
      }
    }

    // Apply filters if provided
    return this.filterPatterns(patterns, query);
  }

  /**
   * Get patterns from DataLake (optimized path)
   */
  private async getPatternsFromLake(query?: PatternQuery): Promise<DashboardPattern[] | null> {
    try {
      // Build query options for DataLake
      const queryOptions: Parameters<typeof this.dataLake.query.getPatterns>[0] = {
        limit: 1000, // Get all patterns
      };
      
      if (query?.category) {
        queryOptions.categories = [query.category as PatternCategory];
      }
      if (query?.status && query.status !== 'all') {
        queryOptions.status = query.status as 'discovered' | 'approved' | 'ignored';
      }
      if (query?.minConfidence !== undefined) {
        queryOptions.minConfidence = query.minConfidence;
      }
      if (query?.search) {
        queryOptions.search = query.search;
      }

      const result = await this.dataLake.query.getPatterns(queryOptions);
      
      if (result.items.length === 0 && result.total === 0) {
        return null; // No data in lake, fall back to files
      }

      // Convert lake PatternSummary to DashboardPattern
      return result.items.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        status: p.status,
        description: '', // PatternSummary doesn't include description
        confidence: {
          score: p.confidence,
          level: p.confidenceLevel,
        },
        locationCount: p.locationCount,
        outlierCount: p.outlierCount,
        severity: p.severity || (p.outlierCount > 0 ? 'warning' : 'info'),
        metadata: {
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        },
      }));
    } catch {
      return null;
    }
  }

  /**
   * Get a single pattern by ID with all locations
   *
   * @requirements 8.2 - Get pattern details with locations
   */
  async getPattern(id: string): Promise<DashboardPatternWithLocations | null> {
    // Search through all status directories dynamically
    for (const status of STATUS_DIRS) {
      const statusDir = path.join(this.patternsDir, status);
      
      if (!(await fileExists(statusDir))) {
        continue;
      }

      try {
        const files = await fs.readdir(statusDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        for (const jsonFile of jsonFiles) {
          const filePath = path.join(statusDir, jsonFile);
          const category = jsonFile.replace('.json', '') as PatternCategory;

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const patternFile = JSON.parse(content) as PatternFile;

            const stored = patternFile.patterns.find((p) => p.id === id);
            if (stored) {
              return this.storedToDashboardPatternWithLocations(stored, category, status);
            }
          } catch (error) {
            // Skip files that can't be parsed
            console.error(`Error reading pattern file ${filePath}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error reading status directory ${statusDir}:`, error);
      }
    }

    return null;
  }

  /**
   * Get all violations, optionally filtered
   *
   * Violations are derived from pattern outliers.
   *
   * @requirements 8.6 - List all violations
   */
  async getViolations(query?: ViolationQuery): Promise<DashboardViolation[]> {
    const violations: DashboardViolation[] = [];

    // Read patterns from all status directories dynamically
    for (const status of STATUS_DIRS) {
      const statusDir = path.join(this.patternsDir, status);
      
      if (!(await fileExists(statusDir))) {
        continue;
      }

      try {
        const files = await fs.readdir(statusDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        for (const jsonFile of jsonFiles) {
          const filePath = path.join(statusDir, jsonFile);

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const patternFile = JSON.parse(content) as PatternFile;

            for (const stored of patternFile.patterns) {
              // Convert outliers to violations
              for (const outlier of stored.outliers) {
                const violation = this.outlierToViolation(stored, outlier);
                violations.push(violation);
              }
            }
          } catch (error) {
            // Skip files that can't be parsed
            console.error(`Error reading pattern file ${filePath}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error reading status directory ${statusDir}:`, error);
      }
    }

    // Apply filters if provided
    return this.filterViolations(violations, query);
  }

  /**
   * Get dashboard statistics
   * OPTIMIZED: Uses DataLake status view for instant response
   * @requirements 8.9 - GET `/api/stats` to get overview statistics
   */
  async getStats(): Promise<DashboardStats> {
    // OPTIMIZATION: Try DataLake status view first (instant)
    if (await this.initializeLake()) {
      try {
        const statusView = await this.dataLake.query.getStatus();
        if (statusView) {
          return this.statusViewToStats(statusView);
        }
      } catch {
        // Fall through to direct file reading
      }
    }

    // Fallback: Compute from raw pattern files
    const patterns = await this.getPatterns();
    const violations = await this.getViolations();

    // Count patterns by status
    const byStatus: Record<PatternStatus, number> = {
      discovered: 0,
      approved: 0,
      ignored: 0,
    };
    for (const pattern of patterns) {
      byStatus[pattern.status]++;
    }

    // Count patterns by category - dynamically from actual patterns
    const byCategory: Record<string, number> = {};
    for (const pattern of patterns) {
      const category = pattern.category;
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    // Count violations by severity
    const bySeverity: Record<Severity, number> = {
      error: 0,
      warning: 0,
      info: 0,
      hint: 0,
    };
    for (const violation of violations) {
      const severity = violation.severity as Severity;
      if (severity in bySeverity) {
        bySeverity[severity]++;
      }
    }

    // Collect unique files from patterns and violations
    const filesSet = new Set<string>();
    for (const pattern of patterns) {
      // We need to get the full pattern to access locations
      const fullPattern = await this.getPattern(pattern.id);
      if (fullPattern) {
        for (const loc of fullPattern.locations) {
          filesSet.add(loc.file);
        }
        for (const outlier of fullPattern.outliers) {
          filesSet.add(outlier.file);
        }
      }
    }

    // Calculate health score
    const healthScore = this.calculateHealthScore(violations, patterns);

    // Get last scan time from pattern metadata
    let lastScan: string | null = null;
    for (const pattern of patterns) {
      if (pattern.metadata.lastSeen) {
        if (!lastScan || pattern.metadata.lastSeen > lastScan) {
          lastScan = pattern.metadata.lastSeen;
        }
      }
    }

    return {
      healthScore,
      patterns: {
        total: patterns.length,
        byStatus,
        byCategory: byCategory as Record<PatternCategory, number>,
      },
      violations: {
        total: violations.length,
        bySeverity,
      },
      files: {
        total: filesSet.size,
        scanned: filesSet.size,
      },
      detectors: {
        active: Object.keys(byCategory).length, // Count unique categories found
        total: Object.keys(byCategory).length,
      },
      lastScan,
    };
  }

  /**
   * Convert StatusView from DataLake to DashboardStats
   */
  private statusViewToStats(view: StatusView): DashboardStats {
    return {
      healthScore: view.health.score,
      patterns: {
        total: view.patterns.total,
        byStatus: {
          discovered: view.patterns.discovered,
          approved: view.patterns.approved,
          ignored: view.patterns.ignored,
        },
        byCategory: view.patterns.byCategory as Record<PatternCategory, number>,
      },
      violations: {
        total: view.issues.critical + view.issues.warnings,
        bySeverity: {
          error: view.issues.critical,
          warning: view.issues.warnings,
          info: 0,
          hint: 0,
        },
      },
      files: {
        // StatusView doesn't track files, estimate from patterns
        total: 0,
        scanned: view.lastScan.filesScanned,
      },
      detectors: {
        active: Object.keys(view.patterns.byCategory).length,
        total: Object.keys(view.patterns.byCategory).length,
      },
      lastScan: view.lastScan.timestamp || null,
    };
  }

  /**
   * Get the file tree structure
   * @requirements 8.7 - GET `/api/files` to get the file tree
   */
  async getFileTree(): Promise<FileTreeNode[]> {
    const patterns = await this.getPatterns();
    const violations = await this.getViolations();

    // Collect file information
    const fileInfo = new Map<string, { patternCount: number; violationCount: number; severity?: Severity }>();

    // Count patterns per file
    for (const pattern of patterns) {
      const fullPattern = await this.getPattern(pattern.id);
      if (fullPattern) {
        for (const loc of fullPattern.locations) {
          const info = fileInfo.get(loc.file) || { patternCount: 0, violationCount: 0 };
          info.patternCount++;
          fileInfo.set(loc.file, info);
        }
      }
    }

    // Count violations per file and track highest severity
    for (const violation of violations) {
      const info = fileInfo.get(violation.file) || { patternCount: 0, violationCount: 0 };
      info.violationCount++;
      
      // Track highest severity
      const violationSeverity = violation.severity as Severity;
      if (!info.severity || this.compareSeverity(violationSeverity, info.severity) > 0) {
        info.severity = violationSeverity;
      }
      
      fileInfo.set(violation.file, info);
    }

    // Build tree structure
    return this.buildFileTree(fileInfo);
  }

  /**
   * Get details for a specific file
   * @requirements 8.8 - GET `/api/files/:path` to get patterns and violations for a specific file
   */
  async getFileDetails(filePath: string): Promise<FileDetails | null> {
    const patterns = await this.getPatterns();
    const violations = await this.getViolations();

    // Find patterns that have locations in this file
    const filePatterns: FileDetails['patterns'] = [];
    for (const pattern of patterns) {
      const fullPattern = await this.getPattern(pattern.id);
      if (fullPattern) {
        const locationsInFile = fullPattern.locations.filter((loc) => loc.file === filePath);
        if (locationsInFile.length > 0) {
          filePatterns.push({
            id: pattern.id,
            name: pattern.name,
            category: pattern.category as PatternCategory,
            locations: locationsInFile,
          });
        }
      }
    }

    // Find violations in this file
    const fileViolations = violations.filter((v) => v.file === filePath);

    // If no patterns or violations found, return null
    if (filePatterns.length === 0 && fileViolations.length === 0) {
      return null;
    }

    // Determine language from file extension
    const language = this.getLanguageFromPath(filePath);

    return {
      path: filePath,
      language,
      lineCount: 0, // We don't have access to actual file content
      patterns: filePatterns,
      violations: fileViolations,
    };
  }

  /**
   * Get configuration
   * @requirements 8.10 - GET `/api/config` to get configuration
   */
  async getConfig(): Promise<DriftConfig> {
    const configPath = path.join(this.driftDir, 'config.json');
    
    if (!(await fileExists(configPath))) {
      // Return default config if none exists
      return this.getDefaultConfig();
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content) as DriftConfig;
    } catch (error) {
      console.error('Error reading config:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Update configuration
   * @requirements 8.11 - PUT `/api/config` to update configuration
   */
  async updateConfig(partial: Partial<DriftConfig>): Promise<void> {
    const configPath = path.join(this.driftDir, 'config.json');
    const currentConfig = await this.getConfig();
    
    // Merge the partial config with current config
    const newConfig: DriftConfig = {
      ...currentConfig,
      ...partial,
      detectors: partial.detectors ?? currentConfig.detectors,
      severityOverrides: {
        ...currentConfig.severityOverrides,
        ...partial.severityOverrides,
      },
      ignorePatterns: partial.ignorePatterns ?? currentConfig.ignorePatterns,
    };

    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
  }

  /**
   * Approve a pattern - changes status to 'approved'
   * @requirements 4.4 - Approve pattern
   * @requirements 8.3 - POST `/api/patterns/:id/approve` to approve a pattern
   */
  async approvePattern(id: string): Promise<void> {
    await this.changePatternStatus(id, 'approved');
  }

  /**
   * Ignore a pattern - changes status to 'ignored'
   * @requirements 4.5 - Ignore pattern
   * @requirements 8.4 - POST `/api/patterns/:id/ignore` to ignore a pattern
   */
  async ignorePattern(id: string): Promise<void> {
    await this.changePatternStatus(id, 'ignored');
  }

  /**
   * Delete a pattern - removes from storage
   * @requirements 4.6 - Delete pattern
   * @requirements 8.5 - DELETE `/api/patterns/:id` to delete a pattern
   */
  async deletePattern(id: string): Promise<void> {
    // Find the pattern and its location
    const location = await this.findPatternLocation(id);
    if (!location) {
      throw new Error(`Pattern not found: ${id}`);
    }

    const { filePath } = location;

    // Read the pattern file
    const content = await fs.readFile(filePath, 'utf-8');
    const patternFile = JSON.parse(content) as PatternFile;

    // Remove the pattern
    patternFile.patterns = patternFile.patterns.filter((p) => p.id !== id);
    patternFile.lastUpdated = new Date().toISOString();

    // Write back or delete file if empty
    if (patternFile.patterns.length === 0) {
      await fs.unlink(filePath);
    } else {
      await fs.writeFile(filePath, JSON.stringify(patternFile, null, 2));
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Convert a StoredPattern to DashboardPattern
   */
  private storedToDashboardPattern(
    stored: StoredPattern,
    category: PatternCategory,
    status: PatternStatus
  ): DashboardPattern {
    return {
      id: stored.id,
      name: stored.name,
      category,
      subcategory: stored.subcategory,
      status,
      description: stored.description,
      confidence: {
        score: stored.confidence.score,
        level: stored.confidence.level,
      },
      locationCount: stored.locations.length,
      outlierCount: stored.outliers.length,
      severity: stored.severity,
      metadata: {
        firstSeen: stored.metadata.firstSeen,
        lastSeen: stored.metadata.lastSeen,
        tags: stored.metadata.tags,
      },
    };
  }

  /**
   * Convert a StoredPattern to DashboardPatternWithLocations
   */
  private storedToDashboardPatternWithLocations(
    stored: StoredPattern,
    category: PatternCategory,
    status: PatternStatus
  ): DashboardPatternWithLocations {
    const base = this.storedToDashboardPattern(stored, category, status);
    return {
      ...base,
      locations: stored.locations.map(toSemanticLocation),
      outliers: stored.outliers.map(toOutlierWithDetails),
    };
  }

  /**
   * Convert an outlier to a violation
   */
  private outlierToViolation(
    pattern: StoredPattern,
    outlier: OutlierLocation
  ): DashboardViolation {
    return {
      id: generateViolationId(pattern.id, outlier),
      patternId: pattern.id,
      patternName: pattern.name,
      severity: pattern.severity,
      file: outlier.file,
      range: {
        start: { line: outlier.line, character: outlier.column },
        end: { line: outlier.endLine ?? outlier.line, character: outlier.endColumn ?? outlier.column },
      },
      message: outlier.reason,
      expected: pattern.description,
      actual: outlier.reason,
    };
  }

  /**
   * Filter patterns based on query
   */
  private filterPatterns(
    patterns: DashboardPattern[],
    query?: PatternQuery
  ): DashboardPattern[] {
    if (!query) {
      return patterns;
    }

    return patterns.filter((pattern) => {
      // Filter by category
      if (query.category && pattern.category !== query.category) {
        return false;
      }

      // Filter by status
      if (query.status && pattern.status !== query.status) {
        return false;
      }

      // Filter by minimum confidence
      if (query.minConfidence !== undefined && pattern.confidence.score < query.minConfidence) {
        return false;
      }

      // Filter by search term (name or description)
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        const nameMatch = pattern.name.toLowerCase().includes(searchLower);
        const descMatch = pattern.description.toLowerCase().includes(searchLower);
        if (!nameMatch && !descMatch) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Filter violations based on query
   */
  private filterViolations(
    violations: DashboardViolation[],
    query?: ViolationQuery
  ): DashboardViolation[] {
    if (!query) {
      return violations;
    }

    return violations.filter((violation) => {
      // Filter by severity
      if (query.severity && violation.severity !== query.severity) {
        return false;
      }

      // Filter by file
      if (query.file && violation.file !== query.file) {
        return false;
      }

      // Filter by pattern ID
      if (query.patternId && violation.patternId !== query.patternId) {
        return false;
      }

      // Filter by search term (message or pattern name)
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        const messageMatch = violation.message.toLowerCase().includes(searchLower);
        const nameMatch = violation.patternName.toLowerCase().includes(searchLower);
        if (!messageMatch && !nameMatch) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Calculate health score based on violations and patterns
   * 
   * Health score formula:
   * - Base score starts at 100
   * - Deduct for violations by severity (error: -10, warning: -3, info: -1, hint: 0)
   * - Bonus for approved patterns (shows intentional architecture)
   * - Clamp to 0-100
   */
  private calculateHealthScore(
    violations: DashboardViolation[],
    patterns: DashboardPattern[]
  ): number {
    let score = 100;

    // Deduct for violations by severity
    for (const violation of violations) {
      switch (violation.severity) {
        case 'error':
          score -= 10;
          break;
        case 'warning':
          score -= 3;
          break;
        case 'info':
          score -= 1;
          break;
        // hint doesn't deduct
      }
    }

    // Bonus for approved patterns (shows intentional architecture)
    if (patterns.length > 0) {
      const approvedCount = patterns.filter((p) => p.status === 'approved').length;
      const approvalRate = approvedCount / patterns.length;
      score += approvalRate * 10;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Build a hierarchical file tree from file information
   */
  private buildFileTree(
    fileInfo: Map<string, { patternCount: number; violationCount: number; severity?: Severity }>
  ): FileTreeNode[] {
    // First pass: collect all unique directory paths and files
    const nodeMap = new Map<string, FileTreeNode>();

    for (const [filePath, info] of fileInfo) {
      const parts = filePath.split('/').filter(Boolean);
      if (parts.length === 0) {continue;}
      
      let currentPath = '';

      // Create directory nodes
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!nodeMap.has(currentPath)) {
          nodeMap.set(currentPath, {
            name: part,
            path: currentPath,
            type: 'directory',
            children: [],
            patternCount: 0,
            violationCount: 0,
          });
        }
      }

      // Create file node
      const fileName = parts[parts.length - 1]!;
      const fullPath = parts.join('/');
      const fileNode: FileTreeNode = {
        name: fileName,
        path: fullPath,
        type: 'file',
        patternCount: info.patternCount,
        violationCount: info.violationCount,
      };
      if (info.severity) {
        fileNode.severity = info.severity;
      }
      nodeMap.set(fullPath, fileNode);
    }

    // Second pass: build parent-child relationships and aggregate counts
    for (const [nodePath, node] of nodeMap) {
      if (node.type === 'file') {
        // Find parent directory
        const parts = nodePath.split('/');
        if (parts.length > 1) {
          const parentPath = parts.slice(0, -1).join('/');
          const parent = nodeMap.get(parentPath);
          if (parent?.children) {
            parent.children.push(node);
            // Aggregate counts to parent
            if (parent.patternCount !== undefined && node.patternCount !== undefined) {
              parent.patternCount += node.patternCount;
            }
            if (parent.violationCount !== undefined && node.violationCount !== undefined) {
              parent.violationCount += node.violationCount;
            }
            // Track highest severity
            if (node.severity) {
              if (!parent.severity || this.compareSeverity(node.severity, parent.severity) > 0) {
                parent.severity = node.severity;
              }
            }
          }
        }
      }
    }

    // Third pass: link directories to their parents
    for (const [nodePath, node] of nodeMap) {
      if (node.type === 'directory') {
        const parts = nodePath.split('/');
        if (parts.length > 1) {
          const parentPath = parts.slice(0, -1).join('/');
          const parent = nodeMap.get(parentPath);
          if (parent?.children) {
            // Check if not already added
            if (!parent.children.some(c => c.path === node.path)) {
              parent.children.push(node);
            }
            // Aggregate counts to parent
            if (parent.patternCount !== undefined && node.patternCount !== undefined) {
              parent.patternCount += node.patternCount;
            }
            if (parent.violationCount !== undefined && node.violationCount !== undefined) {
              parent.violationCount += node.violationCount;
            }
            // Track highest severity
            if (node.severity) {
              if (!parent.severity || this.compareSeverity(node.severity, parent.severity) > 0) {
                parent.severity = node.severity;
              }
            }
          }
        }
      }
    }

    // Get root nodes (nodes without parents)
    const rootNodes: FileTreeNode[] = [];
    for (const [nodePath, node] of nodeMap) {
      const parts = nodePath.split('/');
      if (parts.length === 1) {
        rootNodes.push(node);
      }
    }

    // Sort and return
    return this.sortFileTree(rootNodes);
  }

  /**
   * Sort file tree: directories first, then alphabetically
   */
  private sortFileTree(nodes: FileTreeNode[]): FileTreeNode[] {
    return nodes
      .map((node) => {
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: this.sortFileTree(node.children),
          };
        }
        return node;
      })
      .sort((a, b) => {
        // Directories first
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Compare severity levels
   * Returns positive if a > b, negative if a < b, 0 if equal
   */
  private compareSeverity(a: Severity, b: Severity): number {
    const order: Record<Severity, number> = {
      error: 4,
      warning: 3,
      info: 2,
      hint: 1,
    };
    return order[a] - order[b];
  }

  /**
   * Get programming language from file path
   */
  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.rb': 'ruby',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.cs': 'csharp',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.md': 'markdown',
      '.sql': 'sql',
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'zsh',
    };
    return languageMap[ext] || 'plaintext';
  }

  /**
   * Change pattern status (move between status directories)
   */
  private async changePatternStatus(id: string, newStatus: PatternStatus): Promise<void> {
    // Find the pattern and its current location
    const location = await this.findPatternLocation(id);
    if (!location) {
      throw new Error(`Pattern not found: ${id}`);
    }

    const { status: currentStatus, category, filePath, pattern } = location;

    // If already in the target status, nothing to do
    if (currentStatus === newStatus) {
      return;
    }

    // Read the source pattern file
    const sourceContent = await fs.readFile(filePath, 'utf-8');
    const sourceFile = JSON.parse(sourceContent) as PatternFile;

    // Remove pattern from source file
    sourceFile.patterns = sourceFile.patterns.filter((p) => p.id !== id);
    sourceFile.lastUpdated = new Date().toISOString();

    // Write back source file or delete if empty
    if (sourceFile.patterns.length === 0) {
      await fs.unlink(filePath);
    } else {
      await fs.writeFile(filePath, JSON.stringify(sourceFile, null, 2));
    }

    // Add pattern to target status directory
    const targetDir = path.join(this.patternsDir, newStatus);
    const targetPath = path.join(targetDir, `${category}.json`);

    // Ensure target directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Read or create target file
    let targetFile: PatternFile;
    if (await fileExists(targetPath)) {
      const targetContent = await fs.readFile(targetPath, 'utf-8');
      targetFile = JSON.parse(targetContent) as PatternFile;
    } else {
      targetFile = {
        version: '1.0.0',
        category,
        patterns: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    // Update pattern metadata if approving
    const updatedPattern = { ...pattern };
    if (newStatus === 'approved') {
      updatedPattern.metadata = {
        ...updatedPattern.metadata,
        approvedAt: new Date().toISOString(),
      };
    }

    // Add pattern to target file
    targetFile.patterns.push(updatedPattern);
    targetFile.lastUpdated = new Date().toISOString();

    // Write target file
    await fs.writeFile(targetPath, JSON.stringify(targetFile, null, 2));
  }

  /**
   * Find a pattern's location in the file system
   */
  private async findPatternLocation(id: string): Promise<{
    status: PatternStatus;
    category: PatternCategory;
    filePath: string;
    pattern: StoredPattern;
  } | null> {
    for (const status of STATUS_DIRS) {
      const statusDir = path.join(this.patternsDir, status);
      
      if (!(await fileExists(statusDir))) {
        continue;
      }

      try {
        const files = await fs.readdir(statusDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        for (const jsonFile of jsonFiles) {
          const filePath = path.join(statusDir, jsonFile);
          const category = jsonFile.replace('.json', '') as PatternCategory;

          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const patternFile = JSON.parse(content) as PatternFile;

            const pattern = patternFile.patterns.find((p) => p.id === id);
            if (pattern) {
              return { status, category, filePath, pattern };
            }
          } catch (error) {
            // Skip files that can't be parsed
            console.error(`Error reading pattern file ${filePath}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error reading status directory ${statusDir}:`, error);
      }
    }

    return null;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): DriftConfig {
    return {
      version: '1.0.0',
      detectors: PATTERN_CATEGORIES.map((category) => ({
        id: category,
        name: category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' '),
        enabled: true,
        category,
      })),
      severityOverrides: {},
      ignorePatterns: ['node_modules/**', 'dist/**', '.git/**'],
    };
  }

  /**
   * Get code snippet from a file at a specific line with context
   */
  async getCodeSnippet(
    filePath: string,
    line: number,
    contextLines: number = 3
  ): Promise<{ code: string; startLine: number; endLine: number; language: string } | null> {
    // driftDir is .drift/, so workspace root is the parent
    const workspaceRoot = path.dirname(this.driftDir);
    const fullPath = path.join(workspaceRoot, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      const startLine = Math.max(1, line - contextLines);
      const endLine = Math.min(lines.length, line + contextLines);
      
      const snippetLines = lines.slice(startLine - 1, endLine);
      const code = snippetLines.join('\n');
      
      return {
        code,
        startLine,
        endLine,
        language: this.getLanguageFromPath(filePath),
      };
    } catch (error) {
      console.error(`Error reading file ${fullPath}:`, error);
      return null;
    }
  }

  // ==========================================================================
  // Contract Methods (BE↔FE mismatch detection)
  // ==========================================================================

  /**
   * Get all contracts, optionally filtered
   */
  async getContracts(query?: {
    status?: string;
    method?: string;
    hasMismatches?: boolean;
    search?: string;
  }): Promise<DashboardContract[]> {
    const contracts: DashboardContract[] = [];
    const contractsDir = path.join(this.driftDir, 'contracts');

    const statusDirs = ['discovered', 'verified', 'mismatch', 'ignored'];

    for (const status of statusDirs) {
      const statusDir = path.join(contractsDir, status);
      
      if (!(await fileExists(statusDir))) {
        continue;
      }

      const filePath = path.join(statusDir, 'contracts.json');
      if (!(await fileExists(filePath))) {
        continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const contractFile = JSON.parse(content);

        for (const stored of contractFile.contracts) {
          contracts.push({
            ...stored,
            status,
            mismatchCount: stored.mismatches?.length || 0,
          });
        }
      } catch (error) {
        console.error(`Error reading contract file ${filePath}:`, error);
      }
    }

    // Apply filters
    return this.filterContracts(contracts, query);
  }

  /**
   * Get a single contract by ID
   */
  async getContract(id: string): Promise<DashboardContract | null> {
    const contractsDir = path.join(this.driftDir, 'contracts');
    const statusDirs = ['discovered', 'verified', 'mismatch', 'ignored'];

    for (const status of statusDirs) {
      const filePath = path.join(contractsDir, status, 'contracts.json');
      
      if (!(await fileExists(filePath))) {
        continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const contractFile = JSON.parse(content);

        const contract = contractFile.contracts.find((c: any) => c.id === id);
        if (contract) {
          return {
            ...contract,
            status,
            mismatchCount: contract.mismatches?.length || 0,
          };
        }
      } catch (error) {
        console.error(`Error reading contract file ${filePath}:`, error);
      }
    }

    return null;
  }

  /**
   * Get contract statistics
   */
  async getContractStats(): Promise<DashboardContractStats> {
    const contracts = await this.getContracts();

    const byStatus: Record<string, number> = {
      discovered: 0,
      verified: 0,
      mismatch: 0,
      ignored: 0,
    };

    const byMethod: Record<string, number> = {
      GET: 0,
      POST: 0,
      PUT: 0,
      PATCH: 0,
      DELETE: 0,
    };

    let totalMismatches = 0;
    const mismatchesByType: Record<string, number> = {};

    for (const contract of contracts) {
      const statusKey = contract.status;
      const methodKey = contract.method;
      if (statusKey in byStatus) {
        byStatus[statusKey] = (byStatus[statusKey] || 0) + 1;
      }
      if (methodKey in byMethod) {
        byMethod[methodKey] = (byMethod[methodKey] || 0) + 1;
      }
      totalMismatches += contract.mismatchCount;

      for (const mismatch of contract.mismatches || []) {
        mismatchesByType[mismatch.mismatchType] = (mismatchesByType[mismatch.mismatchType] || 0) + 1;
      }
    }

    return {
      totalContracts: contracts.length,
      byStatus,
      byMethod,
      totalMismatches,
      mismatchesByType,
    };
  }

  /**
   * Verify a contract
   */
  async verifyContract(id: string): Promise<void> {
    await this.changeContractStatus(id, 'verified');
  }

  /**
   * Ignore a contract
   */
  async ignoreContract(id: string): Promise<void> {
    await this.changeContractStatus(id, 'ignored');
  }

  /**
   * Change contract status
   */
  private async changeContractStatus(id: string, newStatus: string): Promise<void> {
    const contractsDir = path.join(this.driftDir, 'contracts');
    const statusDirs = ['discovered', 'verified', 'mismatch', 'ignored'];

    let foundContract: any = null;

    // Find the contract
    for (const status of statusDirs) {
      const filePath = path.join(contractsDir, status, 'contracts.json');
      
      if (!(await fileExists(filePath))) {
        continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const contractFile = JSON.parse(content);

        const contractIndex = contractFile.contracts.findIndex((c: any) => c.id === id);
        if (contractIndex !== -1) {
          foundContract = contractFile.contracts[contractIndex];

          // Remove from current file
          contractFile.contracts.splice(contractIndex, 1);
          contractFile.lastUpdated = new Date().toISOString();

          if (contractFile.contracts.length === 0) {
            await fs.unlink(filePath);
          } else {
            await fs.writeFile(filePath, JSON.stringify(contractFile, null, 2));
          }
          break;
        }
      } catch (error) {
        console.error(`Error reading contract file ${filePath}:`, error);
      }
    }

    if (!foundContract) {
      throw new Error(`Contract not found: ${id}`);
    }

    // Add to new status directory
    const targetDir = path.join(contractsDir, newStatus);
    const targetPath = path.join(targetDir, 'contracts.json');

    await fs.mkdir(targetDir, { recursive: true });

    let targetFile: any;
    if (await fileExists(targetPath)) {
      const content = await fs.readFile(targetPath, 'utf-8');
      targetFile = JSON.parse(content);
    } else {
      targetFile = {
        version: '1.0.0',
        status: newStatus,
        contracts: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    // Update metadata
    foundContract.metadata = {
      ...foundContract.metadata,
      lastSeen: new Date().toISOString(),
    };

    if (newStatus === 'verified') {
      foundContract.metadata.verifiedAt = new Date().toISOString();
    }

    targetFile.contracts.push(foundContract);
    targetFile.lastUpdated = new Date().toISOString();

    await fs.writeFile(targetPath, JSON.stringify(targetFile, null, 2));
  }

  /**
   * Filter contracts based on query
   */
  private filterContracts(
    contracts: DashboardContract[],
    query?: { status?: string; method?: string; hasMismatches?: boolean; search?: string }
  ): DashboardContract[] {
    if (!query) {return contracts;}

    return contracts.filter((contract) => {
      if (query.status && contract.status !== query.status) {return false;}
      if (query.method && contract.method !== query.method) {return false;}
      if (query.hasMismatches !== undefined) {
        const hasMismatches = contract.mismatchCount > 0;
        if (query.hasMismatches !== hasMismatches) {return false;}
      }
      if (query.search && !contract.endpoint.toLowerCase().includes(query.search.toLowerCase())) {
        return false;
      }
      return true;
    });
  }

  // ==========================================================================
  // Trend / History Methods
  // ==========================================================================

  /**
   * Get trend summary for pattern regressions and improvements
   * OPTIMIZED: Uses DataLake trends view for instant response
   */
  async getTrends(period: '7d' | '30d' | '90d' = '7d'): Promise<TrendSummary | null> {
    // OPTIMIZATION: Try DataLake trends view first
    if (await this.initializeLake()) {
      try {
        const trendsView = await this.dataLake.views.getTrendsView();
        if (trendsView) {
          return this.trendsViewToSummary(trendsView, period);
        }
      } catch {
        // Fall through to direct file reading
      }
    }

    // Fallback: Read from history snapshots directly
    const historyDir = path.join(this.driftDir, 'history', 'snapshots');
    
    if (!(await fileExists(historyDir))) {
      return null;
    }

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    // Get snapshots
    const files = await fs.readdir(historyDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort();

    if (jsonFiles.length < 2) {
      return null; // Need at least 2 snapshots to calculate trends
    }

    // Get latest and comparison snapshot
    const latestFile = jsonFiles[jsonFiles.length - 1]!;
    const latestContent = await fs.readFile(path.join(historyDir, latestFile), 'utf-8');
    const latestSnapshot = JSON.parse(latestContent) as HistorySnapshot;

    // Find snapshot closest to start date
    const startDateStr = startDate.toISOString().split('T')[0]!;
    let comparisonFile = jsonFiles[0]!;
    for (const file of jsonFiles) {
      const fileDate = file.replace('.json', '');
      if (fileDate <= startDateStr) {
        comparisonFile = file;
      } else {
        break;
      }
    }

    const comparisonContent = await fs.readFile(path.join(historyDir, comparisonFile), 'utf-8');
    const comparisonSnapshot = JSON.parse(comparisonContent) as HistorySnapshot;

    // Calculate trends
    return this.calculateTrendSummary(latestSnapshot, comparisonSnapshot, period);
  }

  /**
   * Convert TrendsView from DataLake to TrendSummary
   * TrendsView has: generatedAt, period, overallTrend, healthDelta, regressions, improvements, stableCount, categoryTrends
   */
  private trendsViewToSummary(
    view: TrendsView,
    period: '7d' | '30d' | '90d'
  ): TrendSummary {
    // Calculate date range from period
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    // Convert TrendItem[] to PatternTrend[]
    const regressions: PatternTrend[] = (view.regressions || []).map(r => ({
      patternId: r.patternId,
      patternName: r.patternName,
      category: r.category,
      type: 'regression' as const,
      metric: r.metric,
      previousValue: r.previousValue,
      currentValue: r.currentValue,
      change: r.change,
      changePercent: r.previousValue > 0 ? (r.change / r.previousValue) * 100 : 0,
      severity: r.severity,
      firstSeen: view.generatedAt,
      details: `${r.metric} changed from ${r.previousValue} to ${r.currentValue}`,
    }));

    const improvements: PatternTrend[] = (view.improvements || []).map(i => ({
      patternId: i.patternId,
      patternName: i.patternName,
      category: i.category,
      type: 'improvement' as const,
      metric: i.metric,
      previousValue: i.previousValue,
      currentValue: i.currentValue,
      change: i.change,
      changePercent: i.previousValue > 0 ? (i.change / i.previousValue) * 100 : 0,
      severity: i.severity,
      firstSeen: view.generatedAt,
      details: `${i.metric} improved from ${i.previousValue} to ${i.currentValue}`,
    }));

    // Convert CategoryTrend to TrendSummary format
    const categoryTrends: TrendSummary['categoryTrends'] = {};
    for (const [category, trend] of Object.entries(view.categoryTrends || {})) {
      categoryTrends[category] = {
        trend: trend.trend,
        avgConfidenceChange: trend.avgConfidenceChange,
        complianceChange: trend.complianceChange,
      };
    }

    return {
      period,
      startDate: startDate.toISOString().split('T')[0]!,
      endDate: now.toISOString().split('T')[0]!,
      regressions,
      improvements,
      stable: view.stableCount || 0,
      overallTrend: view.overallTrend,
      healthDelta: view.healthDelta || 0,
      categoryTrends,
    };
  }

  /**
   * Get historical snapshots for charting
   */
  async getSnapshots(limit: number = 30): Promise<HistorySnapshot[]> {
    const historyDir = path.join(this.driftDir, 'history', 'snapshots');
    
    if (!(await fileExists(historyDir))) {
      return [];
    }

    const files = await fs.readdir(historyDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().slice(-limit);

    const snapshots: HistorySnapshot[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(historyDir, file), 'utf-8');
        snapshots.push(JSON.parse(content) as HistorySnapshot);
      } catch (error) {
        console.error(`Error reading snapshot ${file}:`, error);
      }
    }

    return snapshots;
  }

  /**
   * Calculate trend summary between two snapshots
   */
  private calculateTrendSummary(
    current: HistorySnapshot,
    previous: HistorySnapshot,
    period: '7d' | '30d' | '90d'
  ): TrendSummary {
    const regressions: PatternTrend[] = [];
    const improvements: PatternTrend[] = [];
    const previousMap = new Map(previous.patterns.map(p => [p.patternId, p]));

    // Thresholds
    const CONFIDENCE_THRESHOLD = 0.05;
    const COMPLIANCE_THRESHOLD = 0.10;
    const OUTLIER_THRESHOLD = 3;

    for (const currentPattern of current.patterns) {
      const prevPattern = previousMap.get(currentPattern.patternId);
      if (!prevPattern) {continue;}

      // Check confidence change
      const confidenceChange = currentPattern.confidence - prevPattern.confidence;
      if (Math.abs(confidenceChange) >= CONFIDENCE_THRESHOLD) {
        const trend: PatternTrend = {
          patternId: currentPattern.patternId,
          patternName: currentPattern.patternName,
          category: currentPattern.category,
          type: confidenceChange < 0 ? 'regression' : 'improvement',
          metric: 'confidence',
          previousValue: prevPattern.confidence,
          currentValue: currentPattern.confidence,
          change: confidenceChange,
          changePercent: (confidenceChange / prevPattern.confidence) * 100,
          severity: confidenceChange <= -0.15 ? 'critical' : confidenceChange < 0 ? 'warning' : 'info',
          firstSeen: previous.timestamp,
          details: `Confidence ${confidenceChange < 0 ? 'dropped' : 'improved'} from ${(prevPattern.confidence * 100).toFixed(0)}% to ${(currentPattern.confidence * 100).toFixed(0)}%`,
        };
        
        if (trend.type === 'regression') {
          regressions.push(trend);
        } else {
          improvements.push(trend);
        }
      }

      // Check compliance change
      const complianceChange = currentPattern.complianceRate - prevPattern.complianceRate;
      if (Math.abs(complianceChange) >= COMPLIANCE_THRESHOLD) {
        const trend: PatternTrend = {
          patternId: currentPattern.patternId,
          patternName: currentPattern.patternName,
          category: currentPattern.category,
          type: complianceChange < 0 ? 'regression' : 'improvement',
          metric: 'compliance',
          previousValue: prevPattern.complianceRate,
          currentValue: currentPattern.complianceRate,
          change: complianceChange,
          changePercent: prevPattern.complianceRate > 0 ? (complianceChange / prevPattern.complianceRate) * 100 : 0,
          severity: complianceChange <= -0.20 ? 'critical' : complianceChange < 0 ? 'warning' : 'info',
          firstSeen: previous.timestamp,
          details: `Compliance ${complianceChange < 0 ? 'dropped' : 'improved'} from ${(prevPattern.complianceRate * 100).toFixed(0)}% to ${(currentPattern.complianceRate * 100).toFixed(0)}%`,
        };
        
        if (trend.type === 'regression') {
          regressions.push(trend);
        } else {
          improvements.push(trend);
        }
      }

      // Check outlier increase
      const outlierChange = currentPattern.outlierCount - prevPattern.outlierCount;
      if (outlierChange >= OUTLIER_THRESHOLD) {
        regressions.push({
          patternId: currentPattern.patternId,
          patternName: currentPattern.patternName,
          category: currentPattern.category,
          type: 'regression',
          metric: 'outliers',
          previousValue: prevPattern.outlierCount,
          currentValue: currentPattern.outlierCount,
          change: outlierChange,
          changePercent: prevPattern.outlierCount > 0 ? (outlierChange / prevPattern.outlierCount) * 100 : 100,
          severity: outlierChange >= 10 ? 'critical' : 'warning',
          firstSeen: previous.timestamp,
          details: `${outlierChange} new outliers (${prevPattern.outlierCount} → ${currentPattern.outlierCount})`,
        });
      }
    }

    // Calculate category trends
    const categoryTrends: TrendSummary['categoryTrends'] = {};
    const categories = new Set([
      ...Object.keys(current.summary.byCategory),
      ...Object.keys(previous.summary.byCategory),
    ]);

    for (const category of categories) {
      const currentCat = current.summary.byCategory[category];
      const prevCat = previous.summary.byCategory[category];

      if (currentCat && prevCat) {
        const avgConfidenceChange = currentCat.avgConfidence - prevCat.avgConfidence;
        const complianceChange = currentCat.complianceRate - prevCat.complianceRate;

        categoryTrends[category] = {
          trend: avgConfidenceChange > 0.02 ? 'improving' 
               : avgConfidenceChange < -0.02 ? 'declining' 
               : 'stable',
          avgConfidenceChange,
          complianceChange,
        };
      }
    }

    // Calculate overall trend
    const healthDelta = current.summary.overallComplianceRate - previous.summary.overallComplianceRate;
    const overallTrend = healthDelta > 0.02 ? 'improving' 
                       : healthDelta < -0.02 ? 'declining' 
                       : 'stable';

    // Count stable patterns
    const changedPatternIds = new Set([...regressions, ...improvements].map(t => t.patternId));
    const stableCount = current.patterns.filter(p => !changedPatternIds.has(p.patternId)).length;

    return {
      period,
      startDate: previous.date,
      endDate: current.date,
      regressions,
      improvements,
      stable: stableCount,
      overallTrend,
      healthDelta,
      categoryTrends,
    };
  }
}
