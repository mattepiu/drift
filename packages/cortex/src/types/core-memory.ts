/**
 * Core Memory Type
 * 
 * Permanent memory that defines project identity, team conventions,
 * critical constraints, and user preferences. Never decays.
 */

import type { BaseMemory } from './memory.js';

/**
 * Project identity information
 */
export interface ProjectIdentity {
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Technology stack (e.g., ['TypeScript', 'React', 'PostgreSQL']) */
  techStack: string[];
  /** Primary programming language */
  primaryLanguage: string;
  /** Frameworks used */
  frameworks: string[];
  /** Repository URL */
  repository?: string;
}

/**
 * Team conventions
 */
export interface TeamConventions {
  /** Naming conventions (e.g., { 'components': 'PascalCase', 'functions': 'camelCase' }) */
  namingConventions?: Record<string, string>;
  /** File structure description */
  fileStructure?: string;
  /** Testing approach description */
  testingApproach?: string;
  /** Code review process */
  codeReviewProcess?: string;
  /** Git branching strategy */
  branchingStrategy?: string;
}

/**
 * Critical constraint reference
 */
export interface CriticalConstraint {
  /** Constraint ID from Drift's constraint system */
  id: string;
  /** Human-readable description */
  description: string;
  /** Always critical for core constraints */
  severity: 'critical';
}

/**
 * User preferences for AI interactions
 */
export interface UserPreferences {
  /** Response verbosity level */
  verbosity: 'minimal' | 'normal' | 'detailed';
  /** Code style preferences */
  codeStyle?: Record<string, unknown>;
  /** Areas to focus on */
  focusAreas?: string[];
  /** Topics to avoid */
  avoidTopics?: string[];
}

/**
 * Core Memory - Permanent project identity and preferences
 * 
 * Half-life: Infinity (never decays)
 */
export interface CoreMemory extends BaseMemory {
  type: 'core';

  /** Project identity information */
  project: ProjectIdentity;

  /** Team conventions */
  conventions: TeamConventions;

  /** Critical constraints that are always enforced */
  criticalConstraints: CriticalConstraint[];

  /** User preferences for AI interactions */
  preferences: UserPreferences;
}
