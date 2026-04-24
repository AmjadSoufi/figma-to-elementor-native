// ─────────────────────────────────────────────────────────────────────────────
// preflight.ts — Scan the selected Figma frame before conversion and produce
// a readiness report with actionable suggestions.
// ─────────────────────────────────────────────────────────────────────────────

import { PreflightReport, PreflightIssue } from "../types/figma-extended";
import { ConversionOptions } from "../types/figma-extended";

type TraversalNode = SceneNode & { children?: readonly SceneNode[] };

interface Stats {
  totalNodes: number;
  autoLayoutNodes: number;
  freePositionedNodes: number;
  unsupportedEffectNodes: number;
  blurNodes: { id: string; name: string }[];
  absoluteNodes: { id: string; name: string }[];
  genericNames: { id: string; name: string }[];
  noColorStyles: { id: string; name: string }[];
  noTextStyles: { id: string; name: string }[];
  overlappingPairs: {
    parentName: string;
    a: { id: string; name: string };
    b: { id: string; name: string };
  }[];
  maskNodes: { id: string; name: string }[];
  blendModeNodes: { id: string; name: string }[];
  rotatedNodes: { id: string; name: string }[];
  colorStylesUsed: boolean;
  textStylesUsed: boolean;
}

function makeStats(): Stats {
  return {
    totalNodes: 0,
    autoLayoutNodes: 0,
    freePositionedNodes: 0,
    unsupportedEffectNodes: 0,
    blurNodes: [],
    absoluteNodes: [],
    genericNames: [],
    noColorStyles: [],
    noTextStyles: [],
    overlappingPairs: [],
    maskNodes: [],
    blendModeNodes: [],
    rotatedNodes: [],
    colorStylesUsed: false,
    textStylesUsed: false,
  };
}

const GENERIC_NAME_PATTERNS = [
  /^Frame\s*\d*/i,
  /^Group\s*\d*/i,
  /^Rectangle\s*\d*/i,
  /^Ellipse\s*\d*/i,
  /^Vector\s*\d*/i,
  /^Layer\s*\d*/i,
  /^Text\s*\d*/i,
  /^Polygon\s*\d*/i,
];

function isGenericName(name: string): boolean {
  return GENERIC_NAME_PATTERNS.some((p) => p.test(name.trim()));
}

type OverlapPair = {
  parentName: string;
  a: { id: string; name: string };
  b: { id: string; name: string };
};

function findOverlappingPairs(node: TraversalNode): OverlapPair[] {
  const children = node.children?.filter((c) => c.visible !== false);
  if (!children || children.length < 2) return [];
  const pairs: OverlapPair[] = [];
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
        pairs.push({
          parentName: node.name,
          a: { id: a.id, name: a.name },
          b: { id: b.id, name: b.name },
        });
      }
    }
  }
  return pairs;
}

