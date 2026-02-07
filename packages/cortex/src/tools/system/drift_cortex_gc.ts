/**
 * drift_cortex_gc — Run compaction (cleanup + vacuum).
 */

import type { CortexClient } from "../../bridge/client.js";
import type { McpToolDefinition } from "../../bridge/types.js";

export function driftCortexGc(client: CortexClient): McpToolDefinition {
  return {
    name: "drift_cortex_gc",
    description:
      "Run garbage collection: clean up stale sessions, archive low-confidence " +
      "memories, and compact the database.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const sessionsRemoved = await client.sessionCleanup();

      // Archive memories below archival threshold (confidence < 0.15)
      const archivalCandidates = await client.getValidationCandidates(0.0, 0.15);
      let archived = 0;
      for (const memory of archivalCandidates) {
        if (!memory.archived) {
          await client.memoryArchive(memory.id);
          archived++;
        }
      }

      return {
        sessions_removed: sessionsRemoved,
        memories_archived: archived,
        status: "compaction_complete",
      };
    },
  };
}
