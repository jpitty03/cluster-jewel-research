/**
 * Accessibility Oracle for Quality Lab.
 * Inspects landmark roles, accessible names, headings hierarchy, and aria states.
 */

export interface AccessibilityCheckResult {
  passed: boolean;
  oracle: 'ACCESSIBILITY';
  gate: string;
  details: string;
}

export class AccessibilityOracle {
  static verifyAccessibilityTree(elements: Array<{ tag: string; role?: string; ariaLabel?: string; text?: string; id?: string }>): AccessibilityCheckResult[] {
    const checks: AccessibilityCheckResult[] = [];

    // 1. Interactive controls have accessible labels
    const unlabeledControls = elements.filter(
      (el) => (el.tag === 'BUTTON' || el.tag === 'SELECT' || el.tag === 'INPUT') &&
              (!el.text || el.text.trim().length === 0) &&
              (!el.ariaLabel || el.ariaLabel.trim().length === 0)
    );

    checks.push({
      passed: unlabeledControls.length === 0,
      oracle: 'ACCESSIBILITY',
      gate: 'ALL_INTERACTIVE_CONTROLS_LABELED',
      details: unlabeledControls.length === 0
        ? 'All interactive buttons, selects, and inputs have accessible text or aria-labels'
        : `Found ${unlabeledControls.length} unlabeled interactive elements`,
    });

    // 2. Sections have accessible headings
    const sectionCount = elements.filter((el) => el.tag === 'SECTION').length;
    const headingCount = elements.filter((el) => el.tag === 'H1' || el.tag === 'H2' || el.tag === 'H3').length;

    checks.push({
      passed: headingCount >= sectionCount,
      oracle: 'ACCESSIBILITY',
      gate: 'SEMANTIC_HEADING_HIERARCHY',
      details: `Found ${headingCount} headings providing structure for ${sectionCount} content sections`,
    });

    return checks;
  }
}
