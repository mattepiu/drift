/**
 * Workspace Utilities - Workspace helpers
 * @requirements 27.1
 */

import { URI } from 'vscode-uri';

import type { WorkspaceFolder } from '../types/lsp-types.js';

// ============================================================================
// URI Utilities
// ============================================================================

/**
 * Convert file path to URI
 */
export function pathToUri(path: string): string {
  return URI.file(path).toString();
}

/**
 * Convert URI to file path
 */
export function uriToPath(uri: string): string {
  return URI.parse(uri).fsPath;
}

/**
 * Get file name from URI
 */
export function getFileName(uri: string): string {
  const parsed = URI.parse(uri);
  const path = parsed.fsPath;
  return path.split(/[/\\]/).pop() ?? '';
}

/**
 * Get file extension from URI
 */
export function getFileExtension(uri: string): string {
  const fileName = getFileName(uri);
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop() ?? '' : '';
}

/**
 * Get directory from URI
 */
export function getDirectory(uri: string): string {
  const parsed = URI.parse(uri);
  const path = parsed.fsPath;
  const parts = path.split(/[/\\]/);
  parts.pop();
  return parts.join('/');
}

/**
 * Join URI with path segments
 */
export function joinUri(base: string, ...segments: string[]): string {
  const parsed = URI.parse(base);
  const basePath = parsed.fsPath;
  const joined = [basePath, ...segments].join('/');
  return URI.file(joined).toString();
}

/**
 * Get relative path from base URI
 */
export function getRelativePath(baseUri: string, targetUri: string): string {
  const basePath = uriToPath(baseUri);
  const targetPath = uriToPath(targetUri);

  if (targetPath.startsWith(basePath)) {
    return targetPath.substring(basePath.length).replace(/^[/\\]/, '');
  }

  return targetPath;
}

/**
 * Check if URI is a child of another URI
 */
export function isChildOf(parentUri: string, childUri: string): boolean {
  const parentPath = uriToPath(parentUri);
  const childPath = uriToPath(childUri);

  return childPath.startsWith(parentPath + '/') || childPath.startsWith(parentPath + '\\');
}

// ============================================================================
// Workspace Utilities
// ============================================================================

/**
 * Find workspace folder for URI
 */
export function findWorkspaceFolder(
  uri: string,
  workspaceFolders: WorkspaceFolder[]
): WorkspaceFolder | undefined {
  for (const folder of workspaceFolders) {
    if (isChildOf(folder.uri, uri) || folder.uri === uri) {
      return folder;
    }
  }
  return undefined;
}

/**
 * Get workspace root URI
 */
export function getWorkspaceRoot(workspaceFolders: WorkspaceFolder[]): string | undefined {
  return workspaceFolders[0]?.uri;
}

/**
 * Check if URI is in workspace
 */
export function isInWorkspace(uri: string, workspaceFolders: WorkspaceFolder[]): boolean {
  return findWorkspaceFolder(uri, workspaceFolders) !== undefined;
}

/**
 * Get all workspace URIs
 */
export function getWorkspaceUris(workspaceFolders: WorkspaceFolder[]): string[] {
  return workspaceFolders.map((f) => f.uri);
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if URI matches a glob pattern
 */
export function matchesGlob(uri: string, pattern: string): boolean {
  const path = uriToPath(uri);
  const regex = globToRegex(pattern);
  return regex.test(path);
}

/**
 * Check if URI matches any of the glob patterns
 */
export function matchesAnyGlob(uri: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlob(uri, pattern));
}

/**
 * Convert glob pattern to regex
 */
function globToRegex(glob: string): RegExp {
  const regex = glob
    // Escape special regex characters except * and ?
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Convert ** to match any path
    .replace(/\*\*/g, '.*')
    // Convert * to match any characters except /
    .replace(/\*/g, '[^/\\\\]*')
    // Convert ? to match single character
    .replace(/\?/g, '.');

  return new RegExp(`^${regex}$`, 'i');
}

/**
 * Filter URIs by glob patterns
 */
export function filterByGlob(uris: string[], includePatterns: string[], excludePatterns: string[] = []): string[] {
  return uris.filter((uri) => {
    // Must match at least one include pattern
    if (includePatterns.length > 0 && !matchesAnyGlob(uri, includePatterns)) {
      return false;
    }

    // Must not match any exclude pattern
    if (excludePatterns.length > 0 && matchesAnyGlob(uri, excludePatterns)) {
      return false;
    }

    return true;
  });
}

// ============================================================================
// File Type Utilities
// ============================================================================

/**
 * Check if URI is a TypeScript file
 */
export function isTypeScriptFile(uri: string): boolean {
  const ext = getFileExtension(uri).toLowerCase();
  return ['ts', 'tsx', 'mts', 'cts'].includes(ext);
}

/**
 * Check if URI is a JavaScript file
 */
export function isJavaScriptFile(uri: string): boolean {
  const ext = getFileExtension(uri).toLowerCase();
  return ['js', 'jsx', 'mjs', 'cjs'].includes(ext);
}

/**
 * Check if URI is a CSS file
 */
export function isCssFile(uri: string): boolean {
  const ext = getFileExtension(uri).toLowerCase();
  return ['css', 'scss', 'sass', 'less'].includes(ext);
}

/**
 * Check if URI is a JSON file
 */
export function isJsonFile(uri: string): boolean {
  const ext = getFileExtension(uri).toLowerCase();
  return ['json', 'jsonc'].includes(ext);
}

/**
 * Check if URI is a Markdown file
 */
export function isMarkdownFile(uri: string): boolean {
  const ext = getFileExtension(uri).toLowerCase();
  return ['md', 'markdown'].includes(ext);
}

/**
 * Check if URI is a configuration file
 */
export function isConfigFile(uri: string): boolean {
  const fileName = getFileName(uri).toLowerCase();
  const configPatterns = [
    /^\..*rc$/,
    /^\..*rc\.json$/,
    /^\..*rc\.js$/,
    /^\..*rc\.cjs$/,
    /^\..*rc\.mjs$/,
    /^.*\.config\.(js|ts|json|cjs|mjs)$/,
    /^tsconfig.*\.json$/,
    /^package\.json$/,
    /^\.env.*$/,
  ];

  return configPatterns.some((pattern) => pattern.test(fileName));
}

/**
 * Check if URI is a test file
 */
export function isTestFile(uri: string): boolean {
  const fileName = getFileName(uri).toLowerCase();
  const testPatterns = [
    /\.test\.(ts|tsx|js|jsx)$/,
    /\.spec\.(ts|tsx|js|jsx)$/,
    /_test\.(ts|tsx|js|jsx)$/,
    /test_.*\.(ts|tsx|js|jsx)$/,
  ];

  return testPatterns.some((pattern) => pattern.test(fileName));
}

/**
 * Check if URI should be excluded from scanning
 */
export function shouldExclude(uri: string, excludePatterns: string[]): boolean {
  // Default exclusions
  const defaultExclusions = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/.next/**',
    '**/.nuxt/**',
  ];

  const allPatterns = [...defaultExclusions, ...excludePatterns];
  return matchesAnyGlob(uri, allPatterns);
}
