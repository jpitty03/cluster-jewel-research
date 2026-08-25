/**
 * Layout & Geometry Oracle for Quality Lab.
 * Validates responsive geometry, clipping, and absence of horizontal overflow.
 */

export interface LayoutCheckResult {
  passed: boolean;
  oracle: 'LAYOUT';
  gate: string;
  viewportWidth: number;
  details: string;
}

export class LayoutOracle {
  static verifyViewportGeometry(viewportWidth: number, documentScrollWidth: number, bodyScrollWidth: number): LayoutCheckResult[] {
    const checks: LayoutCheckResult[] = [];
    const maxAllowedWidth = viewportWidth + 1; // 1px tolerance for sub-pixel antialiasing

    const docFits = documentScrollWidth <= maxAllowedWidth;
    const bodyFits = bodyScrollWidth <= maxAllowedWidth;

    checks.push({
      passed: docFits && bodyFits,
      oracle: 'LAYOUT',
      gate: `NO_HORIZONTAL_OVERFLOW_${viewportWidth}PX`,
      viewportWidth,
      details: (docFits && bodyFits)
        ? `Viewport ${viewportWidth}px has 0 horizontal overflow (docWidth=${documentScrollWidth}px, bodyWidth=${bodyScrollWidth}px)`
        : `Horizontal overflow detected at ${viewportWidth}px: docWidth=${documentScrollWidth}px, bodyWidth=${bodyScrollWidth}px`,
    });

    return checks;
  }
}
