// ─────────────────────────────────────────────────────────────────────────────
// colors.ts — Extract Figma color styles and convert fills to hex/rgba strings
// ─────────────────────────────────────────────────────────────────────────────

import { GlobalColor } from "../types/elementor";
import { AnalysedFill } from "../types/figma-extended";

let _colorCounter = 0;

function makeColorId(): string {
  _colorCounter++;
  return `global-color-${_colorCounter}`;
}

/** Convert Figma r,g,b (0–1) to a CSS #rrggbb string */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert Figma r,g,b,a to a CSS rgba() string (or #hex if opaque) */
export function rgbaToString(r: number, g: number, b: number, a: number): string {
  if (a >= 0.99) return rgbToHex(r, g, b);
  const ri = Math.round(r * 255);
  const gi = Math.round(g * 255);
  const bi = Math.round(b * 255);
  return `rgba(${ri},${gi},${bi},${Math.round(a * 100) / 100})`;
}

/** Mix a color with white by the given opacity (simulates Figma opacity on a white bg) */
export function applyOpacityOnWhite(hex: string, opacity: number): string {
  // Quick approximation when we can't do proper alpha compositing
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${opacity})`;
}

/**
 * Analyse the fills array of any Figma node and return the dominant fill info.
 * We only look at the topmost visible fill.
 */
export function analyseFills(fills: readonly Paint[] | Paint[]): AnalysedFill {
  const visible = [...fills].reverse().find((f) => f.visible !== false && f.opacity !== 0);

  if (!visible) {
    return { type: "solid", color: "transparent", opacity: 0 };
  }

  const opacity = visible.opacity ?? 1;

  if (visible.type === "SOLID") {
    const { r, g, b } = visible.color;
    const a = visible.opacity ?? 1;
    return {
      type: "solid",
      color: rgbaToString(r, g, b, a),
      opacity,
    };
  }

  if (visible.type === "IMAGE") {
    return {
      type: "image",
      imageRef: visible.imageHash ?? undefined,
      opacity,
    };
  }

  if (
    visible.type === "GRADIENT_LINEAR" ||
    visible.type === "GRADIENT_RADIAL" ||
    visible.type === "GRADIENT_ANGULAR"
  ) {
    const stops = visible.gradientStops;
    if (stops && stops.length >= 2) {
      const from = rgbaToString(
        stops[0].color.r,
        stops[0].color.g,
        stops[0].color.b,
        stops[0].color.a,
      );
      const to = rgbaToString(
        stops[stops.length - 1].color.r,
        stops[stops.length - 1].color.g,
        stops[stops.length - 1].color.b,
        stops[stops.length - 1].color.a,
      );
      // Approximate gradient angle from the transform
      let angle = 135;
      if (visible.type === "GRADIENT_LINEAR" && visible.gradientTransform) {
        const [[a, b], [c, d]] = visible.gradientTransform;
        angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
        if (angle < 0) angle += 360;
      }
      return { type: "gradient", colorStop: [from, to], gradientAngle: angle, opacity };
    }
  }

  return { type: "unsupported", opacity };
}

/**
 * Extract Figma document-level color styles as Elementor Global Colors.
 * These become the starting seed for the Elementor Global Kit.
 */
export async function extractGlobalColors(): Promise<GlobalColor[]> {
  const styles = await figma.getLocalPaintStylesAsync();
  const result: GlobalColor[] = [];

  for (const style of styles) {
    if (!style.paints || style.paints.length === 0) continue;
    const fill = analyseFills(style.paints);
    if (fill.type !== "solid" || !fill.color) continue;
    result.push({
      _id: makeColorId(),
      title: style.name.replace(/\//g, " / "),
      color: fill.color,
    });
  }

  return result;
}

/**
 * Given a hex/rgba color string, find the closest matching global color name.
 * Returns the raw color if no match found.
 */
export function resolveGlobalColor(color: string, globalColors: GlobalColor[]): string {
  const match = globalColors.find((gc) => gc.color === color);
  return match ? `var(--e-global-color-${match._id})` : color;
}
