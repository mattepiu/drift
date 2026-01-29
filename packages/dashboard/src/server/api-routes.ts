/**
 * API Routes for the Drift Dashboard
 *
 * Provides REST API endpoints for patterns, violations, files, stats, and config.
 *
 * @requirements 8.1 - GET `/api/patterns` to list all patterns
 * @requirements 8.2 - GET `/api/patterns/:id` to get pattern details with locations
 * @requirements 8.3 - POST `/api/patterns/:id/approve` to approve a pattern
 * @requirements 8.4 - POST `/api/patterns/:id/ignore` to ignore a pattern
 * @requirements 8.5 - DELETE `/api/patterns/:id` to delete a pattern
 * @requirements 8.6 - GET `/api/violations` to list all violations
 * @requirements 8.7 - GET `/api/files` to get the file tree
 * @requirements 8.8 - GET `/api/files/:path` to get patterns and violations for a specific file
 * @requirements 8.9 - GET `/api/stats` to get overview statistics
 * @requirements 8.10 - GET `/api/config` to get configuration
 * @requirements 8.11 - PUT `/api/config` to update configuration
 * @requirements 8.12 - Return appropriate HTTP status codes and error messages
 */

import { getProjectRegistry } from 'driftdetect-core';
import { Router, type Request, type Response, type NextFunction } from 'express';

import { DriftDataReader, type PatternQuery, type ViolationQuery, type DriftConfig } from './drift-data-reader.js';
import { createGalaxyDataTransformer } from './galaxy-data-transformer.js';
import { handleQualityGatesRequest } from './quality-gates-api.js';

// ============================================================================
// Types
// ============================================================================

export interface ApiError extends Error {
  statusCode: number;
}

// ============================================================================
// Error Classes
// ============================================================================

