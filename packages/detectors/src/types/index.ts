/**
 * Types Detectors - Type pattern detection
 *
 * Exports all type-related detectors for detecting TypeScript type patterns.
 *
 * @requirements 18.1-18.7 - Type pattern detection
 */

// File Location Detector
export {
  FileLocationDetector,
  createFileLocationDetector,
  analyzeFileLocation,
  shouldExcludeFile as shouldExcludeFileLocation,
  isTypeFile,
  detectCentralizedTypes,
  detectCoLocatedTypes,
  detectBarrelExports,
  detectTypeOnlyModule,
  detectDeclarationFile,
  detectSharedTypes,
  detectDomainTypes,
  detectScatteredTypesViolations,
  detectInconsistentLocationViolations,
  CENTRALIZED_TYPES_PATTERNS,
  CO_LOCATED_TYPES_PATTERNS,
  BARREL_EXPORT_PATTERNS,
  TYPE_ONLY_MODULE_PATTERNS,
  DECLARATION_FILE_PATTERNS,
  SHARED_TYPES_PATTERNS,
  DOMAIN_TYPES_PATTERNS,
} from './file-location.js';
export type {
  FileLocationPatternType,
  FileLocationViolationType,
  FileLocationPatternInfo,
  FileLocationViolationInfo,
  FileLocationAnalysis,
} from './file-location.js';

// Naming Conventions Detector
export {
  NamingConventionsDetector,
  createNamingConventionsDetector,
  analyzeNamingConventions,
  shouldExcludeFile as shouldExcludeNamingConventions,
  detectPascalCaseTypes,
  detectPascalCaseInterfaces,
  detectIPrefixInterfaces,
  detectTPrefixTypes,
  detectPropsSuffix,
  detectStateSuffix,
  detectConfigSuffix,
  detectEnumPascalCase,
  detectGenericSingleLetter,
  detectNonPascalCaseViolations,
  detectHungarianNotationViolations,
  detectUnclearGenericViolations,
  PASCAL_CASE_TYPE_PATTERNS,
  PASCAL_CASE_INTERFACE_PATTERNS,
  I_PREFIX_INTERFACE_PATTERNS,
  T_PREFIX_TYPE_PATTERNS,
} from './naming-conventions.js';

export type {
  NamingConventionPatternType,
  NamingConventionViolationType,
  NamingConventionPatternInfo,
  NamingConventionViolationInfo,
  NamingConventionAnalysis,
} from './naming-conventions.js';

// Interface vs Type Detector
export {
  InterfaceVsTypeDetector,
  createInterfaceVsTypeDetector,
  analyzeInterfaceVsType,
  shouldExcludeFile as shouldExcludeInterfaceVsType,
  detectInterfaceObject,
  detectInterfaceExtends,
  detectInterfaceImplements,
  detectTypeUnion,
  detectTypeIntersection,
  detectTypeMapped,
  detectTypeConditional,
  detectTypeUtility,
  detectDeclarationMerging,
  detectTypeForObjectViolations,
  detectUnnecessaryTypeAliasViolations,
  INTERFACE_OBJECT_PATTERNS,
  INTERFACE_EXTENDS_PATTERNS,
  TYPE_UNION_PATTERNS,
  TYPE_INTERSECTION_PATTERNS,
  TYPE_MAPPED_PATTERNS,
  TYPE_CONDITIONAL_PATTERNS,
  TYPE_UTILITY_PATTERNS,
} from './interface-vs-type.js';
export type {
  InterfaceVsTypePatternType,
  InterfaceVsTypeViolationType,
  InterfaceVsTypePatternInfo,
  InterfaceVsTypeViolationInfo,
  InterfaceVsTypeAnalysis,
} from './interface-vs-type.js';

// Generic Patterns Detector
export {
  GenericPatternsDetector,
  createGenericPatternsDetector,
  analyzeGenericPatterns,
  shouldExcludeFile as shouldExcludeGenericPatterns,
  detectGenericFunctions,
  detectGenericArrowFunctions,
  detectGenericClasses,
  detectGenericInterfaces,
  detectGenericTypeAliases,
  detectConstrainedGenerics,
  detectDefaultGenerics,
  detectMultipleTypeParams,
  detectGenericMethods,
  detectInferKeyword,
  detectKeyofConstraint,
  detectMappedGenerics,
  detectConditionalGenerics,
  detectOverlyComplexGenerics,
  detectUnclearGenericNames,
  detectTooManyTypeParams,
  GENERIC_FUNCTION_PATTERNS,
  GENERIC_ARROW_FUNCTION_PATTERNS,
  GENERIC_CLASS_PATTERNS,
  GENERIC_INTERFACE_PATTERNS,
  GENERIC_TYPE_ALIAS_PATTERNS,
  CONSTRAINED_GENERIC_PATTERNS,
  DEFAULT_GENERIC_PATTERNS,
  MULTIPLE_TYPE_PARAMS_PATTERNS,
} from './generic-patterns.js';
export type {
  GenericPatternType,
  GenericViolationType,
  GenericPatternInfo,
  GenericViolationInfo,
  GenericPatternsAnalysis,
} from './generic-patterns.js';

