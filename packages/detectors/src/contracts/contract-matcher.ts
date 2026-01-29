/**
 * Contract Matcher
 *
 * Correlates backend endpoints with frontend API calls to create contracts.
 * Uses a weighted multi-factor similarity approach (inspired by near-duplicate.ts)
 * to dynamically match paths without hardcoded logic.
 */

import * as crypto from 'node:crypto';

import type { ExtractedEndpoint, ExtractedApiCall } from './types.js';
import type {
  Contract,
  ContractField,
  FieldMismatch,
  BackendEndpoint,
  FrontendApiCall,
  ContractConfidence,
  HttpMethod,
} from 'driftdetect-core';

// ============================================================================
// Types
// ============================================================================

export interface MatchingResult {
  contracts: Contract[];
  unmatchedBackend: ExtractedEndpoint[];
  unmatchedFrontend: ExtractedApiCall[];
}

export interface ContractMatcherConfig {
  minSimilarity: number;
  minConfidence: number;
  fuzzyPathMatching: boolean;
  detectTypeMismatches: boolean;
  weights: PathSimilarityWeights;
}

export interface PathSimilarityWeights {
  segmentNames: number;
  segmentCount: number;
  suffixMatch: number;
  resourceName: number;
  parameterPositions: number;
}

export interface PathSimilarityBreakdown {
  segmentNames: number;
  segmentCount: number;
  suffixMatch: number;
  resourceName: number;
  parameterPositions: number;
}


const DEFAULT_WEIGHTS: PathSimilarityWeights = {
  segmentNames: 0.25,
  segmentCount: 0.10,
  suffixMatch: 0.30,
  resourceName: 0.25,
  parameterPositions: 0.10,
};

const DEFAULT_CONFIG: ContractMatcherConfig = {
  minSimilarity: 0.65,
  minConfidence: 0.5,
  fuzzyPathMatching: true,
  detectTypeMismatches: true,
  weights: DEFAULT_WEIGHTS,
};

// ============================================================================
// Path Normalization
// ============================================================================

function normalizePath(path: string): string {
  return path
    .replace(/\{(\w+)\}/g, ':param')
    .replace(/<(\w+)>/g, ':param')
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/:(\w+)/g, ':param')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase();
}

function getSegments(path: string): string[] {
  const normalized = normalizePath(path);
  return normalized.split('/').filter(Boolean);
}

function isCommonPrefix(segment: string): boolean {
  return /^(api|v\d+|rest|graphql|public|private|internal|external)$/i.test(segment);
}

function getMeaningfulSegments(path: string): string[] {
  const segments = getSegments(path);
  const meaningful: string[] = [];
  let foundMeaningful = false;
  for (const seg of segments) {
    if (foundMeaningful || !isCommonPrefix(seg)) {
      foundMeaningful = true;
      meaningful.push(seg);
    }
  }
  return meaningful;
}

function getResourceName(path: string): string | null {
  const segments = getMeaningfulSegments(path);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && seg !== ':param') {return seg;}
  }
  return null;
}


// ============================================================================
// Similarity Calculations
// ============================================================================

function jaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) {return 1.0;}
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

function calculateSegmentNamesSimilarity(backendPath: string, frontendPath: string): number {
  const backendSegs = new Set(getMeaningfulSegments(backendPath).filter(s => s !== ':param'));
  const frontendSegs = new Set(getMeaningfulSegments(frontendPath).filter(s => s !== ':param'));
  return jaccardSimilarity(backendSegs, frontendSegs);
}

function calculateSegmentCountSimilarity(backendPath: string, frontendPath: string): number {
  const backendCount = getMeaningfulSegments(backendPath).length;
  const frontendCount = getMeaningfulSegments(frontendPath).length;
  if (backendCount === 0 && frontendCount === 0) {return 1.0;}
  const maxCount = Math.max(backendCount, frontendCount);
  return 1 - (Math.abs(backendCount - frontendCount) / maxCount);
}

function calculateSuffixMatchSimilarity(backendPath: string, frontendPath: string): number {
  const backendSegs = getMeaningfulSegments(backendPath);
  const frontendSegs = getMeaningfulSegments(frontendPath);
  if (backendSegs.length === 0 || backendSegs.length > frontendSegs.length) {return 0;}
  const offset = frontendSegs.length - backendSegs.length;
  let matches = 0;
  for (let i = 0; i < backendSegs.length; i++) {
    const bSeg = backendSegs[i];
    const fSeg = frontendSegs[offset + i];
    if (bSeg === fSeg) {matches++;}
    else if (bSeg === ':param' || fSeg === ':param') {matches += 0.7;}
  }
  return matches / backendSegs.length;
}