export class NotFoundError extends Error implements ApiError {
  statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends Error implements ApiError {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class InternalServerError extends Error implements ApiError {
  statusCode = 500;
  constructor(message: string) {
    super(message);
    this.name = 'InternalServerError';
  }
}

// ============================================================================
// API Routes Factory
// ============================================================================

/**
 * Create API routes for the dashboard
 * @param reader - DriftDataReader instance for accessing drift data
 */
export function createApiRoutes(reader: DriftDataReader): Router {
  const router = Router();

  // ==========================================================================
  // Pattern Routes
  // ==========================================================================

  /**
   * GET /api/patterns - List all patterns with optional filters
   * @requirements 8.1
   */
  router.get('/patterns', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query: PatternQuery = {};
      
      if (req.query['category']) {
        query.category = req.query['category'] as string;
      }
      if (req.query['status']) {
        query.status = req.query['status'] as string;
      }
      if (req.query['minConfidence']) {
        query.minConfidence = parseFloat(req.query['minConfidence'] as string);
      }
      if (req.query['search']) {
        query.search = req.query['search'] as string;
      }

      const patterns = await reader.getPatterns(query);
      res.json(patterns);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/patterns/:id - Get pattern with locations
   * @requirements 8.2
   */
  router.get('/patterns/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new BadRequestError('Pattern ID is required');
      }

      const pattern = await reader.getPattern(id);
      
      if (!pattern) {
        throw new NotFoundError(`Pattern not found: ${id}`);
      }

      res.json(pattern);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/patterns/:id/approve - Approve a pattern
   * @requirements 8.3
   */
  router.post('/patterns/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new BadRequestError('Pattern ID is required');
      }

      await reader.approvePattern(id);
      res.json({ success: true, message: `Pattern ${id} approved` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        next(new NotFoundError(error.message));
      } else {
        next(error);
      }
    }
  });

  /**
   * POST /api/patterns/:id/ignore - Ignore a pattern
   * @requirements 8.4
   */
  router.post('/patterns/:id/ignore', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new BadRequestError('Pattern ID is required');
      }

      await reader.ignorePattern(id);
      res.json({ success: true, message: `Pattern ${id} ignored` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        next(new NotFoundError(error.message));
      } else {
        next(error);
      }
    }
  });

  /**
   * POST /api/patterns/bulk-approve - Bulk approve multiple patterns
   * Accepts an array of pattern IDs to approve at once
   */
  router.post('/patterns/bulk-approve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ids } = req.body as { ids: string[] };
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new BadRequestError('Array of pattern IDs is required');
      }

      const results: { id: string; success: boolean; error?: string }[] = [];
      
      for (const id of ids) {
        try {
          await reader.approvePattern(id);
          results.push({ id, success: true });
        } catch (error) {
          results.push({ 
            id, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      res.json({ 
        success: true, 
        message: `Approved ${successCount} of ${ids.length} patterns`,
        results 
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/patterns/:id - Delete a pattern
   * @requirements 8.5
   */
  router.delete('/patterns/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new BadRequestError('Pattern ID is required');
      }

      await reader.deletePattern(id);
      res.json({ success: true, message: `Pattern ${id} deleted` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        next(new NotFoundError(error.message));
      } else {
        next(error);
      }
    }
  });

  // ==========================================================================
  // Violation Routes
  // ==========================================================================

  /**
   * GET /api/violations - List all violations with optional filters
   * @requirements 8.6
   */
  router.get('/violations', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query: ViolationQuery = {};
      
      if (req.query['severity']) {
        query.severity = req.query['severity'] as string;
      }
      if (req.query['file']) {
        query.file = req.query['file'] as string;
      }
      if (req.query['patternId']) {
        query.patternId = req.query['patternId'] as string;
      }
      if (req.query['search']) {
        query.search = req.query['search'] as string;
      }

      const violations = await reader.getViolations(query);
      res.json(violations);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/snippet - Get code snippet for a file location
   */
  router.get('/snippet', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.query['file'] as string;
      const line = parseInt(req.query['line'] as string, 10);
      const context = parseInt(req.query['context'] as string, 10) || 3;
      
      if (!file) {
        throw new BadRequestError('File path is required');
      }
      if (isNaN(line)) {
        throw new BadRequestError('Line number is required');
      }

      const snippet = await reader.getCodeSnippet(file, line, context);
      
      if (!snippet) {
        throw new NotFoundError(`Could not read file: ${file}`);
      }

      res.json(snippet);
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // File Routes
  // ==========================================================================

  /**
   * GET /api/files - Get file tree
   * @requirements 8.7
   */
  router.get('/files', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const fileTree = await reader.getFileTree();
      res.json(fileTree);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/files/* - Get file details (wildcard path)
   * @requirements 8.8
   */
  router.get('/files/*', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract the file path from the wildcard
      const filePath = req.params[0];
      
      if (!filePath) {
        throw new BadRequestError('File path is required');
      }

      const fileDetails = await reader.getFileDetails(filePath);
      
      if (!fileDetails) {
        throw new NotFoundError(`File not found or has no patterns/violations: ${filePath}`);
      }

      res.json(fileDetails);
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // Stats Routes
  // ==========================================================================

  /**
   * GET /api/stats - Get dashboard statistics
   * @requirements 8.9
   */
  router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await reader.getStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // Config Routes
  // ==========================================================================

  /**
   * GET /api/config - Get configuration
   * @requirements 8.10
   */
  router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await reader.getConfig();
      res.json(config);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/config - Update configuration
   * @requirements 8.11
   */
  router.put('/config', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const partialConfig = req.body as Partial<DriftConfig>;
      
      if (!partialConfig || typeof partialConfig !== 'object') {
        throw new BadRequestError('Invalid configuration format');
      }

      await reader.updateConfig(partialConfig);
      const updatedConfig = await reader.getConfig();
      res.json(updatedConfig);
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // Contract Routes (BE↔FE mismatch detection)
  // ==========================================================================

  /**
   * GET /api/contracts - List all contracts with optional filters
   */
  router.get('/contracts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query: { status?: string; method?: string; hasMismatches?: boolean; search?: string } = {};
      
      if (req.query['status']) {
        query.status = req.query['status'] as string;
      }
      if (req.query['method']) {
        query.method = req.query['method'] as string;
      }
      if (req.query['hasMismatches'] !== undefined) {
        query.hasMismatches = req.query['hasMismatches'] === 'true';
      }
      if (req.query['search']) {
        query.search = req.query['search'] as string;
      }

      const contracts = await reader.getContracts(query);
      res.json(contracts);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/contracts/stats - Get contract statistics
   */
  router.get('/contracts/stats', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await reader.getContractStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/contracts/:id - Get contract details
   */
  router.get('/contracts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new BadRequestError('Contract ID is required');
      }

      const contract = await reader.getContract(id);
      
      if (!contract) {
        throw new NotFoundError(`Contract not found: ${id}`);
      }

      res.json(contract);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/contracts/:id/verify - Verify a contract
   */
  router.post('/contracts/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new BadRequestError('Contract ID is required');
      }

      await reader.verifyContract(id);
      res.json({ success: true, message: `Contract ${id} verified` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        next(new NotFoundError(error.message));
      } else {
        next(error);
      }
    }
  });

  /**
   * POST /api/contracts/:id/ignore - Ignore a contract
   */
  router.post('/contracts/:id/ignore', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        throw new BadRequestError('Contract ID is required');
      }

      await reader.ignoreContract(id);
      res.json({ success: true, message: `Contract ${id} ignored` });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        next(new NotFoundError(error.message));
      } else {
        next(error);
      }
    }
  });

  // ==========================================================================
  // Trend / History Routes
  // ==========================================================================

  /**
   * GET /api/trends - Get pattern trend summary
   * Query params: period (7d, 30d, 90d)
   */
  router.get('/trends', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const period = (req.query['period'] as '7d' | '30d' | '90d') || '7d';
      
      if (!['7d', '30d', '90d'].includes(period)) {
        throw new BadRequestError('Invalid period. Use 7d, 30d, or 90d');
      }

      const trends = await reader.getTrends(period);
      
      if (!trends) {
        res.json({
          message: 'Not enough history data. Run more scans to see trends.',
          period,
          regressions: [],
          improvements: [],
          stable: 0,
          overallTrend: 'stable',
          healthDelta: 0,
          categoryTrends: {},
        });
        return;
      }

      res.json(trends);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/trends/snapshots - Get historical snapshots for charting
   * Query params: limit (default 30)
   */
  router.get('/trends/snapshots', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseInt(req.query['limit'] as string, 10) || 30;
      const snapshots = await reader.getSnapshots(limit);
      res.json(snapshots);
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // Galaxy Routes (3D Database Visualization)
  // ==========================================================================

  /**
   * GET /api/galaxy - Get Galaxy visualization data
   * 
   * Transforms boundary scanner and call graph data into the format
   * required by the 3D Galaxy visualization.
   */
  router.get('/galaxy', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const transformer = createGalaxyDataTransformer(reader.directory);
      const galaxyData = await transformer.transform();
      res.json(galaxyData);
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // Project Routes (Multi-project management)
  // ==========================================================================

  /**
   * GET /api/projects - List all registered projects
   */
  router.get('/projects', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const registry = await getProjectRegistry();
      const projects = registry.getValid();
      const activeProject = registry.getActive();

      // Sort by last accessed
      projects.sort(
        (a: typeof projects[0], b: typeof projects[0]) =>
          new Date(b.lastAccessedAt).getTime() -
          new Date(a.lastAccessedAt).getTime()
      );

      res.json({
        totalProjects: registry.count,
        activeProject: activeProject?.name ?? null,
        projects: projects.map((p: typeof projects[0]) => ({
          id: p.id,
          name: p.name,
          path: p.path,
          language: p.language,
          framework: p.framework,
          health: p.health,
          healthScore: p.healthScore,
          lastAccessedAt: p.lastAccessedAt,
          isActive: p.id === activeProject?.id,
          isValid: p.isValid !== false,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/projects/switch - Switch active project
   */
  router.post('/projects/switch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.body as { projectId: string };

      if (!projectId) {
        throw new BadRequestError('Project ID is required');
      }

      const registry = await getProjectRegistry();
      const project = registry.get(projectId);

      if (!project) {
        throw new NotFoundError(`Project not found: ${projectId}`);
      }

      await registry.setActive(projectId);

      res.json({
        success: true,
        message: `Switched to ${project.name}`,
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/projects/:id - Get project details
   */
  router.get('/projects/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new BadRequestError('Project ID is required');
      }

      const registry = await getProjectRegistry();
      const project = registry.get(id);

      if (!project) {
        throw new NotFoundError(`Project not found: ${id}`);
      }

      const activeProject = registry.getActive();

      res.json({
        ...project,
        isActive: project.id === activeProject?.id,
      });
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // Quality Gates Routes
  // ==========================================================================

  /**
   * GET /api/quality-gates - Quality gates API
   * Actions: latest, history, policies, policy
   */
  router.get('/quality-gates', (req: Request, res: Response) => {
    handleQualityGatesRequest(req, res, reader.directory);
  });

  /**
   * POST /api/quality-gates - Quality gates API (for run action)
   * Actions: run
   */
  router.post('/quality-gates', (req: Request, res: Response) => {
    handleQualityGatesRequest(req, res, reader.directory);
  });

  return router;
}

// ============================================================================
// Error Handling Middleware
// ============================================================================

/**
 * Error handling middleware for API routes
 * @requirements 8.12 - Return appropriate HTTP status codes and error messages
 */
export function errorHandler(
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Determine status code
  const statusCode = 'statusCode' in err ? err.statusCode : 500;

  // Log server errors
  if (statusCode >= 500) {
    console.error('Server error:', err);
  }

  // Send JSON error response
  res.status(statusCode).json({
    error: err.name || 'Error',
    message: err.message || 'An unexpected error occurred',
    statusCode,
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NotFound',
    message: `Route not found: ${req.method} ${req.path}`,
    statusCode: 404,
  });
}
