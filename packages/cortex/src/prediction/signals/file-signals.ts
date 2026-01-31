/**
 * File Signal Extractor
 * 
 * Extracts file-based signals for prediction.
 * Analyzes the current file context to predict
 * which memories will be relevant.
 * 
 * @module prediction/signals/file-signals
 */

import type { FileSignals } from '../types.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Configuration for file signal extraction
 */
export interface FileSignalExtractorConfig {
  /** Maximum recent files to track */
  maxRecentFiles: number;
  /** Maximum patterns to detect */
  maxPatterns: number;
  /** Maximum imports to extract */
  maxImports: number;
  /** Maximum symbols to extract */
  maxSymbols: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FileSignalExtractorConfig = {
  maxRecentFiles: 10,
  maxPatterns: 20,
  maxImports: 50,
  maxSymbols: 50,
};

/**
 * File Signal Extractor
 * 
 * Extracts signals from file context for prediction.
 */
export class FileSignalExtractor {
  private config: FileSignalExtractorConfig;

  constructor(config?: Partial<FileSignalExtractorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract file signals from active file and recent files
   */
  extract(activeFile: string, recentFiles: string[] = []): FileSignals {
    const fileType = this.getFileType(activeFile);
    const directory = path.dirname(activeFile);

    // Read file content if it exists
    let content = '';
    try {
      if (fs.existsSync(activeFile)) {
        content = fs.readFileSync(activeFile, 'utf-8');
      }
    } catch {
      // File might not exist or be readable
    }

    const filePatterns = this.detectPatterns(content, fileType);
    const fileImports = this.extractImports(content, fileType);
    const fileSymbols = this.extractSymbols(content, fileType);

    return {
      activeFile,
      recentFiles: recentFiles.slice(0, this.config.maxRecentFiles),
      fileType,
      filePatterns,
      fileImports,
      fileSymbols,
      directory,
    };
  }

  /**
   * Get file type from extension
   */
  private getFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return ext.replace('.', '') || 'unknown';
  }

