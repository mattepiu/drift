/**
 * Quality Gates API Handler
 *
 * Server-side API for quality gates dashboard integration.
 * 
 * @license Apache-2.0
 */

import type { Request, Response } from 'express';

import {
  GateOrchestrator,
  PolicyLoader,
  GateRunStore,
  type QualityGateOptions,
  type QualityGateResult,
  type GateRunRecord,
  type GateId,
} from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

interface QualityGatesRequest {
  action: 'latest' | 'history' | 'policies' | 'run' | 'policy';
  policy?: string;
  files?: string[];
  limit?: number;
  policyId?: string;
}

// ============================================================================
// Handler
// ============================================================================

export async function handleQualityGatesRequest(
  req: Request,
  res: Response,
  projectRoot: string
): Promise<void> {
  try {
    const action = (req.query['action'] as string) || (req.body?.['action'] as string) || 'latest';
    
    switch (action) {
      case 'latest':
        await handleLatest(res, projectRoot);
        break;
      case 'history':
        await handleHistory(req, res, projectRoot);
        break;
      case 'policies':
        await handlePolicies(res, projectRoot);
        break;
      case 'run':
        await handleRun(req, res, projectRoot);
        break;
      case 'policy':
        await handleGetPolicy(req, res, projectRoot);
        break;
      default:
        res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
        });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Get the latest quality gate run result.
 */
async function handleLatest(res: Response, projectRoot: string): Promise<void> {
  const store = new GateRunStore(projectRoot);
  const recentRuns = await store.getRecent(1);
  const latestRun = recentRuns[0] ?? null;

  if (!latestRun) {
    res.json({
      success: true,
      data: null,
    });
    return;
  }

  // Convert stored run to full result format
  const result = await expandRunRecord(latestRun, projectRoot);
  
  res.json({
    success: true,
    data: result,
  });
}

/**
 * Get quality gate run history.
 */
async function handleHistory(
  req: Request,
  res: Response,
  projectRoot: string
): Promise<void> {
  const limit = parseInt(req.query['limit'] as string) || 10;
  const branch = req.query['branch'] as string | undefined;

  const store = new GateRunStore(projectRoot);
  const runs = branch 
    ? await store.getByBranch(branch, limit)
    : await store.getRecent(limit);

  res.json({
    success: true,
    data: {
      runs,
      total: runs.length,
    },
  });
}

/**
 * Get available policies.
 */
async function handlePolicies(res: Response, projectRoot: string): Promise<void> {
  const loader = new PolicyLoader(projectRoot);
  const policies = await loader.listAll();

  const simplifiedPolicies = policies.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    version: p.version,
  }));

  res.json({
    success: true,
    data: {
      policies: simplifiedPolicies,
    },
  });
}

/**
 * Run quality gates.
 */
async function handleRun(
  req: Request,
  res: Response,
  projectRoot: string
): Promise<void> {
  const { policy, files } = req.body as QualityGatesRequest;

  const options: QualityGateOptions = {
    projectRoot,
    policy: policy || 'default',
    files: files || [],
    branch: 'main', // Could be detected from git
    ci: false,
    saveHistory: true,
  };

  const orchestrator = new GateOrchestrator(projectRoot);
  const result = await orchestrator.run(options);

  res.json({
    success: true,
    data: result,
  });
}

/**
 * Get a specific policy by ID.
 */
async function handleGetPolicy(
  req: Request,
  res: Response,
  projectRoot: string
): Promise<void> {
  const policyId = req.query['policyId'] as string;

  if (!policyId) {
    res.status(400).json({
      success: false,
      error: 'policyId is required',
    });
    return;
  }

  const loader = new PolicyLoader(projectRoot);
  
  try {
    const policy = await loader.load(policyId);
    res.json({
      success: true,
      data: policy,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: `Policy not found: ${policyId}`,
    });
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Expand a stored run record to a full result format.
 * This reconstructs the full result from the stored summary.
 */
async function expandRunRecord(
  run: GateRunRecord,
  projectRoot: string
): Promise<QualityGateResult> {
  const loader = new PolicyLoader(projectRoot);
  let policyName = run.policyId;
  
  try {
    const policy = await loader.load(run.policyId);
    policyName = policy.name;
  } catch {
    // Use ID as name if policy not found
  }

  // Reconstruct gate results from summary
  const gates: Record<string, {
    gateId: string;
    gateName: string;
    status: 'passed' | 'failed' | 'warned' | 'skipped' | 'errored';
    passed: boolean;
    score: number;
    summary: string;
    violations: never[];
    warnings: never[];
    executionTimeMs: number;
    details: Record<string, unknown>;
  }> = {};

  for (const [gateId, gateSummary] of Object.entries(run.gates)) {
    gates[gateId] = {
      gateId,
      gateName: gateId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      status: gateSummary.passed ? 'passed' : 'failed',
      passed: gateSummary.passed,
      score: gateSummary.score,
      summary: gateSummary.passed ? 'Passed' : 'Failed',
      violations: [],
      warnings: [],
      executionTimeMs: 0,
      details: {},
    };
  }

  return {
    passed: run.passed,
    status: run.passed ? 'passed' : 'failed',
    score: run.score,
    summary: run.passed ? 'All gates passed' : 'Some gates failed',
    gates: gates as QualityGateResult['gates'],
    violations: [],
    warnings: [],
    policy: {
      id: run.policyId,
      name: policyName,
    },
    metadata: {
      executionTimeMs: run.executionTimeMs,
      filesChecked: 0,
      gatesRun: Object.keys(run.gates) as GateId[],
      gatesSkipped: [] as GateId[],
      timestamp: run.timestamp,
      branch: run.branch,
      ...(run.commitSha ? { commitSha: run.commitSha } : {}),
      ci: run.ci,
    },
    exitCode: run.passed ? 0 : 1,
  };
}

// ============================================================================
// Express Router Setup
// ============================================================================

import { Router } from 'express';

export function createQualityGatesRouter(projectRoot: string): Router {
  const router = Router();

  router.get('/quality-gates', (req, res) => {
    handleQualityGatesRequest(req, res, projectRoot);
  });

  router.post('/quality-gates', (req, res) => {
    handleQualityGatesRequest(req, res, projectRoot);
  });

  return router;
}
