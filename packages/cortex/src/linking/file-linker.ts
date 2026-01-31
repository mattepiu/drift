/**
 * File Linker
 * 
 * Links memories to files in the codebase.
 */

import type { IMemoryStorage, Citation } from '../storage/interface.js';
import type { Memory } from '../types/index.js';

/**
 * File linker
 */
export class FileLinker {
  constructor(private storage: IMemoryStorage) {}

  /**
   * Link a memory to a file
   */
  async link(memoryId: string, filePath: string, citation?: Citation): Promise<void> {
    await this.storage.linkToFile(memoryId, filePath, citation);
  }

  /**
   * Get memories linked to a file
   */
  async getMemoriesForFile(filePath: string): Promise<Memory[]> {
    return this.storage.findByFile(filePath);
  }

  /**
   * Auto-link memories based on file references in content
   */
  async autoLink(memory: Memory, files: string[]): Promise<string[]> {
    const linked: string[] = [];

    // Check if memory mentions any file paths
    const content = JSON.stringify(memory);

    for (const file of files) {
      // Check for file path or filename
      const filename = file.split('/').pop() || file;
      if (content.includes(file) || content.includes(filename)) {
        await this.link(memory.id, file);
        linked.push(file);
      }
    }

    return linked;
  }
}
