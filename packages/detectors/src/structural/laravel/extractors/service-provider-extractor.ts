/**
 * Laravel Service Provider Extractor
 *
 * @module structural/laravel/extractors/service-provider-extractor
 */

import type { ServiceProviderInfo, BindingInfo } from '../types.js';

const PROVIDER_CLASS_PATTERN = /class\s+(\w+ServiceProvider)\s+extends\s+ServiceProvider\s*\{/g;
const BIND_PATTERN = /\$this->app->bind\s*\(\s*([^,]+),\s*([^)]+)\)/g;
const SINGLETON_PATTERN = /\$this->app->singleton\s*\(\s*([^,]+),\s*([^)]+)\)/g;
const DEFERRED_PATTERN = /protected\s+\$defer\s*=\s*true/;
const PROVIDES_PATTERN = /public\s+function\s+provides\s*\([^)]*\)\s*(?::\s*array)?\s*\{[^}]*return\s*\[([^\]]+)\]/;

export class ServiceProviderExtractor {
  extract(content: string, file: string): { providers: ServiceProviderInfo[]; confidence: number } {
    const providers: ServiceProviderInfo[] = [];
    PROVIDER_CLASS_PATTERN.lastIndex = 0;

    let match;
    while ((match = PROVIDER_CLASS_PATTERN.exec(content)) !== null) {
      const name = match[1] || '';
      const line = this.getLineNumber(content, match.index);
      const classBody = this.extractClassBody(content, match.index + match[0].length);
      const namespace = this.extractNamespace(content);
      const bindings = this.extractBindings(classBody, line);
      const singletons = this.extractSingletons(classBody, line);
      const deferred = DEFERRED_PATTERN.test(classBody);
      const provides = this.extractProvides(classBody);

      providers.push({
        name,
        fqn: namespace ? `${namespace}\\${name}` : name,
        namespace,
        bindings,
        singletons,
        deferred,
        provides,
        file,
        line,
      });
    }

    return { providers, confidence: providers.length > 0 ? 0.9 : 0 };
  }

  private extractBindings(classBody: string, classLine: number): BindingInfo[] {
    const bindings: BindingInfo[] = [];
    BIND_PATTERN.lastIndex = 0;

    let match;
    while ((match = BIND_PATTERN.exec(classBody)) !== null) {
      bindings.push({
        abstract: this.cleanBinding(match[1] || ''),
        concrete: this.cleanBinding(match[2] || ''),
        type: 'bind',
        line: classLine + this.getLineNumber(classBody.substring(0, match.index), 0),
      });
    }

    return bindings;
  }

  private extractSingletons(classBody: string, classLine: number): BindingInfo[] {
    const singletons: BindingInfo[] = [];
    SINGLETON_PATTERN.lastIndex = 0;

    let match;
    while ((match = SINGLETON_PATTERN.exec(classBody)) !== null) {
      singletons.push({
        abstract: this.cleanBinding(match[1] || ''),
        concrete: this.cleanBinding(match[2] || ''),
        type: 'singleton',
        line: classLine + this.getLineNumber(classBody.substring(0, match.index), 0),
      });
    }

    return singletons;
  }

  private extractProvides(classBody: string): string[] {
    const match = classBody.match(PROVIDES_PATTERN);
    if (!match?.[1]) {return [];}
    return match[1].split(',').map(p => p.trim().replace(/['"]/g, '')).filter(Boolean);
  }

  private cleanBinding(binding: string): string {
    return binding.trim().replace(/::class$/, '').replace(/['"]/g, '');
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

  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

export function createServiceProviderExtractor(): ServiceProviderExtractor {
  return new ServiceProviderExtractor();
}
