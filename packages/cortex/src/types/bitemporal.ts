/**
 * Bitemporal Time Types
 * 
 * Bitemporal tracking allows us to answer two distinct questions:
 * 1. Transaction Time: When did we LEARN this? (recordedAt)
 * 2. Valid Time: When was this TRUE? (validFrom, validUntil)
 * 
 * This enables powerful queries like:
 * - "What did we know about X as of last Tuesday?"
 * - "What was true about X during the v2.0 release?"
 */

/**
 * Transaction time tracks when we recorded the memory
 */
export interface TransactionTime {
  /** ISO timestamp when this memory was recorded */
  recordedAt: string;
  /** Who or what created this memory (user, system, consolidation) */
  recordedBy?: string;
}

/**
 * Valid time tracks when the knowledge was/is true
 */
export interface ValidTime {
  /** ISO timestamp when this knowledge became true */
  validFrom: string;
  /** ISO timestamp when this knowledge stopped being true (null = still current) */
  validUntil?: string;
}

/**
 * Combined bitemporal tracking
 */
export interface BitemporalTracking {
  transactionTime: TransactionTime;
  validTime: ValidTime;
}

/**
 * Query scope for bitemporal queries
 */
export interface BitemporalScope {
  /** Query as of this transaction time (what we knew then) */
  asOf?: string;
  /** Query for knowledge valid at this time */
  validAt?: string;
}
