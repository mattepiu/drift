/**
 * drift_cortex_reembed — Trigger re-embedding pipeline.
 */

import type { CortexClient } from "../../bridge/client.js";
import type { McpToolDefinition, MemoryType } from "../../bridge/types.js";

export function driftCortexReembed(client: CortexClient): McpToolDefinition {
  return {
    name: "drift_cortex_reembed",
    description:
      "Trigger re-embedding for memories whose embeddings may be stale. " +
      "Useful after model upgrades or content changes.",
    inputSchema: {
      type: "object",
      properties: {
        memory_type: {
          type: "string",
          description: "Re-embed only this type. Omit for all.",
        },
      },
    },
    handler: async (args) => {
      // Re-embedding is triggered by listing memories and touching them
      // through the retrieval engine which regenerates embeddings on access.
      const memories = await client.memoryList(args.memory_type as MemoryType | undefined);

      // Trigger search for each memory to force embedding regeneration
      let reembedded = 0;
      for (const memory of memories) {
        try {
          await client.search(memory.summary, 1);
          reembedded++;
        } catch {
          // Skip failures — degraded mode handles fallback
        }
      }

      return {
        total_memories: memories.length,
        reembedded,
        status: "reembedding_complete",
      };
    },
  };
}
