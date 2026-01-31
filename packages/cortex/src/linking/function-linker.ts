/**
 * Function Linker
 * 
 * Links memories to functions in the call graph.
 */

import type { IMemoryStorage } from '../storage/interface.js';
import type { Memory } from '../types/index.js';

/**
 * Function linker
 */
export class FunctionLinker {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Link a memory to a function
   */
  async link(memoryId: string, functionId: string): Promise<void> {
    await this.storage.linkToFunction(memoryId, functionId);
  }

  /**
   * Get memories linked to a function
   */
  async getMemoriesForFunction(functionId: string): Promise<Memory[]> {
    return this.storage.findByFunction(functionId);
  }

  /**
   * Auto-link memories based on function references in content
   */
  async autoLink(memory: Memory, functions: Array<{ id: string; name: string }>): Promise<string[]> {
    const linked: string[] = [];

    // Check if memory mentions any function names
    const content = JSON.stringify(memory).toLowerCase();

    for (const fn of functions) {
      if (content.includes(fn.name.toLowerCase())) {
        await this.link(memory.id, fn.id);
        linked.push(fn.id);
      }
    }

    return linked;
  }
}