function calculateResourceNameSimilarity(backendPath: string, frontendPath: string): number {
  const backendResource = getResourceName(backendPath);
  const frontendResource = getResourceName(frontendPath);
  if (!backendResource && !frontendResource) {return 1.0;}
  if (!backendResource || !frontendResource) {return 0;}
  if (backendResource === frontendResource) {return 1.0;}
  const shorter = backendResource.length < frontendResource.length ? backendResource : frontendResource;
  const longer = backendResource.length < frontendResource.length ? frontendResource : backendResource;
  if (longer.startsWith(shorter) || longer.endsWith(shorter)) {return 0.8;}
  return 0;
}

function calculateParameterPositionsSimilarity(backendPath: string, frontendPath: string): number {
  const backendSegs = getMeaningfulSegments(backendPath);
  const frontendSegs = getMeaningfulSegments(frontendPath);
  const backendParamPositions = new Set(
    backendSegs.map((s, i) => s === ':param' ? i / backendSegs.length : -1).filter(p => p >= 0)
  );
  const frontendParamPositions = new Set(
    frontendSegs.map((s, i) => s === ':param' ? i / frontendSegs.length : -1).filter(p => p >= 0)
  );
  if (backendParamPositions.size === 0 && frontendParamPositions.size === 0) {return 1.0;}
  let matches = 0;
  const total = Math.max(backendParamPositions.size, frontendParamPositions.size);
  for (const bPos of backendParamPositions) {
    for (const fPos of frontendParamPositions) {
      if (Math.abs(bPos - fPos) < 0.2) { matches++; break; }
    }
  }
  return total > 0 ? matches / total : 1.0;
}


// ============================================================================
// Overall Similarity
// ============================================================================

function calculatePathSimilarityBreakdown(backendPath: string, frontendPath: string): PathSimilarityBreakdown {
  return {
    segmentNames: calculateSegmentNamesSimilarity(backendPath, frontendPath),
    segmentCount: calculateSegmentCountSimilarity(backendPath, frontendPath),
    suffixMatch: calculateSuffixMatchSimilarity(backendPath, frontendPath),
    resourceName: calculateResourceNameSimilarity(backendPath, frontendPath),
    parameterPositions: calculateParameterPositionsSimilarity(backendPath, frontendPath),
  };
}

function calculateOverallPathSimilarity(breakdown: PathSimilarityBreakdown, weights: PathSimilarityWeights): number {
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const weightedSum =
    breakdown.segmentNames * weights.segmentNames +
    breakdown.segmentCount * weights.segmentCount +
    breakdown.suffixMatch * weights.suffixMatch +
    breakdown.resourceName * weights.resourceName +
    breakdown.parameterPositions * weights.parameterPositions;
  return weightedSum / totalWeight;
}

function pathSimilarity(
  backendPath: string,
  frontendPath: string,
  weights: PathSimilarityWeights = DEFAULT_WEIGHTS
): { score: number; breakdown: PathSimilarityBreakdown } {
  const backendNorm = normalizePath(backendPath);
  const frontendNorm = normalizePath(frontendPath);
  
  if (backendNorm === frontendNorm) {
    return {
      score: 1.0,
      breakdown: { segmentNames: 1.0, segmentCount: 1.0, suffixMatch: 1.0, resourceName: 1.0, parameterPositions: 1.0 },
    };
  }
  
  const breakdown = calculatePathSimilarityBreakdown(backendPath, frontendPath);
  let score = calculateOverallPathSimilarity(breakdown, weights);
  
  // Penalty for single-segment backend paths without strong resource match
  const backendSegs = getMeaningfulSegments(backendPath);
  if (backendSegs.length === 1 && breakdown.resourceName < 0.8) {
    score *= 0.5;
  }
  // Extra penalty when backend is just a parameter
  if (backendSegs.length === 1 && backendSegs[0] === ':param') {
    score *= 0.3;
  }
  
  return { score, breakdown };
}


// ============================================================================
// Field Comparison
// ============================================================================