function walk(node: SceneNode, stats: Stats, depth: number, options?: ConversionOptions): void {
  // Skip hidden layers and their entire subtree — conversion ignores them, so
  // they shouldn't contribute to the readiness score either.
  if ("visible" in node && node.visible === false) return;

  const lName = node.name.toLowerCase();

  if (options?.skipHeaderFooter === true && depth === 1) {
    if (lName.includes("header") || lName.includes("footer") || lName.includes("nav")) {
      return;
    }
  }

  if (node.type === "VECTOR" || node.type === "STAR" || node.type === "POLYGON") {
    return;
  }

  stats.totalNodes++;

  // Generic name check
  if (isGenericName(node.name)) {
    stats.genericNames.push({ id: node.id, name: node.name });
  }

  // Rotation
  if ("rotation" in node && Math.abs((node as FrameNode).rotation ?? 0) > 0.5) {
    stats.rotatedNodes.push({ id: node.id, name: node.name });
    stats.unsupportedEffectNodes++;
  }

  // Blend mode
  const bm = "blendMode" in node ? (node as FrameNode).blendMode : "NORMAL";
  if (bm && bm !== "NORMAL" && bm !== "PASS_THROUGH") {
    stats.blendModeNodes.push({ id: node.id, name: node.name });
    stats.unsupportedEffectNodes++;
  }

  // Mask
  if ("isMask" in node && (node as FrameNode).isMask) {
    stats.maskNodes.push({ id: node.id, name: node.name });
    stats.unsupportedEffectNodes++;
  }

  // Effects
  if ("effects" in node && node.effects) {
    for (const eff of node.effects) {
      if (!eff.visible) continue;
      if (eff.type === "BACKGROUND_BLUR" || eff.type === "LAYER_BLUR") {
        stats.blurNodes.push({ id: node.id, name: node.name });
        stats.unsupportedEffectNodes++;
      }
    }
  }

  // Layout
  if ("layoutMode" in node) {
    const frame = node as FrameNode;
    if (frame.layoutMode !== "NONE") {
      stats.autoLayoutNodes++;
    }
    if (frame.layoutPositioning === "ABSOLUTE") {
      stats.absoluteNodes.push({ id: node.id, name: node.name });
      stats.freePositionedNodes++;
    }
  }

  // Overlapping children detection
  if ("children" in node) {
    const pairs = findOverlappingPairs(node as TraversalNode);
    for (const pair of pairs) {
      stats.overlappingPairs.push(pair);
    }
  }

  // Pure vector nodes skipped above

  // Color styles
  if ("fillStyleId" in node && node.fillStyleId) {
    if (typeof node.fillStyleId === "string" && node.fillStyleId.length > 0) {
      stats.colorStylesUsed = true;
    }
  }

  // Text styles
  if (node.type === "TEXT" && "textStyleId" in node) {
    const tsid = (node as TextNode).textStyleId;
    if (typeof tsid === "string" && tsid.length > 0) {
      stats.textStylesUsed = true;
    }
  }

  // Recurse
  if ("children" in node) {
    for (const child of (node as TraversalNode).children ?? []) {
      walk(child, stats, depth + 1, options);
    }
  }
}

function scoreStats(stats: Stats): { score: number; grade: PreflightReport["grade"] } {
  let score = 100;

  // Deductions
  const autoLayoutRatio = stats.totalNodes > 0 ? stats.autoLayoutNodes / stats.totalNodes : 0;
  if (autoLayoutRatio < 0.3) score -= 25;
  else if (autoLayoutRatio < 0.6) score -= 10;

  score -= Math.min(stats.freePositionedNodes * 4, 20);
  score -= Math.min(stats.blurNodes.length * 5, 20);
  score -= Math.min(stats.overlappingPairs.length * 5, 20);
  score -= Math.min(stats.genericNames.length * 0.5, 5);
  score -= Math.min(stats.blendModeNodes.length * 5, 15);
  score -= Math.min(stats.maskNodes.length * 5, 15);
  score -= Math.min(stats.rotatedNodes.length * 4, 12);

  if (!stats.colorStylesUsed) score -= 5;
  if (!stats.textStylesUsed) score -= 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade: PreflightReport["grade"] = "A";
  if (score < 40) grade = "F";
  else if (score < 55) grade = "D";
  else if (score < 70) grade = "C";
  else if (score < 85) grade = "B";

  return { score, grade };
}