// Utility Types Detector
export {
  UtilityTypesDetector,
  createUtilityTypesDetector,
  analyzeUtilityTypes,
  shouldExcludeFile as shouldExcludeUtilityTypes,
  detectPartial,
  detectRequired,
  detectReadonly,
  detectPick,
  detectOmit,
  detectRecord,
  detectExclude,
  detectExtract,
  detectNonNullable,
  detectReturnType,
  detectParameters,
  detectInstanceType,
  detectAwaited,
  detectThisType,
  detectCustomMapped,
  detectCustomConditional,
  detectTemplateLiteral,
  detectRecursiveType,
  detectBrandedType,
  detectDeepPartial,
  detectDeepReadonly,
  detectRedundantUtilityViolations,
  detectNestedUtilityViolations,
  detectComplexUtilityChainViolations,
  PARTIAL_PATTERNS,
  REQUIRED_PATTERNS,
  READONLY_PATTERNS,
  PICK_PATTERNS,
  OMIT_PATTERNS,
  RECORD_PATTERNS,
} from './utility-types.js';
export type {
  UtilityTypePatternType,
  UtilityTypeViolationType,
  UtilityTypePatternInfo,
  UtilityTypeViolationInfo,
  UtilityTypesAnalysis,
} from './utility-types.js';

// Type Assertions Detector
export {
  TypeAssertionsDetector,
  createTypeAssertionsDetector,
  analyzeTypeAssertions,
  shouldExcludeFile as shouldExcludeTypeAssertions,
  detectAsAssertions,
  detectAsConst,
  detectAsUnknown,
  detectAsAny,
  detectAngleBracket,
  detectNonNullAssertion,
  detectDefiniteAssignment,
  detectSatisfies,
  detectTypeGuardTypeof,
  detectTypeGuardInstanceof,
  detectTypeGuardIn,
  detectTypePredicate,
  detectAssertionFunction,
  detectDoubleAssertion,
  detectUnsafeAsAnyViolations,
  detectExcessiveNonNullViolations,
  detectDoubleAssertionViolations,
  detectUnnecessaryAssertionViolations,
  AS_ASSERTION_PATTERNS,
  AS_CONST_PATTERNS,
  AS_UNKNOWN_PATTERNS,
  AS_ANY_PATTERNS,
  NON_NULL_ASSERTION_PATTERNS,
  SATISFIES_PATTERNS,
  TYPE_GUARD_TYPEOF_PATTERNS,
  TYPE_GUARD_INSTANCEOF_PATTERNS,
  TYPE_PREDICATE_PATTERNS,
} from './type-assertions.js';
export type {
  TypeAssertionPatternType,
  TypeAssertionViolationType,
  TypeAssertionPatternInfo,
  TypeAssertionViolationInfo,
  TypeAssertionsAnalysis,
} from './type-assertions.js';

// Any Usage Detector
export {
  AnyUsageDetector,
  createAnyUsageDetector,
  analyzeAnyUsage,
  shouldExcludeFile as shouldExcludeAnyUsage,
  detectExplicitAnyAnnotation,
  detectAnyParameter,
  detectAnyReturnType,
  detectAnyGeneric,
  detectAnyArray,
  detectAnyRecord,
  detectAnyObject,
  detectAnyFunction,
  detectAnyPromise,
  detectAnyCast,
  detectUnknownUsage,
  detectNeverUsage,
  detectObjectType,
  detectFunctionType,
  detectExplicitAnyViolations,
  detectAnyInPublicApiViolations,
  detectAnySpreadViolations,
  detectAnyIndexSignatureViolations,
  EXPLICIT_ANY_ANNOTATION_PATTERNS,
  ANY_PARAMETER_PATTERNS,
  ANY_RETURN_TYPE_PATTERNS,
  ANY_GENERIC_PATTERNS,
  ANY_ARRAY_PATTERNS,
  ANY_RECORD_PATTERNS,
  UNKNOWN_USAGE_PATTERNS,
  NEVER_USAGE_PATTERNS,
} from './any-usage.js';
export type {
  AnyUsagePatternType,
  AnyUsageViolationType,
  AnyUsagePatternInfo,
  AnyUsageViolationInfo,
  AnyUsageAnalysis,
} from './any-usage.js';