function compareFields(
  backendFields: ContractField[],
  frontendFields: ContractField[],
  parentPath: string = ''
): FieldMismatch[] {
  const mismatches: FieldMismatch[] = [];
  const backendMap = new Map(backendFields.map(f => [f.name, f]));
  const frontendMap = new Map(frontendFields.map(f => [f.name, f]));
  
  for (const [name, backendField] of backendMap) {
    const fieldPath = parentPath ? `${parentPath}.${name}` : name;
    const frontendField = frontendMap.get(name);
    
    if (!frontendField) {
      mismatches.push({
        fieldPath,
        mismatchType: 'missing_in_frontend',
        backendField,
        description: `Field "${fieldPath}" exists in backend but not in frontend type`,
        severity: backendField.optional ? 'warning' : 'error',
      });
      continue;
    }
    
    if (backendField.type !== 'unknown' && frontendField.type !== 'unknown') {
      if (!typesCompatible(backendField.type, frontendField.type)) {
        mismatches.push({
          fieldPath,
          mismatchType: 'type_mismatch',
          backendField,
          frontendField,
          description: `Type mismatch: backend "${backendField.type}", frontend "${frontendField.type}"`,
          severity: 'error',
        });
      }
    }
    
    if (backendField.optional !== frontendField.optional) {
      mismatches.push({
        fieldPath,
        mismatchType: 'optionality_mismatch',
        backendField,
        frontendField,
        description: `Optionality mismatch for "${fieldPath}"`,
        severity: 'warning',
      });
    }
    
    if (backendField.nullable !== frontendField.nullable) {
      mismatches.push({
        fieldPath,
        mismatchType: 'nullability_mismatch',
        backendField,
        frontendField,
        description: `Nullability mismatch for "${fieldPath}"`,
        severity: 'warning',
      });
    }
    
    if (backendField.children && frontendField.children) {
      mismatches.push(...compareFields(backendField.children, frontendField.children, fieldPath));
    }
  }
  
  for (const [name, frontendField] of frontendMap) {
    if (!backendMap.has(name)) {
      const fieldPath = parentPath ? `${parentPath}.${name}` : name;
      mismatches.push({
        fieldPath,
        mismatchType: 'missing_in_backend',
        frontendField,
        description: `Field "${fieldPath}" expected by frontend but not in backend`,
        severity: frontendField.optional ? 'info' : 'error',
      });
    }
  }
  
  return mismatches;
}

function typesCompatible(backendType: string, frontendType: string): boolean {
  const normalize = (t: string) => t.toLowerCase().replace(/\s/g, '');
  const bt = normalize(backendType);
  const ft = normalize(frontendType);
  if (bt === ft) {return true;}
  
  const mappings: Record<string, string[]> = {
    'string': ['str', 'text'],
    'number': ['int', 'integer', 'float', 'double', 'decimal'],
    'boolean': ['bool'],
    'object': ['dict', 'record', 'map'],
    'array': ['list', 'sequence'],
    'any': ['unknown', 'object'],
  };
  
  for (const [canonical, aliases] of Object.entries(mappings)) {
    const allTypes = [canonical, ...aliases];
    if (allTypes.includes(bt) && allTypes.includes(ft)) {return true;}
  }
  return false;
}


// ============================================================================
// Contract Matcher
// ============================================================================

export class ContractMatcher {
  private config: ContractMatcherConfig;

