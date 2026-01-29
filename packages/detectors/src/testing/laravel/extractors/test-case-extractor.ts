/**
 * Laravel Test Case Extractor
 *
 * Extracts test case definitions from Laravel code.
 *
 * @module testing/laravel/extractors/test-case-extractor
 */

import { PHPUNIT_ASSERTIONS } from '../types.js';

import type {
  TestCaseInfo,
  TestMethodInfo,
  TestType,
  TestCaseExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

const TEST_CLASS_PATTERN = /class\s+(\w+Test)\s+extends\s+([\w\\]+(?:TestCase)?)\s*\{/g;
const TEST_METHOD_PATTERN = /(?:\/\*\*[\s\S]*?\*\/\s*)?public\s+function\s+(test\w+|\w+)\s*\(/g;
const DATA_PROVIDER_PATTERN = /@dataProvider\s+(\w+)/;
const TRAIT_USE_PATTERN = /use\s+([\w\\,\s]+)\s*;/g;
const ASSERTION_PATTERN = new RegExp(`\\$this->(${PHPUNIT_ASSERTIONS.join('|')})\\s*\\(`, 'g');

// ============================================================================
// Test Case Extractor
// ============================================================================

export class TestCaseExtractor {
  extract(content: string, file: string): TestCaseExtractionResult {
    const testCases = this.extractTestCases(content, file);
    const confidence = testCases.length > 0 ? 0.9 : 0;

    return { testCases, confidence };
  }

  hasTests(content: string): boolean {
    return content.includes('extends TestCase') || content.includes('function test');
  }

  private extractTestCases(content: string, file: string): TestCaseInfo[] {
    const testCases: TestCaseInfo[] = [];
    TEST_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = TEST_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const extendsClass = match[2] || 'TestCase';
      const line = this.getLineNumber(content, match.index);
      const classBody = this.extractClassBody(content, match.index + match[0].length);
      const namespace = this.extractNamespace(content);
      const type = this.determineTestType(file, extendsClass);
      const methods = this.extractTestMethods(classBody, line);
      const traits = this.extractTraits(classBody);

      testCases.push({
        name,
        fqn: namespace ? `${namespace}\\${name}` : name,
        namespace,
        extends: extendsClass,
        type,
        methods,
        traits,
        file,
        line,
      });
    }

    return testCases;
  }

  private extractTestMethods(classBody: string, classLine: number): TestMethodInfo[] {
    const methods: TestMethodInfo[] = [];
    TEST_METHOD_PATTERN.lastIndex = 0;

    let match;
    while ((match = TEST_METHOD_PATTERN.exec(classBody)) !== null) {
      const name = match[1] || '';
      if (!name.startsWith('test') && !match[0].includes('@test')) {continue;}

      const line = classLine + this.getLineNumber(classBody.substring(0, match.index), 0);
      const methodBody = this.extractMethodBody(classBody, match.index);
      const dataProviderMatch = match[0].match(DATA_PROVIDER_PATTERN);
      const assertions = this.extractAssertions(methodBody);

      methods.push({
        name,
        hasDataProvider: !!dataProviderMatch,
        dataProvider: dataProviderMatch ? dataProviderMatch[1] || null : null,
        assertions,
        line,
      });
    }

    return methods;
  }

  private extractAssertions(methodBody: string): string[] {
    const assertions: string[] = [];
    ASSERTION_PATTERN.lastIndex = 0;

    let match;
    while ((match = ASSERTION_PATTERN.exec(methodBody)) !== null) {
      if (match[1]) {assertions.push(match[1]);}
    }

    return [...new Set(assertions)];
  }

  private determineTestType(file: string, extendsClass: string): TestType {
    if (file.includes('/Feature/') || file.includes('\\Feature\\')) {return 'feature';}
    if (file.includes('/Unit/') || file.includes('\\Unit\\')) {return 'unit';}
    if (extendsClass.includes('Dusk') || file.includes('/Browser/')) {return 'browser';}
    return 'integration';
  }

  private extractTraits(classBody: string): string[] {
    const traits: string[] = [];
    TRAIT_USE_PATTERN.lastIndex = 0;

    let match;
    while ((match = TRAIT_USE_PATTERN.exec(classBody)) !== null) {
      const traitList = match[1] || '';
      traits.push(...traitList.split(',').map(t => t.trim()).filter(Boolean));
    }

    return traits;
  }

  private extractNamespace(content: string): string | null {
    const match = content.match(/namespace\s+([\w\\]+)\s*;/);
    return match ? match[1] || null : null;
  }

  private extractClassBody(content: string, startIndex: number): string {
    let depth = 1, i = startIndex;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }
    return content.substring(startIndex, i - 1);
  }

  private extractMethodBody(content: string, startIndex: number): string {
    const openBrace = content.indexOf('{', startIndex);
    if (openBrace === -1) {return '';}
    let depth = 1, i = openBrace + 1;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') {depth++;}
      else if (content[i] === '}') {depth--;}
      i++;
    }
    return content.substring(openBrace + 1, i - 1);
  }

  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

export function createTestCaseExtractor(): TestCaseExtractor {
  return new TestCaseExtractor();
}