// ============================================================================
// Factory Function
// ============================================================================

import { AnyUsageDetector } from './any-usage.js';
import { FileLocationDetector } from './file-location.js';
import { GenericPatternsDetector } from './generic-patterns.js';
import { InterfaceVsTypeDetector } from './interface-vs-type.js';
import { NamingConventionsDetector } from './naming-conventions.js';
import { TypeAssertionsDetector } from './type-assertions.js';
import { UtilityTypesDetector } from './utility-types.js';

export type TypesDetector =
  | FileLocationDetector
  | NamingConventionsDetector
  | InterfaceVsTypeDetector
  | GenericPatternsDetector
  | UtilityTypesDetector
  | TypeAssertionsDetector
  | AnyUsageDetector;

export function createTypesDetectors(): TypesDetector[] {
  return [
    new FileLocationDetector(),
    new NamingConventionsDetector(),
    new InterfaceVsTypeDetector(),
    new GenericPatternsDetector(),
    new UtilityTypesDetector(),
    new TypeAssertionsDetector(),
    new AnyUsageDetector(),
  ];
}

// ============================================================================
// Learning-Based Detectors
// ============================================================================

// Interface vs Type Learning Detector
export {
  InterfaceVsTypeLearningDetector,
  createInterfaceVsTypeLearningDetector,
  type InterfaceVsTypeConventions,
  type TypeDefinitionStyle,
  type TypeUsageContext,
} from './interface-vs-type-learning.js';

// Type Naming Conventions Learning Detector
export {
  TypeNamingConventionsLearningDetector,
  createTypeNamingConventionsLearningDetector,
  type TypeNamingConventions,
  type TypeNamingStyle,
} from './naming-conventions-learning.js';

// Utility Types Learning Detector
export {
  UtilityTypesLearningDetector,
  createUtilityTypesLearningDetector,
  type UtilityTypesConventions,
  type UtilityTypeCategory,
} from './utility-types-learning.js';

// Generic Patterns Learning Detector
export {
  GenericPatternsLearningDetector,
  createGenericPatternsLearningDetector,
  type GenericPatternsConventions,
  type GenericNamingStyle,
} from './generic-patterns-learning.js';

// Any Usage Learning Detector
export {
  AnyUsageLearningDetector,
  createAnyUsageLearningDetector,
  type AnyUsageConventions,
  type AnyAlternative,
} from './any-usage-learning.js';

// Type File Location Learning Detector
export {
  TypeFileLocationLearningDetector,
  createTypeFileLocationLearningDetector,
  type TypeFileLocationConventions,
  type TypeFileLocation,
} from './file-location-learning.js';

// Type Assertions Learning Detector
export {
  TypeAssertionsLearningDetector,
  createTypeAssertionsLearningDetector,
  type TypeAssertionsConventions,
  type AssertionSyntax,
  type NonNullUsage,
} from './type-assertions-learning.js';

// ============================================================================
// Semantic Detectors (Language-Agnostic)
// ============================================================================

export {
  FileLocationSemanticDetector,
  createFileLocationSemanticDetector,
} from './file-location-semantic.js';

export {
  NamingConventionsSemanticDetector,
  createNamingConventionsSemanticDetector,
} from './naming-conventions-semantic.js';

export {
  InterfaceVsTypeSemanticDetector,
  createInterfaceVsTypeSemanticDetector,
} from './interface-vs-type-semantic.js';

export {
  GenericPatternsSemanticDetector,
  createGenericPatternsSemanticDetector,
} from './generic-patterns-semantic.js';

export {
  UtilityTypesSemanticDetector,
  createUtilityTypesSemanticDetector,
} from './utility-types-semantic.js';

export {
  TypeAssertionsSemanticDetector,
  createTypeAssertionsSemanticDetector,
} from './type-assertions-semantic.js';

export {
  AnyUsageSemanticDetector,
  createAnyUsageSemanticDetector,
} from './any-usage-semantic.js';

// ============================================================================
// C# Type System Detectors
// ============================================================================

export * from './aspnet/index.js';