  constructor(config: Partial<ContractMatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, weights: { ...DEFAULT_WEIGHTS, ...config.weights } };
  }

  match(backendEndpoints: ExtractedEndpoint[], frontendApiCalls: ExtractedApiCall[]): MatchingResult {
    const contracts: Contract[] = [];
    const matchedBackend = new Set<ExtractedEndpoint>();
    const matchedFrontend = new Set<ExtractedApiCall>();

    const frontendByMethod = new Map<string, ExtractedApiCall[]>();
    for (const call of frontendApiCalls) {
      if (!frontendByMethod.has(call.method)) {frontendByMethod.set(call.method, []);}
      frontendByMethod.get(call.method)!.push(call);
    }

    for (const endpoint of backendEndpoints) {
      const sameMethods = frontendByMethod.get(endpoint.method) || [];
      const matches: { call: ExtractedApiCall; similarity: number; breakdown: PathSimilarityBreakdown }[] = [];
      
      for (const call of sameMethods) {
        if (matchedFrontend.has(call)) {continue;}
        const { score, breakdown } = pathSimilarity(endpoint.path, call.path, this.config.weights);
        if (score >= this.config.minSimilarity) {
          matches.push({ call, similarity: score, breakdown });
        }
      }
      
      matches.sort((a, b) => b.similarity - a.similarity);
      
      if (matches.length > 0) {
        const bestMatch = matches[0];
        if (!bestMatch) {continue;}
        const goodMatches = matches.filter(m => m.similarity >= bestMatch.similarity - 0.1);
        
        matchedBackend.add(endpoint);
        const matchingCalls = goodMatches.map(m => { matchedFrontend.add(m.call); return m.call; });
        
        const contract = this.createContract(endpoint, matchingCalls, bestMatch.similarity);
        if (contract.confidence.score >= this.config.minConfidence) {
          contracts.push(contract);
        }
      }
    }

    return {
      contracts,
      unmatchedBackend: backendEndpoints.filter(e => !matchedBackend.has(e)),
      unmatchedFrontend: frontendApiCalls.filter(c => !matchedFrontend.has(c)),
    };
  }

  private createContract(endpoint: ExtractedEndpoint, frontendCalls: ExtractedApiCall[], pathMatchScore: number): Contract {
    const now = new Date().toISOString();
    
    const backend: BackendEndpoint = {
      method: endpoint.method,
      path: endpoint.path,
      normalizedPath: endpoint.normalizedPath,
      file: endpoint.file,
      line: endpoint.line,
      responseFields: endpoint.responseFields,
      framework: endpoint.framework,
    };
    
    // Only add requestFields if they exist
    if (endpoint.requestFields && endpoint.requestFields.length > 0) {
      backend.requestFields = endpoint.requestFields;
    }
    
    const frontend: FrontendApiCall[] = frontendCalls.map(call => {
      const frontendCall: FrontendApiCall = {
        method: call.method,
        path: call.path,
        normalizedPath: call.normalizedPath,
        file: call.file,
        line: call.line,
        responseFields: call.responseFields,
        library: call.library,
      };
      
      // Only add requestFields if they exist
      if (call.requestFields && call.requestFields.length > 0) {
        frontendCall.requestFields = call.requestFields;
      }
      
      return frontendCall;
    });
    
    const mismatches: FieldMismatch[] = [];
    if (this.config.detectTypeMismatches) {
      for (const call of frontendCalls) {
        // Compare response fields
        if (call.responseFields.length > 0 || endpoint.responseFields.length > 0) {
          mismatches.push(...compareFields(endpoint.responseFields, call.responseFields));
        }
        
        // Compare request fields (if both have them)
        const backendRequestFields = endpoint.requestFields || [];
        const frontendRequestFields = call.requestFields || [];
        if (backendRequestFields.length > 0 || frontendRequestFields.length > 0) {
          const requestMismatches = compareFields(backendRequestFields, frontendRequestFields);
          // Mark these as request field mismatches
          for (const mismatch of requestMismatches) {
            mismatch.fieldPath = `request.${mismatch.fieldPath}`;
            mismatch.description = mismatch.description.replace('Field "', 'Request field "');
          }
          mismatches.push(...requestMismatches);
        }
      }
    }
    
    const confidence = this.calculateConfidence(endpoint, frontendCalls, mismatches, pathMatchScore);
    const status = mismatches.some(m => m.severity === 'error') ? 'mismatch' : 'discovered';
    const id = this.generateContractId(endpoint.method, endpoint.normalizedPath);
    
    return { id, method: endpoint.method, endpoint: endpoint.normalizedPath, backend, frontend, mismatches, status, confidence, metadata: { firstSeen: now, lastSeen: now } };
  }

  private calculateConfidence(endpoint: ExtractedEndpoint, frontendCalls: ExtractedApiCall[], mismatches: FieldMismatch[], pathMatchScore: number): ContractConfidence {
    const matchConfidence = pathMatchScore;
    const hasBackendResponseFields = endpoint.responseFields.length > 0;
    const hasFrontendResponseFields = frontendCalls.some(c => c.responseFields.length > 0);
    const hasBackendRequestFields = (endpoint.requestFields?.length || 0) > 0;
    const hasFrontendRequestFields = frontendCalls.some(c => (c.requestFields?.length || 0) > 0);
    
    // Weight response fields more heavily since they're more commonly extracted
    const responseFieldScore = (hasBackendResponseFields ? 0.3 : 0) + (hasFrontendResponseFields ? 0.3 : 0);
    const requestFieldScore = (hasBackendRequestFields ? 0.2 : 0) + (hasFrontendRequestFields ? 0.2 : 0);
    const fieldExtractionConfidence = responseFieldScore + requestFieldScore;
    
    let score = (matchConfidence * 0.6) + (fieldExtractionConfidence * 0.4);
    if (mismatches.length > 0) {
      const errorCount = mismatches.filter(m => m.severity === 'error').length;
      score *= Math.max(0.5, 1 - (errorCount * 0.1));
    }
    
    let level: ContractConfidence['level'];
    if (score >= 0.85) {level = 'high';}
    else if (score >= 0.65) {level = 'medium';}
    else if (score >= 0.45) {level = 'low';}
    else {level = 'uncertain';}
    
    return { score, level, matchConfidence, fieldExtractionConfidence };
  }

  private generateContractId(method: HttpMethod, path: string): string {
    const hash = crypto.createHash('sha256').update(`${method}:${path}`).digest('hex').slice(0, 12);
    return `contract-${method.toLowerCase()}-${hash}`;
  }
}

export function createContractMatcher(config?: Partial<ContractMatcherConfig>): ContractMatcher {
  return new ContractMatcher(config);
}

export function matchContracts(
  backendEndpoints: ExtractedEndpoint[],
  frontendApiCalls: ExtractedApiCall[],
  config?: Partial<ContractMatcherConfig>
): MatchingResult {
  return new ContractMatcher(config).match(backendEndpoints, frontendApiCalls);
}
