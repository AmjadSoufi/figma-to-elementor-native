// ─────────────────────────────────────────────────────────────────────────────
// Figma Extended Types
// Additional helpers and aliases for working with the Figma Plugin API.
// ─────────────────────────────────────────────────────────────────────────────

/** Any node that can contain children */
export type ParentNode =
  | FrameNode
  | ComponentNode
  | ComponentSetNode
  | InstanceNode
  | GroupNode
  | SectionNode
  | PageNode;

/** Any node that can have fills */
export type FillableNode =
  | FrameNode
  | ComponentNode
  | InstanceNode
  | RectangleNode
  | EllipseNode
  | PolygonNode
  | StarNode
  | VectorNode
  | TextNode
  | LineNode;

/** Any node that can have effects */
export type EffectableNode =
  | FrameNode
  | ComponentNode
  | InstanceNode
  | RectangleNode
  | EllipseNode
  | GroupNode
  | TextNode;

/** Nodes with auto-layout */
export type LayoutNode = FrameNode | ComponentNode | InstanceNode;

/** Solid RGB color from Figma (r,g,b in 0–1 range) */
export interface FigmaRGB {
  r: number;
  g: number;
  b: number;
}

/** Solid RGBA color from Figma */
export interface FigmaRGBA extends FigmaRGB {
  a: number;
}

/** Analysed fill from a Figma node */
export interface AnalysedFill {
  type: "solid" | "image" | "gradient" | "unsupported";
  color?: string; // hex or rgba string
  colorStop?: [string, string]; // [from, to] for gradients
  gradientAngle?: number;
  imageRef?: string;
  opacity: number;
}

/** Analysed stroke from a Figma node */
export interface AnalysedStroke {
  color: string;
  weight: number;
  position: "inside" | "outside" | "center";
}

/** Analysed shadow effect */
export interface AnalysedShadow {
  type: "drop" | "inner";
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

/** Result of layout analysis on a frame */
export interface LayoutAnalysis {
  isAutoLayout: boolean;
  direction: "row" | "column" | "none";
  isWrap: boolean;
  /** True when the frame should render as a CSS grid (wrap w/ uniform rows). */
  isGrid: boolean;
  /** Number of columns detected in the wrap grid (1 when not a grid). */
  gridColumns: number;
  gap: number;
  gapColumn: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  primaryAxisAlign: "flex-start" | "center" | "flex-end" | "space-between";
  crossAxisAlign: "flex-start" | "center" | "flex-end" | "stretch";
  width: number;
  height: number;
  isFull: boolean;
  isHugging: boolean;
  isFill: boolean;
}

/** Text analysis result */
export interface TextAnalysis {
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  lineHeight: number | null;
  letterSpacing: number;
  textAlign: "left" | "center" | "right" | "justify";
  color: string;
  textDecoration: "none" | "underline" | "line-through";
  textTransform: "none" | "uppercase" | "lowercase";
  isMixedStyles: boolean;
  inferredLevel: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "body";
}

/** Pre-flight check result for a single issue */
export interface PreflightIssue {
  severity: "error" | "warning" | "info";
  code: string;
  title: string;
  description: string;
  affectedNodes: { id: string; name: string }[];
  suggestion: string;
}

/** Pre-flight report for the whole selection */
export interface PreflightReport {
  score: number; // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  issues: PreflightIssue[];
  totalNodes: number;
  autoLayoutNodes: number;
  freePositionedNodes: number;
  unsupportedEffectNodes: number;
  colorStylesUsed: boolean;
  textStylesUsed: boolean;
}

/** Message types from UI → plugin code */
export type UIMessage =
  | { type: "analyze"; nodeId?: string; options?: ConversionOptions }
  | { type: "convert"; nodeId?: string; options: ConversionOptions }
  | { type: "export-images"; nodeIds: string[] }
  | { type: "select-nodes"; nodeIds: string[] }
  | { type: "fix-issue"; code: string; nodeIds: string[]; options?: ConversionOptions }
  | { type: "cancel" }
  | { type: "resize"; width: number; height: number }
  | { type: "save-settings"; settings: any }
  | { type: "load-settings" };

/** Message types from plugin code → UI */
export type PluginMessage =
  | { type: "selection-changed"; hasSelection: boolean; nodeName?: string; nodeId?: string }
  | { type: "preflight-result"; report: PreflightReport }
  | { type: "conversion-progress"; step: string; percent: number }
  | { type: "conversion-complete"; json: string; flaggedCount: number; fidelityScore: number }
  | { type: "conversion-error"; error: string }
  | {
      type: "images-exported";
      images: Array<{ nodeId: string; filename: string; data: Uint8Array }>;
    }
  | { type: "load-settings"; settings: any }
  | { type: "fix-result"; fixed: number; code: string; report: PreflightReport }
  | { type: "log"; message: string; level: "info" | "warn" | "error" };

/** Conversion options passed from UI */
export interface ConversionOptions {
  maxDepth: number; // max nesting depth before collapsing (default: 12)
  containerMaxWidth: number; // max width for boxed containers in px (default: 1200)
  exportImages: boolean; // whether to export image assets
  imageFormat: "PNG" | "WEBP";
  imageScale: 1 | 2 | 3;
  inferHeadings: boolean; // detect h1–h6 from font size heuristics
  useGlobalColors: boolean; // extract Figma color styles as Elementor global colors
  useGlobalFonts: boolean; // extract Figma text styles as Elementor global fonts
  includeProWidgets: boolean; // allow Elementor Pro widget mappings
  mobileBreakpoint: number; // px (default: 767)
  tabletBreakpoint: number; // px (default: 1024)
  skipHeaderFooter?: boolean;
}
