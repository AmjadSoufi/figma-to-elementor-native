// ─────────────────────────────────────────────────────────────────────────────
// units.ts — px → rem conversion helpers.
//
// Rule: any value a human would tune for accessibility (typography, spacing,
// radii, widget sizes) is emitted in rem with a 16px root. Values that don't
// benefit from scaling (hairline strokes ≤ 2px, shadow offsets/blurs, widths
// expressed as %, Figma-native px widths of fixed columns) stay in px.
// ─────────────────────────────────────────────────────────────────────────────

import { ElementorSize, ElementorSpacing, ElementorUnit } from '../types/elementor';

export const REM_ROOT = 16;

/** Round to 3 decimals so JSON stays readable (0.0625rem, 1.25rem, …). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Convert a px number to an Elementor rem Size. */
export function pxToRemSize(px: number): ElementorSize {
  return { unit: 'rem', size: round3(px / REM_ROOT) };
}

/** Emit a px Size without any rem conversion — for stroke weights, shadows. */
export function pxSize(px: number): ElementorSize {
  return { unit: 'px', size: Math.round(px) };
}

/** 4-sided spacing in rem (padding / margin). */
export function remSpacing(t: number, r: number, b: number, l: number): ElementorSpacing {
  return {
    top: String(round3(t / REM_ROOT)),
    right: String(round3(r / REM_ROOT)),
    bottom: String(round3(b / REM_ROOT)),
    left: String(round3(l / REM_ROOT)),
    unit: 'rem',
    isLinked: t === r && r === b && b === l,
  };
}

/** 4-sided spacing in px (for border widths). */
export function pxSpacing(t: number, r: number, b: number, l: number): ElementorSpacing {
  return {
    top: String(Math.round(t)),
    right: String(Math.round(r)),
    bottom: String(Math.round(b)),
    left: String(Math.round(l)),
    unit: 'px',
    isLinked: t === r && r === b && b === l,
  };
}
