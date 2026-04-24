// ─────────────────────────────────────────────────────────────────────────────
// unsupported.ts — Detect and classify design elements that cannot be
// reproduced with native Elementor tools. Every detected item is flagged;
// nothing is coded around.
// ─────────────────────────────────────────────────────────────────────────────

import { FlaggedItem } from "../types/elementor";

const _flagged: FlaggedItem[] = [];

/** Reset the flag list (call at the start of each conversion) */
export function resetFlags(): void {
  _flagged.length = 0;
}

/** Get all flagged items */
export function getFlaggedItems(): FlaggedItem[] {
  return [..._flagged];
}

/** Add a flagged item */
function flag(item: FlaggedItem): void {
  // Avoid duplicate flags for the same node + reason
  const exists = _flagged.some((f) => f.node_id === item.node_id && f.reason === item.reason);
  if (!exists) _flagged.push(item);
}

// ─────────────────────────────────────────────────────────────────────────────
// Effect Checks
// ─────────────────────────────────────────────────────────────────────────────

export function checkEffects(node: SceneNode): void {
  if (!("effects" in node) || !node.effects) return;

  for (const effect of node.effects) {
    if (!effect.visible) continue;

    if (effect.type === "BACKGROUND_BLUR" || effect.type === "LAYER_BLUR") {
      flag({
        node_id: node.id,
        node_name: node.name,
        category: "visual-effect",
        reason: `Blur effect (${effect.type === "BACKGROUND_BLUR" ? "Background Blur / Frosted Glass" : "Layer Blur"}) — Elementor has no native blur control for containers or widgets.`,
        nearest_native:
          "Remove blur and use a semi-transparent solid background color on the container instead.",
        action: "manual-review",
      });
    }

    if (effect.type === "INNER_SHADOW") {
      flag({
        node_id: node.id,
        node_name: node.name,
        category: "visual-effect",
        reason: "Inner Shadow effect — Elementor box shadow only supports outer (drop) shadows.",
        nearest_native: "Use an outer Box Shadow with low opacity as a close approximation.",
        action: "manual-review",
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fill Checks
// ─────────────────────────────────────────────────────────────────────────────

export function checkFills(node: SceneNode): boolean {
  if (!("fills" in node) || !node.fills || node.fills === figma.mixed) return false;

  let hasImage = false;

  for (const fill of node.fills) {
    if (!fill.visible) continue;

    if (fill.type === "IMAGE") hasImage = true;

    if (fill.type === "GRADIENT_ANGULAR" || fill.type === "GRADIENT_DIAMOND") {
      flag({
        node_id: node.id,
        node_name: node.name,
        category: "visual-effect",
        reason: `${fill.type === "GRADIENT_ANGULAR" ? "Angular" : "Diamond"} gradient fill — Elementor only supports linear and radial gradients.`,
        nearest_native: "Replace with a linear or radial gradient, or a flat solid color.",
        action: "manual-review",
      });
    }
  }

  return hasImage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stroke Checks
// ─────────────────────────────────────────────────────────────────────────────

export function checkStrokes(node: SceneNode): void {
  if (!("strokes" in node) || !node.strokes) return;

  for (const stroke of node.strokes) {
    if (!stroke.visible) continue;

    if (stroke.type !== "SOLID") {
      flag({
        node_id: node.id,
        node_name: node.name,
        category: "visual-effect",
        reason: `Non-solid border (${stroke.type}) — Elementor borders only support solid, dashed, dotted, and double styles.`,
        nearest_native: "Replace with a solid-color border, or export the element as a PNG image.",
        action: "manual-review",
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Checks
// ─────────────────────────────────────────────────────────────────────────────

export function checkAbsolutePositioning(node: SceneNode, parentHasLayout: boolean): void {
  if (!parentHasLayout) return;

  const hasLayout = "layoutMode" in node && (node as FrameNode).layoutMode !== "NONE";

  const isFreePositioned =
    "layoutPositioning" in node && (node as FrameNode).layoutPositioning === "ABSOLUTE";

  if (isFreePositioned) {
    flag({
      node_id: node.id,
      node_name: node.name,
      category: "layout",
      reason:
        "Absolutely positioned element inside an auto-layout frame — Elementor containers are flow-based and do not support absolute child positioning.",
      nearest_native:
        "Restructure the layout so this element is part of the normal document flow, or create a separate container for it.",
      action: "manual-review",
    });
  }
}

export function checkOverlappingChildren(node: SceneNode): void {
  if (!("children" in node)) return;
  const children = (node as FrameNode).children;
  if (!children || children.length < 2) return;

  // Check if any two siblings overlap
  for (let i = 0; i < children.length - 1; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i];
      const b = children[j];
      if (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      ) {
        flag({
          node_id: node.id,
          node_name: node.name,
          category: "layout",
          reason: `Overlapping child layers detected ("${a.name}" and "${b.name}") — Elementor does not support z-index stacking of arbitrary elements.`,
          nearest_native:
            "Restructure as separate sequential containers, or flatten the visual into an exported image.",
          action: "manual-review",
        });
        return; // one flag per parent is enough
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Node Type Checks
// ─────────────────────────────────────────────────────────────────────────────

export function checkRotation(node: SceneNode): void {
  const rot = "rotation" in node ? (node as FrameNode).rotation : 0;
  if (rot !== 0 && Math.abs(rot) > 0.5) {
    flag({
      node_id: node.id,
      node_name: node.name,
      category: "layout",
      reason: `Rotated element (${Math.round(rot)}°) — Elementor native widgets and containers cannot be rotated via the layout system.`,
      nearest_native:
        "Export this element as an image at the correct angle, or use an image with transparent background.",
      action: "export-asset",
    });
  }
}

export function checkMask(node: SceneNode): void {
  if ("isMask" in node && (node as FrameNode).isMask) {
    flag({
      node_id: node.id,
      node_name: node.name,
      category: "visual-effect",
      reason: "Layer mask — Elementor does not support masking. The mask shape will be ignored.",
      nearest_native:
        "Export the masked content as a PNG with transparency, or use the Image widget with object-fit: cover.",
      action: "export-asset",
    });
  }
}

export function checkBlendMode(node: SceneNode): void {
  const bm = "blendMode" in node ? (node as FrameNode).blendMode : "NORMAL";
  if (bm && bm !== "NORMAL" && bm !== "PASS_THROUGH") {
    flag({
      node_id: node.id,
      node_name: node.name,
      category: "visual-effect",
      reason: `Blend mode "${bm}" — Elementor has no native blend mode control for containers or widgets.`,
      nearest_native: "Flatten this layer with its blend mode applied into a PNG image export.",
      action: "export-asset",
    });
  }
}

export function checkOpacity(node: SceneNode): number {
  const opacity = "opacity" in node ? ((node as FrameNode).opacity ?? 1) : 1;
  if (opacity < 1 && opacity > 0) {
    // Opacity IS supported on Elementor containers/widgets, so no flag — just return it.
    return opacity;
  }
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mixed Text Check
// ─────────────────────────────────────────────────────────────────────────────

export function checkMixedTextStyles(node: TextNode): void {
  if (
    node.fontSize === figma.mixed ||
    node.fontName === figma.mixed ||
    node.fills === figma.mixed
  ) {
    flag({
      node_id: node.id,
      node_name: node.name,
      category: "typography",
      reason:
        "Text node has mixed inline styles (different font sizes, weights, or colors in the same block). Elementor Text Editor widget applies one style per block.",
      nearest_native:
        "Split the text into separate Text Editor or Heading widgets, one per style segment.",
      action: "manual-review",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute Fidelity Score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a 0–100 fidelity score based on the number and severity of flags
 * relative to the total number of converted nodes.
 */
export function computeFidelityScore(totalNodes: number): number {
  if (totalNodes === 0) return 0;
  const flags = _flagged.length;
  const penalty = Math.min(flags / totalNodes, 1);
  const raw = Math.round((1 - penalty) * 100);
  return Math.max(0, raw);
}
