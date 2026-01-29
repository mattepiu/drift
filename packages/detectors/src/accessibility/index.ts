/**
 * Accessibility Detectors - Accessibility pattern detection
 * @requirements 20.1-20.6 - Accessibility pattern detection
 */

export { SemanticHtmlDetector, createSemanticHtmlDetector, analyzeSemanticHtml, shouldExcludeFile as shouldExcludeSemanticHtml, detectHeaderElement, detectNavElement, detectMainElement, detectFooterElement, detectArticleElement, detectSectionElement, detectAsideElement, detectFigureElement, detectLandmarkRole, detectDivSoupViolations, HEADER_ELEMENT_PATTERNS, NAV_ELEMENT_PATTERNS, MAIN_ELEMENT_PATTERNS, FOOTER_ELEMENT_PATTERNS } from './semantic-html.js';
export type { SemanticHtmlPatternType, SemanticHtmlViolationType, SemanticHtmlPatternInfo, SemanticHtmlViolationInfo, SemanticHtmlAnalysis } from './semantic-html.js';

export { AriaRolesDetector, createAriaRolesDetector, analyzeAriaRoles, shouldExcludeFile as shouldExcludeAriaRoles, detectAriaRole, detectAriaLabel, detectAriaDescribedby, detectAriaHidden, detectAriaLive, detectAriaExpanded, detectAriaControls, detectRedundantRoleViolations, ARIA_ROLE_PATTERNS, ARIA_LABEL_PATTERNS, ARIA_LIVE_PATTERNS } from './aria-roles.js';
export type { AriaRolesPatternType, AriaRolesViolationType, AriaRolesPatternInfo, AriaRolesViolationInfo, AriaRolesAnalysis } from './aria-roles.js';

export { KeyboardNavDetector, createKeyboardNavDetector, analyzeKeyboardNav, shouldExcludeFile as shouldExcludeKeyboardNav, detectTabindex, detectOnKeyDown, detectOnKeyUp, detectOnKeyPress, detectFocusTrap, detectSkipLink, detectPositiveTabindexViolations, TABINDEX_PATTERNS, ONKEYDOWN_PATTERNS, FOCUS_TRAP_PATTERNS, SKIP_LINK_PATTERNS } from './keyboard-nav.js';
export type { KeyboardNavPatternType, KeyboardNavViolationType, KeyboardNavPatternInfo, KeyboardNavViolationInfo, KeyboardNavAnalysis } from './keyboard-nav.js';

export { FocusManagementDetector, createFocusManagementDetector, analyzeFocusManagement, shouldExcludeFile as shouldExcludeFocusManagement, detectFocusVisible, detectFocusWithin, detectUseFocus, detectAutoFocus, detectFocusRef, detectFocusRing, detectOutlineNoneViolations, FOCUS_VISIBLE_PATTERNS, FOCUS_RING_PATTERNS, OUTLINE_NONE_PATTERNS } from './focus-management.js';
export type { FocusManagementPatternType, FocusManagementViolationType, FocusManagementPatternInfo, FocusManagementViolationInfo, FocusManagementAnalysis } from './focus-management.js';

export { HeadingHierarchyDetector, createHeadingHierarchyDetector, analyzeHeadingHierarchy, shouldExcludeFile as shouldExcludeHeadingHierarchy, detectH1, detectH2, detectH3, detectH4, detectH5, detectH6, detectHeadingComponent, detectMultipleH1Violations, detectEmptyHeadingViolations, H1_PATTERNS, H2_PATTERNS, H3_PATTERNS } from './heading-hierarchy.js';
export type { HeadingHierarchyPatternType, HeadingHierarchyViolationType, HeadingHierarchyPatternInfo, HeadingHierarchyViolationInfo, HeadingHierarchyAnalysis } from './heading-hierarchy.js';

export { AltTextDetector, createAltTextDetector, analyzeAltText, shouldExcludeFile as shouldExcludeAltText, detectImgAlt, detectDecorativeAlt, detectSvgTitle, detectIconLabel, detectFigureCaption, detectMissingAltViolations, detectRedundantAltViolations, IMG_ALT_PATTERNS, DECORATIVE_ALT_PATTERNS, MISSING_ALT_PATTERNS } from './alt-text.js';
export type { AltTextPatternType, AltTextViolationType, AltTextPatternInfo, AltTextViolationInfo, AltTextAnalysis } from './alt-text.js';

// Factory Function
import { AltTextDetector } from './alt-text.js';
import { AriaRolesDetector } from './aria-roles.js';
import { FocusManagementDetector } from './focus-management.js';
import { HeadingHierarchyDetector } from './heading-hierarchy.js';
import { KeyboardNavDetector } from './keyboard-nav.js';
import { SemanticHtmlDetector } from './semantic-html.js';

export type AccessibilityDetector = SemanticHtmlDetector | AriaRolesDetector | KeyboardNavDetector | FocusManagementDetector | HeadingHierarchyDetector | AltTextDetector;

export function createAccessibilityDetectors(): AccessibilityDetector[] {
  return [new SemanticHtmlDetector(), new AriaRolesDetector(), new KeyboardNavDetector(), new FocusManagementDetector(), new HeadingHierarchyDetector(), new AltTextDetector()];
}

// ============================================================================
// Learning-Based Detectors
// ============================================================================

// ARIA Roles Learning Detector
export {
  AriaRolesLearningDetector,
  createAriaRolesLearningDetector,
  type AriaRolesConventions,
  type AriaUsageStyle,
} from './aria-roles-learning.js';

// Keyboard Navigation Learning Detector
export {
  KeyboardNavLearningDetector,
  createKeyboardNavLearningDetector,
  type KeyboardNavConventions,
  type KeyboardHandlingStyle,
} from './keyboard-nav-learning.js';

// Alt Text Learning Detector
export {
  AltTextLearningDetector,
  createAltTextLearningDetector,
  type AltTextConventions,
  type AltTextStyle,
} from './alt-text-learning.js';

// Semantic HTML Learning Detector
export {
  SemanticHtmlLearningDetector,
  createSemanticHtmlLearningDetector,
  type SemanticHtmlConventions,
  type SemanticElement,
  type LandmarkUsage,
} from './semantic-html-learning.js';

// Focus Management Learning Detector
export {
  FocusManagementLearningDetector,
  createFocusManagementLearningDetector,
  type FocusManagementConventions,
  type FocusTrapMethod,
  type FocusRingStyle,
} from './focus-management-learning.js';

// Heading Hierarchy Learning Detector
export {
  HeadingHierarchyLearningDetector,
  createHeadingHierarchyLearningDetector,
  type HeadingHierarchyConventions,
  type HeadingStyle,
  type HeadingComponent,
} from './heading-hierarchy-learning.js';

// ============================================================================
// Semantic Detectors (Language-Agnostic)
// ============================================================================

export {
  SemanticHtmlSemanticDetector,
  createSemanticHtmlSemanticDetector,
} from './semantic-html-semantic.js';

export {
  AriaRolesSemanticDetector,
  createAriaRolesSemanticDetector,
} from './aria-roles-semantic.js';

export {
  KeyboardNavSemanticDetector,
  createKeyboardNavSemanticDetector,
} from './keyboard-nav-semantic.js';

export {
  FocusManagementSemanticDetector,
  createFocusManagementSemanticDetector,
} from './focus-management-semantic.js';

export {
  HeadingHierarchySemanticDetector,
  createHeadingHierarchySemanticDetector,
} from './heading-hierarchy-semantic.js';

export {
  AltTextSemanticDetector,
  createAltTextSemanticDetector,
} from './alt-text-semantic.js';
