/**
 * Greedy Packer
 * 
 * Packs items into a budget using a greedy algorithm.
 * Prioritizes items by score while respecting token limits.
 * 
 * @module compression/budget/packer
 */

/**
 * An item that can be packed
 */
export interface PackableItem {
  /** Unique identifier */
  id: string;
  /** Token count for this item */
  tokens: number;
  /** Priority score (higher = more important) */
  priority: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for packing
 */
export interface PackOptions {
  /** Minimum tokens to reserve */
  reserveTokens?: number;
  /** Maximum items to pack */
  maxItems?: number;
  /** Minimum priority to include */
  minPriority?: number;
  /** Whether to allow partial fills */
  allowPartial?: boolean;
  /** Strategy for packing */
  strategy?: 'greedy' | 'balanced';
}

/**
 * Result of packing operation
 */
export interface PackResult {
  /** Items that were packed */
  packed: PackableItem[];
  /** Items that didn't fit */
  remaining: PackableItem[];
  /** Total tokens used */
  tokensUsed: number;
  /** Tokens remaining in budget */
  tokensRemaining: number;
  /** Whether budget was fully utilized */
  fullyUtilized: boolean;
  /** Packing efficiency (0.0 - 1.0) */
  efficiency: number;
}

/**
 * Greedy Packer
 * 
 * Implements a greedy bin-packing algorithm that:
 * 1. Sorts items by priority (descending)
 * 2. Adds items until budget is exhausted
 * 3. Optionally tries to fill gaps with smaller items
 */
export class GreedyPacker {
  /**
   * Pack items into a budget
   */
  pack(
    items: PackableItem[],
    budget: number,
    options: PackOptions = {}
  ): PackResult {
    const {
      reserveTokens = 0,
      maxItems = Infinity,
      minPriority = 0,
      allowPartial = true,
      strategy = 'greedy',
    } = options;

    const availableBudget = budget - reserveTokens;
    
    if (availableBudget <= 0) {
      return {
        packed: [],
        remaining: [...items],
        tokensUsed: 0,
        tokensRemaining: budget,
        fullyUtilized: false,
        efficiency: 0,
      };
    }

    // Filter by minimum priority
    const eligible = items.filter(item => item.priority >= minPriority);

    // Sort by priority (descending)
    const sorted = [...eligible].sort((a, b) => b.priority - a.priority);

    const packed: PackableItem[] = [];
    const remaining: PackableItem[] = [];
    let tokensUsed = 0;

    if (strategy === 'greedy') {
      // Simple greedy: take highest priority items that fit
      for (const item of sorted) {
        if (packed.length >= maxItems) {
          remaining.push(item);
          continue;
        }

        if (tokensUsed + item.tokens <= availableBudget) {
          packed.push(item);
          tokensUsed += item.tokens;
        } else if (allowPartial) {
          remaining.push(item);
        } else {
          remaining.push(item);
        }
      }
    } else {
      // Balanced: try to maximize utilization
      this.packBalanced(sorted, availableBudget, maxItems, packed, remaining);
      tokensUsed = packed.reduce((sum, item) => sum + item.tokens, 0);
    }

    // Add items that weren't eligible
    for (const item of items) {
      if (!eligible.includes(item)) {
        remaining.push(item);
      }
    }

    const efficiency = availableBudget > 0 ? tokensUsed / availableBudget : 0;

    return {
      packed,
      remaining,
      tokensUsed,
      tokensRemaining: budget - tokensUsed,
      fullyUtilized: tokensUsed >= availableBudget * 0.9,
      efficiency: Math.min(1, efficiency),
    };
  }

  /**
   * Pack with a specific token allocation per item
   */
  packWithAllocation(
    items: PackableItem[],
    budget: number,
    tokensPerItem: number
  ): PackResult {
    const maxItems = Math.floor(budget / tokensPerItem);
    return this.pack(items, budget, { maxItems });
  }

  /**
   * Estimate how many items can fit
   */
  estimateCapacity(
    items: PackableItem[],
    budget: number
  ): { count: number; tokens: number } {
    const sorted = [...items].sort((a, b) => b.priority - a.priority);
    
    let count = 0;
    let tokens = 0;

    for (const item of sorted) {
      if (tokens + item.tokens <= budget) {
        count++;
        tokens += item.tokens;
      }
    }

    return { count, tokens };
  }

  /**
   * Find optimal budget distribution for multiple categories
   */
  distributeBudget(
    categories: { name: string; items: PackableItem[]; weight: number }[],
    totalBudget: number
  ): Map<string, number> {
    const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
    const distribution = new Map<string, number>();

    for (const category of categories) {
      const share = (category.weight / totalWeight) * totalBudget;
      distribution.set(category.name, Math.floor(share));
    }

    return distribution;
  }

  // Private helper methods

  private packBalanced(
    sorted: PackableItem[],
    budget: number,
    maxItems: number,
    packed: PackableItem[],
    remaining: PackableItem[]
  ): void {
    // First pass: add high-priority items
    let tokensUsed = 0;
    const skipped: PackableItem[] = [];

    for (const item of sorted) {
      if (packed.length >= maxItems) {
        remaining.push(item);
        continue;
      }

      if (tokensUsed + item.tokens <= budget) {
        packed.push(item);
        tokensUsed += item.tokens;
      } else {
        skipped.push(item);
      }
    }

    // Second pass: try to fill gaps with smaller skipped items
    const remainingBudget = budget - tokensUsed;
    const smallEnough = skipped
      .filter(item => item.tokens <= remainingBudget)
      .sort((a, b) => b.priority - a.priority);

    for (const item of smallEnough) {
      if (packed.length >= maxItems) {
        remaining.push(item);
        continue;
      }

      if (tokensUsed + item.tokens <= budget) {
        packed.push(item);
        tokensUsed += item.tokens;
        skipped.splice(skipped.indexOf(item), 1);
      }
    }

    // Add remaining skipped items
    remaining.push(...skipped);
  }
}
