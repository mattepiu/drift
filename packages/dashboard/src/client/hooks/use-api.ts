/**
 * API Hooks
 *
 * React Query hooks for fetching data from the dashboard API.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  Pattern,
  PatternWithLocations,
  Violation,
  FileTreeNode,
  FileDetails,
  DashboardStats,
  DriftConfig,
  PatternFilters,
  ViolationFilters,
  PatternStatus,
} from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function deleteRequest<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Stats hooks
export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => fetchJson<DashboardStats>('/stats'),
    refetchInterval: 30_000,
  });
}

// Pattern hooks
export function usePatterns(filters?: PatternFilters) {
  const params = new URLSearchParams();
  if (filters?.category) {params.set('category', filters.category);}
  if (filters?.status) {params.set('status', filters.status);}
  if (filters?.minConfidence) {params.set('minConfidence', String(filters.minConfidence));}
  if (filters?.search) {params.set('search', filters.search);}

  const queryString = params.toString();
  return useQuery({
    queryKey: ['patterns', filters],
    queryFn: () => fetchJson<Pattern[]>(`/patterns${queryString ? `?${queryString}` : ''}`),
  });
}

export function usePattern(id: string | null) {
  return useQuery({
    queryKey: ['pattern', id],
    queryFn: () => fetchJson<PatternWithLocations>(`/patterns/${id}`),
    enabled: !!id,
  });
}

export function useApprovePattern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postJson<{ success: boolean }>(`/patterns/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useIgnorePattern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postJson<{ success: boolean }>(`/patterns/${id}/ignore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useDeletePattern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRequest<{ success: boolean }>(`/patterns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useBulkApprovePatterns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => postJson<{ 
      success: boolean; 
      message: string;
      results: { id: string; success: boolean; error?: string }[] 
    }>('/patterns/bulk-approve', { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

// Violation hooks
export function useViolations(filters?: ViolationFilters) {
  const params = new URLSearchParams();
  if (filters?.severity) {params.set('severity', filters.severity);}
  if (filters?.file) {params.set('file', filters.file);}
  if (filters?.patternId) {params.set('patternId', filters.patternId);}
  if (filters?.search) {params.set('search', filters.search);}

  const queryString = params.toString();
  return useQuery({
    queryKey: ['violations', filters],
    queryFn: () => fetchJson<Violation[]>(`/violations${queryString ? `?${queryString}` : ''}`),
  });
}

export function useViolation(id: string | null) {
  return useQuery({
    queryKey: ['violation', id],
    queryFn: () => fetchJson<Violation>(`/violations/${id}`),
    enabled: !!id,
  });
}

// File hooks
export function useFileTree() {
  return useQuery({
    queryKey: ['files', 'tree'],
    queryFn: () => fetchJson<FileTreeNode[]>('/files'),
  });
}

export function useFileDetails(path: string | null) {
  return useQuery({
    queryKey: ['files', 'details', path],
    queryFn: () => fetchJson<FileDetails>(`/files/${encodeURIComponent(path!)}`),
    enabled: !!path,
  });
}

// Config hooks
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => fetchJson<DriftConfig>('/config'),
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: Partial<DriftConfig>) => patchJson<DriftConfig>('/config', config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
  });
}

// Code snippet hook
export interface CodeSnippet {
  code: string;
  startLine: number;
  endLine: number;
  language: string;
}

export async function fetchCodeSnippet(file: string, line: number, context: number = 3): Promise<CodeSnippet> {
  return fetchJson<CodeSnippet>(`/snippet?file=${encodeURIComponent(file)}&line=${line}&context=${context}`);
}

// Contract hooks (BE↔FE mismatch detection)
import type { Contract, ContractStats, ContractFilters } from '../types';

export function useContracts(filters?: ContractFilters) {
  const params = new URLSearchParams();
  if (filters?.status) {params.set('status', filters.status);}
  if (filters?.method) {params.set('method', filters.method);}
  if (filters?.hasMismatches !== undefined) {params.set('hasMismatches', String(filters.hasMismatches));}
  if (filters?.search) {params.set('search', filters.search);}

  const queryString = params.toString();
  return useQuery({
    queryKey: ['contracts', filters],
    queryFn: () => fetchJson<Contract[]>(`/contracts${queryString ? `?${queryString}` : ''}`),
  });
}

export function useContract(id: string | null) {
  return useQuery({
    queryKey: ['contract', id],
    queryFn: () => fetchJson<Contract>(`/contracts/${id}`),
    enabled: !!id,
  });
}

export function useContractStats() {
  return useQuery({
    queryKey: ['contracts', 'stats'],
    queryFn: () => fetchJson<ContractStats>('/contracts/stats'),
  });
}

export function useVerifyContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postJson<{ success: boolean }>(`/contracts/${id}/verify`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

export function useIgnoreContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postJson<{ success: boolean }>(`/contracts/${id}/ignore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

// Trend hooks (pattern regression detection)
import type { TrendSummary, HistorySnapshot } from '../types';

export function useTrends(period: '7d' | '30d' | '90d' = '7d') {
  return useQuery({
    queryKey: ['trends', period],
    queryFn: () => fetchJson<TrendSummary>(`/trends?period=${period}`),
    refetchInterval: 60_000, // Refresh every minute
  });
}

export function useSnapshots(limit: number = 30) {
  return useQuery({
    queryKey: ['trends', 'snapshots', limit],
    queryFn: () => fetchJson<HistorySnapshot[]>(`/trends/snapshots?limit=${limit}`),
  });
}