function buildIssues(stats: Stats): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  if (stats.blurNodes.length > 0) {
    issues.push({
      severity: "error",
      code: "BLUR_EFFECTS",
      title: `${stats.blurNodes.length} node(s) use blur effects`,
      description:
        "Background blur and layer blur cannot be reproduced with native Elementor controls.",
      affectedNodes: stats.blurNodes,
      suggestion:
        "Remove blur effects and replace with solid semi-transparent backgrounds before converting.",
    });
  }

  if (stats.absoluteNodes.length > 0) {
    issues.push({
      severity: "error",
      code: "ABSOLUTE_POSITIONING",
      title: `${stats.absoluteNodes.length} element(s) are absolutely positioned`,
      description:
        "Elements using absolute positioning inside an auto-layout frame cannot be placed in Elementor's flow-based layout.",
      affectedNodes: stats.absoluteNodes,
      suggestion:
        "Convert absolutely positioned children into regular auto-layout children, or restructure the frame.",
    });
  }

  if (stats.overlappingPairs.length > 0) {
    // Deduplicate affected nodes (same node may appear in multiple pairs)
    const seen = new Set<string>();
    const affectedNodes: { id: string; name: string }[] = [];
    for (const pair of stats.overlappingPairs) {
      if (!seen.has(pair.a.id)) {
        seen.add(pair.a.id);
        affectedNodes.push(pair.a);
      }
      if (!seen.has(pair.b.id)) {
        seen.add(pair.b.id);
        affectedNodes.push(pair.b);
      }
    }

    const pairSummaries = stats.overlappingPairs
      .slice(0, 3)
      .map((p) => `Inside "${p.parentName}": "${p.a.name}" overlaps "${p.b.name}"`);
    const extraPairs =
      stats.overlappingPairs.length > 3
        ? ` (+${stats.overlappingPairs.length - 3} more pairs)`
        : "";

    issues.push({
      severity: "error",
      code: "OVERLAPPING_LAYERS",
      title: `${stats.overlappingPairs.length} overlapping layer pair(s) found`,
      description: pairSummaries.join(" · ") + extraPairs,
      affectedNodes,
      suggestion:
        'Click "Zoom to layers" to jump to each overlapping layer. Reorder or flatten them.',
    });
  }

  if (stats.blendModeNodes.length > 0) {
    issues.push({
      severity: "warning",
      code: "BLEND_MODES",
      title: `${stats.blendModeNodes.length} layer(s) use custom blend modes`,
      description:
        "Figma blend modes (Multiply, Screen, etc.) map poorly to Elementor elements outside of backgrounds.",
      affectedNodes: stats.blendModeNodes,
      suggestion: "Flatten these effects into images or accept visual discrepancies.",
    });
  }

  if (stats.maskNodes.length > 0) {
    issues.push({
      severity: "warning",
      code: "MASKS",
      title: `${stats.maskNodes.length} mask(s) detected`,
      description:
        "Figma vector masking does not translate reliably to Elementor widgets, which only support basic border-radius and background images.",
      affectedNodes: stats.maskNodes,
      suggestion: "Prepare masked elements as a single exported image before conversion.",
    });
  }

  if (stats.rotatedNodes.length > 0) {
    issues.push({
      severity: "warning",
      code: "ROTATION",
      title: `${stats.rotatedNodes.length} node(s) are rotated`,
      description:
        "Rotation on frames causes layout instability when converted to Elementor CSS transforms.",
      affectedNodes: stats.rotatedNodes,
      suggestion: "Reset rotation to 0°, or encapsulate the rotated graphic in a custom SVG.",
    });
  }

  if (stats.genericNames.length > 5) {
    issues.push({
      severity: "info",
      code: "GENERIC_NAMES",
      title: `${stats.genericNames.length} layers have generic names`,
      description:
        "Generic layer names make the converted Elementor template hard to navigate and edit.",
      affectedNodes: stats.genericNames,
      suggestion:
        'Rename layers descriptively (e.g., "Hero Heading", "Feature Card 1") before converting for better editor experience.',
    });
  }

  if (!stats.colorStylesUsed) {
    issues.push({
      severity: "info",
      code: "NO_COLOR_STYLES",
      title: "No Figma color styles detected",
      description:
        "Colors are set as raw values rather than shared styles. Elementor Global Color mapping will be less precise.",
      affectedNodes: [],
      suggestion:
        "Create Figma color styles for your brand colors to enable automatic Elementor Global Color generation.",
    });
  }

  if (!stats.textStylesUsed) {
    issues.push({
      severity: "info",
      code: "NO_TEXT_STYLES",
      title: "No Figma text styles detected",
      description: "Text properties are set inline rather than using shared text styles.",
      affectedNodes: [],
      suggestion:
        "Create Figma text styles (H1, H2, Body, etc.) to enable more accurate Elementor typography mapping.",
    });
  }

  return issues;
}

/**
 * Run a full pre-flight analysis on a Figma node and return a readiness report.
 */
export function runPreflight(node: SceneNode, options?: ConversionOptions): PreflightReport {
  const stats = makeStats();
  walk(node, stats, 0, options);

  const { score, grade } = scoreStats(stats);
  const issues = buildIssues(stats);

  return {
    score,
    grade,
    issues,
    totalNodes: stats.totalNodes,
    autoLayoutNodes: stats.autoLayoutNodes,
    freePositionedNodes: stats.freePositionedNodes,
    unsupportedEffectNodes: stats.unsupportedEffectNodes,
    colorStylesUsed: stats.colorStylesUsed,
    textStylesUsed: stats.textStylesUsed,
  };
}
