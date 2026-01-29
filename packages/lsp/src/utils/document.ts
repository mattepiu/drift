/**
 * Document Utilities
 *
 * Helper functions for working with LSP text documents.
 */

import type { Position, Range } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Get the text at a specific range in a document
 */
export function getTextAtRange(document: TextDocument, range: Range): string {
  return document.getText(range);
}

/**
 * Get the line text at a specific line number
 */
export function getLineText(document: TextDocument, line: number): string {
  const lineRange: Range = {
    start: { line, character: 0 },
    end: { line, character: Number.MAX_SAFE_INTEGER },
  };
  return document.getText(lineRange);
}

/**
 * Get the word at a specific position
 */
export function getWordAtPosition(
  document: TextDocument,
  position: Position
): string | null {
  const lineText = getLineText(document, position.line);
  const character = position.character;

  // Find word boundaries
  let start = character;
  let end = character;

  // Move start backwards to find word start
  while (start > 0) {
    const char = lineText[start - 1];
    if (char === undefined || !isWordChar(char)) {
      break;
    }
    start--;
  }

  // Move end forwards to find word end
  while (end < lineText.length) {
    const char = lineText[end];
    if (char === undefined || !isWordChar(char)) {
      break;
    }
    end++;
  }

  if (start === end) {
    return null;
  }

  return lineText.substring(start, end);
}

/**
 * Check if a character is a word character
 */
function isWordChar(char: string): boolean {
  return /[\w$]/.test(char);
}

/**
 * Get the file name from a URI
 */
export function getFileName(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1] ?? uri;
}

/**
 * Get the file extension from a URI
 */
export function getFileExtension(uri: string): string {
  const fileName = getFileName(uri);
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) {
    return '';
  }
  return fileName.substring(dotIndex + 1);
}

/**
 * Check if a URI matches a glob pattern (simple implementation)
 */
export function matchesGlob(uri: string, pattern: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/\./g, '\\.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(uri);
}

/**
 * Get the language ID for a file based on extension
 */
export function getLanguageId(uri: string): string {
  const ext = getFileExtension(uri).toLowerCase();

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    py: 'python',
    java: 'java',
    cs: 'csharp',
    php: 'php',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    html: 'html',
    vue: 'vue',
    svelte: 'svelte',
  };

  return languageMap[ext] ?? 'plaintext';
}

/**
 * Check if a document is a supported language
 */
export function isSupportedLanguage(document: TextDocument): boolean {
  const supportedLanguages = [
    'typescript',
    'typescriptreact',
    'javascript',
    'javascriptreact',
    'python',
    'java',
    'csharp',
    'php',
    'css',
    'scss',
    'less',
    'json',
    'yaml',
    'markdown',
  ];

  return supportedLanguages.includes(document.languageId);
}