  /**
   * Detect patterns in file content
   */
  detectPatterns(content: string, fileType: string): string[] {
    const patterns: string[] = [];

    // Common patterns across languages
    const patternDetectors: Array<{ pattern: RegExp; name: string }> = [
      // Error handling
      { pattern: /try\s*{[\s\S]*?catch/g, name: 'error-handling' },
      { pattern: /\.catch\s*\(/g, name: 'promise-error-handling' },
      
      // Async patterns
      { pattern: /async\s+function|async\s*\(/g, name: 'async-function' },
      { pattern: /await\s+/g, name: 'await-usage' },
      { pattern: /Promise\.(all|race|allSettled)/g, name: 'promise-combinators' },
      
      // API patterns
      { pattern: /fetch\s*\(|axios\.|http\./gi, name: 'http-client' },
      { pattern: /@(Get|Post|Put|Delete|Patch)\s*\(/g, name: 'rest-endpoint' },
      { pattern: /router\.(get|post|put|delete|patch)/gi, name: 'express-route' },
      
      // Database patterns
      { pattern: /prisma\.|\.findMany|\.findUnique|\.create\s*\(/gi, name: 'prisma-orm' },
      { pattern: /\.query\s*\(|\.execute\s*\(/g, name: 'raw-sql' },
      { pattern: /mongoose\.|\.find\(|\.save\s*\(/gi, name: 'mongoose-orm' },
      
      // Authentication
      { pattern: /jwt\.|jsonwebtoken|Bearer\s+/gi, name: 'jwt-auth' },
      { pattern: /passport\.|authenticate\s*\(/gi, name: 'passport-auth' },
      { pattern: /session\.|cookie\./gi, name: 'session-auth' },
      
      // Validation
      { pattern: /zod\.|z\.(string|number|object)/gi, name: 'zod-validation' },
      { pattern: /yup\.|Yup\./g, name: 'yup-validation' },
      { pattern: /@IsString|@IsNumber|class-validator/g, name: 'class-validator' },
      
      // React patterns
      { pattern: /useState\s*\(|useEffect\s*\(/g, name: 'react-hooks' },
      { pattern: /useQuery\s*\(|useMutation\s*\(/g, name: 'react-query' },
      { pattern: /useSelector\s*\(|useDispatch\s*\(/g, name: 'redux-hooks' },
      
      // Testing
      { pattern: /describe\s*\(|it\s*\(|test\s*\(/g, name: 'test-suite' },
      { pattern: /expect\s*\(|assert\./g, name: 'assertions' },
      { pattern: /mock\(|jest\.fn\(|vi\.fn\(/gi, name: 'mocking' },
      
      // Logging
      { pattern: /console\.(log|error|warn|info)/g, name: 'console-logging' },
      { pattern: /logger\.(log|error|warn|info|debug)/gi, name: 'structured-logging' },
      
      // Caching
      { pattern: /redis\.|cache\.(get|set|del)/gi, name: 'caching' },
      { pattern: /memoize|useMemo\s*\(/g, name: 'memoization' },
      
      // Event handling
      { pattern: /addEventListener|on[A-Z]\w+\s*=/g, name: 'event-handling' },
      { pattern: /emit\s*\(|\.on\s*\(/g, name: 'event-emitter' },
      
      // Middleware
      { pattern: /middleware|use\s*\(\s*\(/g, name: 'middleware' },
      
      // Configuration
      { pattern: /process\.env\.|import\.meta\.env/g, name: 'env-config' },
      { pattern: /config\.(get|set)|getConfig/gi, name: 'config-access' },
    ];

    for (const detector of patternDetectors) {
      if (detector.pattern.test(content)) {
        patterns.push(detector.name);
        // Reset regex lastIndex
        detector.pattern.lastIndex = 0;
      }
      if (patterns.length >= this.config.maxPatterns) break;
    }

    // Add file-type specific patterns
    if (fileType === 'ts' || fileType === 'tsx') {
      if (/interface\s+\w+|type\s+\w+\s*=/g.test(content)) {
        patterns.push('typescript-types');
      }
    }

    return patterns.slice(0, this.config.maxPatterns);
  }

  /**
   * Extract imports from file content
   */
  extractImports(content: string, fileType: string): string[] {
    const imports: string[] = [];

    // TypeScript/JavaScript imports
    if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(fileType)) {
      // ES6 imports
      const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;
      while ((match = es6ImportRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath) {
          imports.push(importPath);
        }
        if (imports.length >= this.config.maxImports) break;
      }

      // CommonJS requires
      const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath) {
          imports.push(importPath);
        }
        if (imports.length >= this.config.maxImports) break;
      }
    }

    // Python imports
    if (fileType === 'py') {
      const pythonImportRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
      let match;
      while ((match = pythonImportRegex.exec(content)) !== null) {
        const importPath = match[1] || match[2];
        if (importPath) {
          imports.push(importPath);
        }
        if (imports.length >= this.config.maxImports) break;
      }
    }

    return imports.slice(0, this.config.maxImports);
  }

  /**
   * Extract symbols (functions, classes) from file content
   */
  extractSymbols(content: string, fileType: string): string[] {
    const symbols: string[] = [];

    // TypeScript/JavaScript symbols
    if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(fileType)) {
      // Function declarations
      const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
      let match;
      while ((match = funcRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          symbols.push(name);
        }
        if (symbols.length >= this.config.maxSymbols) break;
      }

      // Arrow functions assigned to const
      const arrowRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
      while ((match = arrowRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          symbols.push(name);
        }
        if (symbols.length >= this.config.maxSymbols) break;
      }

      // Class declarations
      const classRegex = /(?:export\s+)?class\s+(\w+)/g;
      while ((match = classRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          symbols.push(name);
        }
        if (symbols.length >= this.config.maxSymbols) break;
      }

      // Interface/Type declarations
      const typeRegex = /(?:export\s+)?(?:interface|type)\s+(\w+)/g;
      while ((match = typeRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          symbols.push(name);
        }
        if (symbols.length >= this.config.maxSymbols) break;
      }
    }

    // Python symbols
    if (fileType === 'py') {
      const pyFuncRegex = /def\s+(\w+)/g;
      let match;
      while ((match = pyFuncRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          symbols.push(name);
        }
        if (symbols.length >= this.config.maxSymbols) break;
      }

      const pyClassRegex = /class\s+(\w+)/g;
      while ((match = pyClassRegex.exec(content)) !== null) {
        const name = match[1];
        if (name) {
          symbols.push(name);
        }
        if (symbols.length >= this.config.maxSymbols) break;
      }
    }

    return symbols.slice(0, this.config.maxSymbols);
  }
}
