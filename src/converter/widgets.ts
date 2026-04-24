// ─────────────────────────────────────────────────────────────────────────────
// widgets.ts — Map every Figma node type to the correct native Elementor
// widget and build its settings object.
//
// Hard rule: if there is no native widget match, return null and flag the node.
// Never generate HTML, custom CSS, or code-based fallback.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ElementorWidget,
  HeadingSettings,
  TextEditorSettings,
  ButtonSettings,
  ImageSettings,
  IconSettings,
  DividerSettings,
  SpacerSettings,
  TestimonialSettings,
  IconBoxSettings,
  ImageBoxSettings,
  VideoSettings,
  StarRatingSettings,
  CounterSettings,
  AlertSettings,
  FlipBoxSettings,
  WidgetType,
  ElementorSize,
  ElementorBorderRadius,
  ElementorSpacing,
  ElementorBoxShadow,
} from "../types/elementor";
import { TextAnalysis, ConversionOptions } from "../types/figma-extended";
import { textAnalysisToTypography, analyseTextNode } from "./typography";
import { analyseFills, rgbaToString } from "./colors";
import { queueImageExport, queueSvgExport, getImageFillHash } from "./assets";
import { pxToRemSize, remSpacing, REM_ROOT } from "./units";
import {
  checkEffects,
  checkFills,
  checkStrokes,
  checkMixedTextStyles,
  checkBlendMode,
  checkMask,
  checkOpacity,
} from "./unsupported";

// ─────────────────────────────────────────────────────────────────────────────
// ID Generator
// ─────────────────────────────────────────────────────────────────────────────

let _widgetCounter = 0;
export function makeWidgetId(): string {
  _widgetCounter++;
  return `w${Date.now().toString(36)}${_widgetCounter.toString(36)}`;
}
export function resetWidgetCounter(): void {
  _widgetCounter = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Builders
// ─────────────────────────────────────────────────────────────────────────────

function makeSize(size: number, unit: ElementorSize["unit"] = "px"): ElementorSize {
  return { unit, size: Math.round(size) };
}

function makeBorderRadius(r: number | PluginAPI["mixed"]): ElementorBorderRadius | undefined {
  if (!r || r === figma.mixed) return undefined;
  const v = String(Math.round(((r as number) / REM_ROOT) * 1000) / 1000);
  return { top: v, right: v, bottom: v, left: v, unit: "rem", isLinked: true };
}

function makeBorderRadiusCorners(
  tl: number,
  tr: number,
  br: number,
  bl: number,
): ElementorBorderRadius {
  const r = (n: number) => String(Math.round((n / REM_ROOT) * 1000) / 1000);
  return {
    top: r(tl),
    right: r(tr),
    bottom: r(br),
    left: r(bl),
    unit: "rem",
    isLinked: false,
  };
}

function extractBoxShadow(node: SceneNode): ElementorBoxShadow | undefined {
  if (!("effects" in node)) return undefined;
  const shadow = node.effects?.find(
    (e): e is DropShadowEffect => e.type === "DROP_SHADOW" && e.visible !== false,
  );
  if (!shadow) return undefined;
  const c = shadow.color;
  return {
    horizontal: Math.round(shadow.offset.x),
    vertical: Math.round(shadow.offset.y),
    blur: Math.round(shadow.radius),
    spread: Math.round(shadow.spread ?? 0),
    color: rgbaToString(c.r, c.g, c.b, c.a),
  };
}

function extractBorderSettings(node: SceneNode): {
  border_border?: string;
  border_width?: ElementorSpacing;
  border_color?: string;
} {
  if (!("strokes" in node) || !node.strokes?.length) return {};
  const stroke = node.strokes.find((s) => s.visible !== false && s.type === "SOLID") as
    | SolidPaint
    | undefined;
  if (!stroke) return {};
  const weight =
    "strokeWeight" in node && node.strokeWeight !== figma.mixed
      ? ((node as FrameNode).strokeWeight ?? 1)
      : 1;
  const color = rgbaToString(stroke.color.r, stroke.color.g, stroke.color.b, stroke.opacity ?? 1);
  const w = String(Math.round(weight as number));
  return {
    border_border: "solid",
    border_width: { top: w, right: w, bottom: w, left: w, unit: "px", isLinked: true },
    border_color: color,
  };
}

function widget(
  id: string,
  type: WidgetType | string,
  settings: Record<string, unknown>,
): ElementorWidget {
  return { id, elType: "widget", widgetType: type, settings, elements: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component Name Classification
// ─────────────────────────────────────────────────────────────────────────────

interface ComponentHint {
  widgetType: WidgetType | null;
  confidence: number;
}

const COMPONENT_PATTERNS: Array<{ pattern: RegExp; widgetType: WidgetType }> = [
  { pattern: /button|btn|cta/i, widgetType: "button" },
  { pattern: /icon.?box|feature.?card|benefit/i, widgetType: "icon-box" },
  { pattern: /testimonial|review|quote/i, widgetType: "testimonial" },
  { pattern: /pricing|price.?card|tier/i, widgetType: "price-table" },
  { pattern: /accordion|faq|collapse/i, widgetType: "accordion" },
  { pattern: /tab(s)?[\s_-]?(panel|item|nav)?/i, widgetType: "tabs" },
  { pattern: /flip.?box|hover.?card/i, widgetType: "flip-box" },
  { pattern: /star.?rating|rating/i, widgetType: "star-rating" },
  { pattern: /counter|statistic|count.?up/i, widgetType: "counter" },
  { pattern: /progress.?bar/i, widgetType: "progress" },
  { pattern: /alert|notice|notification/i, widgetType: "alert" },
  { pattern: /video|youtube|vimeo/i, widgetType: "video" },
  { pattern: /social.?icon|social.?link/i, widgetType: "social-icons" },
  { pattern: /map|google.?map/i, widgetType: "google_maps" },
  { pattern: /divider|separator|line/i, widgetType: "divider" },
  { pattern: /image.?box|media.?card/i, widgetType: "image-box" },
  { pattern: /call.?to.?action|cta.?block/i, widgetType: "call-to-action" },
];

export function classifyComponent(name: string): ComponentHint {
  for (const p of COMPONENT_PATTERNS) {
    if (p.pattern.test(name)) {
      return { widgetType: p.widgetType, confidence: 0.8 };
    }
  }
  return { widgetType: null, confidence: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget Mappers
// ─────────────────────────────────────────────────────────────────────────────

/** TEXT NODE → Heading or Text Editor */
export function mapTextNode(node: TextNode, opts: ConversionOptions): ElementorWidget {
  const id = makeWidgetId();
  checkMixedTextStyles(node);
  checkEffects(node);

  const analysis = analyseTextNode(node, opts.inferHeadings);
  const typo = textAnalysisToTypography(analysis, opts.mobileBreakpoint);
  const isHeading = analysis.inferredLevel !== "body";

  if (isHeading) {
    const s: HeadingSettings = {
      title: analysis.content,
      header_size: analysis.inferredLevel as "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
      align: analysis.textAlign,
      title_color: analysis.color,
      ...typo,
    };
    return widget(id, "heading", s as Record<string, unknown>);
  }

  const s: TextEditorSettings = {
    editor: `<p>${analysis.content}</p>`,
    align: analysis.textAlign,
    text_color: analysis.color,
    ...typo,
  };
  return widget(id, "text-editor", s as Record<string, unknown>);
}

/** RECTANGLE/ELLIPSE with image fill → Image widget */
export function mapImageFillNode(
  node: RectangleNode | EllipseNode | FrameNode,
  opts: ConversionOptions,
): ElementorWidget {
  const id = makeWidgetId();
  checkEffects(node);
  checkBlendMode(node);

  const placeholder = queueImageExport(node.id, node.name, opts.imageFormat);

  const radius =
    "cornerRadius" in node && node.cornerRadius !== figma.mixed
      ? makeBorderRadius(node.cornerRadius as number)
      : undefined;

  const s: ImageSettings = {
    image: { url: placeholder, id: 0, alt: node.name },
    image_size: "full",
    align: "center",
    // Use 100% width so the image fills its container responsively.
    // The Figma pixel width is preserved via the container that wraps it.
    _element_width: "initial",
    _element_custom_width: makeSize(100, "%"),
    object_fit: "cover",
    ...(radius ? { border_radius: radius } : {}),
  };
  return widget(id, "image", s as Record<string, unknown>);
}

/** LINE / VECTOR line → Divider widget */
export function mapDividerNode(node: SceneNode): ElementorWidget {
  const id = makeWidgetId();

  // Try to get stroke color
  const strokes = "strokes" in node ? node.strokes : [];
  const solidStroke = Array.isArray(strokes)
    ? (strokes as Paint[]).find((s): s is SolidPaint => s.type === "SOLID" && s.visible !== false)
    : undefined;

  const color = solidStroke
    ? rgbaToString(
        solidStroke.color.r,
        solidStroke.color.g,
        solidStroke.color.b,
        solidStroke.opacity ?? 1,
      )
    : "#cccccc";

  // Stroke weight stays in px — hairlines in rem create sub-pixel rendering.
  const strokePx =
    "strokeWeight" in node && node.strokeWeight !== figma.mixed
      ? Math.round(((node as LineNode).strokeWeight as number) ?? 1)
      : 1;
  const s: DividerSettings = {
    style: "solid",
    color,
    weight: { unit: "px", size: strokePx },
    width: makeSize(100, "%"),
    align: "center",
  };
  return widget(id, "divider", s as Record<string, unknown>);
}

/** Empty spacer frame → Spacer widget */
export function mapSpacerNode(node: SceneNode): ElementorWidget {
  const id = makeWidgetId();
  const height = node.height ?? 24;
  const s: SpacerSettings = {
    space: pxToRemSize(height),
  };
  return widget(id, "spacer", s as Record<string, unknown>);
}

/** BUTTON component → Button widget */
export function mapButtonComponent(
  node: InstanceNode | FrameNode | ComponentNode,
  opts: ConversionOptions,
): ElementorWidget {
  const id = makeWidgetId();
  checkEffects(node);

  // Try to extract label from first text child
  let label = "Button";
  let bgColor = "";
  let textColor = "#ffffff";
  let radius: ElementorBorderRadius | undefined;

  if ("children" in node && node.children) {
    const textChild = node.children.find((c) => c.type === "TEXT" && c.visible !== false) as
      | TextNode
      | undefined;
    if (textChild) {
      label = textChild.characters;
      // text color
      if (Array.isArray(textChild.fills)) {
        const solid = (textChild.fills as Paint[]).find((f): f is SolidPaint => f.type === "SOLID");
        if (solid)
          textColor = rgbaToString(solid.color.r, solid.color.g, solid.color.b, solid.opacity ?? 1);
      }
    }
  }

  // Background fill of the button frame
  if ("fills" in node && Array.isArray(node.fills)) {
    const fill = analyseFills(node.fills as Paint[]);
    if (fill.type === "solid") bgColor = fill.color ?? "";
  }

  // Corner radius
  if ("cornerRadius" in node && node.cornerRadius !== figma.mixed) {
    radius = makeBorderRadius(node.cornerRadius as number);
  }

  // Border
  const borderSettings = extractBorderSettings(node);

  const s: ButtonSettings = {
    text: label,
    align: "center",
    background_color: bgColor || undefined,
    button_text_color: textColor,
    ...(radius ? { border_radius: radius } : {}),
    ...borderSettings,
    typography_typography: "custom",
    typography_font_size: pxToRemSize(14),
    typography_font_weight: "600",
    text_padding: remSpacing(12, 24, 12, 24),
    hover_animation: "grow",
  };
  return widget(id, "button", s as Record<string, unknown>);
}

/** ICON component → Icon widget */
export function mapIconComponent(node: SceneNode, opts: ConversionOptions): ElementorWidget {
  const id = makeWidgetId();

  // Try to determine icon from component name
  const name = node.name.toLowerCase();
  let iconValue = "fas fa-star"; // fallback

  // Common icon name patterns → Font Awesome
  if (name.includes("check")) iconValue = "fas fa-check";
  else if (name.includes("arrow") && name.includes("right")) iconValue = "fas fa-arrow-right";
  else if (name.includes("arrow") && name.includes("left")) iconValue = "fas fa-arrow-left";
  else if (name.includes("mail") || name.includes("email")) iconValue = "fas fa-envelope";
  else if (name.includes("phone") || name.includes("call")) iconValue = "fas fa-phone";
  else if (name.includes("search")) iconValue = "fas fa-search";
  else if (name.includes("close") || name.includes("x")) iconValue = "fas fa-times";
  else if (name.includes("menu") || name.includes("hamburger")) iconValue = "fas fa-bars";
  else if (name.includes("home")) iconValue = "fas fa-home";
  else if (name.includes("user") || name.includes("profile")) iconValue = "fas fa-user";
  else if (name.includes("heart") || name.includes("like")) iconValue = "fas fa-heart";
  else if (name.includes("share")) iconValue = "fas fa-share";
  else if (name.includes("settings") || name.includes("gear")) iconValue = "fas fa-cog";
  else if (name.includes("download")) iconValue = "fas fa-download";
  else if (name.includes("upload")) iconValue = "fas fa-upload";
  else if (name.includes("edit") || name.includes("pencil")) iconValue = "fas fa-pencil-alt";
  else if (name.includes("trash") || name.includes("delete")) iconValue = "fas fa-trash";
  else if (name.includes("info")) iconValue = "fas fa-info-circle";
  else if (name.includes("warning") || name.includes("alert"))
    iconValue = "fas fa-exclamation-triangle";
  else if (name.includes("lock") || name.includes("secure")) iconValue = "fas fa-lock";

  // Fill color
  let color = "";
  if ("fills" in node && Array.isArray(node.fills)) {
    const fill = analyseFills(node.fills as Paint[]);
    if (fill.type === "solid") color = fill.color ?? "";
  }

  const s: IconSettings = {
    icon: { value: iconValue, library: "fa-solid" },
    view: "default",
    align: "center",
    size: pxToRemSize(Math.min(node.width, node.height, 48)),
    ...(color ? { primary_color: color } : {}),
  };
  return widget(id, "icon", s as Record<string, unknown>);
}

/**
 * VECTOR / BOOLEAN_OPERATION / STAR / POLYGON → Icon widget backed by
 * a Figma-exported SVG. The placeholder URL resolves to an uploaded asset
 * once the template is imported into WordPress.
 */
export function mapShapeAsSvgIcon(node: SceneNode, opts: ConversionOptions): ElementorWidget {
  const id = makeWidgetId();
  const url = queueSvgExport(node.id, node.name);

  // Pick a tint color from the first solid fill if available.
  let color = "";
  if ("fills" in node && Array.isArray(node.fills)) {
    const fill = analyseFills(node.fills as Paint[]);
    if (fill.type === "solid") color = fill.color ?? "";
  }

  const sizePx = Math.max(16, Math.min(node.width, node.height, 64));

  const s: Record<string, unknown> = {
    // Elementor's unified icon control — `library: 'svg'` tells the editor
    // to use the custom SVG referenced by `value.url`.
    selected_icon: {
      value: { url, id: 0 },
      library: "svg",
    },
    view: "default",
    align: "center",
    size: pxToRemSize(sizePx),
  };
  if (color) s.primary_color = color;

  return widget(id, "icon", s);
}

/** ICON BOX (icon + heading + text in one container) → Icon Box widget */
export function mapIconBoxComponent(
  node: FrameNode | InstanceNode | ComponentNode,
  opts: ConversionOptions,
): ElementorWidget {
  const id = makeWidgetId();

  let title = "";
  let description = "";
  let iconValue = "fas fa-star";

  if ("children" in node && node.children) {
    const texts = node.children.filter(
      (c): c is TextNode => c.type === "TEXT" && c.visible !== false,
    );
    // Largest font = title, rest = description
    const sorted = [...texts].sort(
      (a, b) => ((b.fontSize as number) ?? 0) - ((a.fontSize as number) ?? 0),
    );
    if (sorted[0]) title = sorted[0].characters;
    if (sorted[1]) description = sorted[1].characters;

    const iconChild = node.children.find(
      (c) =>
        c.visible !== false &&
        (c.type === "VECTOR" || c.type === "FRAME" || c.name.toLowerCase().includes("icon")),
    );
    if (iconChild) {
      const hint = classifyComponent(iconChild.name);
      // Convert it to an icon widget as a nested fix
    }
  }

  const s: IconBoxSettings = {
    icon: { value: iconValue, library: "fa-solid" },
    title_text: title || node.name,
    description_text: description,
    position: "top",
    align: "center",
    title_size: "h3",
  };
  return widget(id, "icon-box", s as Record<string, unknown>);
}

/** TESTIMONIAL block → Testimonial widget */
export function mapTestimonialComponent(
  node: FrameNode | InstanceNode | ComponentNode,
  opts: ConversionOptions,
): ElementorWidget {
  const id = makeWidgetId();

  let content = "";
  let name = "";
  let job = "";
  let imageUrl = "";

  if ("children" in node && node.children) {
    const texts = node.children.filter(
      (c): c is TextNode => c.type === "TEXT" && c.visible !== false,
    );
    // Heuristics: longest text = content, shorter ones = name/job
    const sorted = [...texts].sort((a, b) => b.characters.length - a.characters.length);
    if (sorted[0]) content = sorted[0].characters;
    if (sorted[1]) name = sorted[1].characters;
    if (sorted[2]) job = sorted[2].characters;

    // Image
    const imgNode = node.children.find(
      (c) =>
        c.visible !== false &&
        (c.type === "RECTANGLE" || c.type === "ELLIPSE") &&
        getImageFillHash(c) !== null,
    );
    if (imgNode && opts.exportImages) {
      imageUrl = queueImageExport(imgNode.id, imgNode.name, opts.imageFormat);
    }
  }

  const s: TestimonialSettings = {
    testimonial_content: content,
    testimonial_name: name,
    testimonial_job: job,
    testimonial_alignment: "center",
    ...(imageUrl ? { testimonial_image: { url: imageUrl, id: 0 } } : {}),
  };
  return widget(id, "testimonial", s as Record<string, unknown>);
}

/** STAR RATING → Star Rating widget */
export function mapStarRating(node: SceneNode): ElementorWidget {
  const id = makeWidgetId();
  const s: StarRatingSettings = {
    rating_scale: "5",
    rating: 5,
    star_size: pxToRemSize(20),
    align: "left",
  };
  return widget(id, "star-rating", s as Record<string, unknown>);
}

/** COUNTER / STATISTIC → Counter widget */
export function mapCounter(node: FrameNode | InstanceNode | ComponentNode): ElementorWidget {
  const id = makeWidgetId();

  let endNum = 100;
  let title = "";

  if ("children" in node && node.children) {
    const texts = node.children.filter(
      (c): c is TextNode => c.type === "TEXT" && c.visible !== false,
    );
    for (const t of texts) {
      const num = parseInt(t.characters.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(num) && num > 0) endNum = num;
      else if (t.characters.length < 40) title = t.characters;
    }
  }

  const s: CounterSettings = {
    starting_number: 0,
    ending_number: endNum,
    duration: 2000,
    title: title || node.name,
    align: "center",
  };
  return widget(id, "counter", s as Record<string, unknown>);
}

/** ALERT / NOTICE → Alert widget */
export function mapAlert(node: FrameNode | InstanceNode | ComponentNode): ElementorWidget {
  const id = makeWidgetId();

  let alertTitle = "";
  let alertDesc = "";

  if ("children" in node && node.children) {
    const texts = node.children.filter(
      (c): c is TextNode => c.type === "TEXT" && c.visible !== false,
    );
    if (texts[0]) alertTitle = texts[0].characters;
    if (texts[1]) alertDesc = texts[1].characters;
  }

  const s: AlertSettings = {
    alert_type: "info",
    alert_title: alertTitle || node.name,
    alert_description: alertDesc,
  };
  return widget(id, "alert", s as Record<string, unknown>);
}

/** FLIP BOX (PRO) → Flip Box widget */
export function mapFlipBox(node: FrameNode | InstanceNode | ComponentNode): ElementorWidget {
  const id = makeWidgetId();

  let frontTitle = "";
  let frontDesc = "";
  let backTitle = "";
  let backDesc = "";

  if ("children" in node && node.children) {
    const sides = node.children.filter((c) => "children" in c && c.visible !== false);
    if (sides[0] && "children" in sides[0]) {
      const texts = (sides[0] as FrameNode).children.filter(
        (c): c is TextNode => c.type === "TEXT",
      );
      if (texts[0]) frontTitle = texts[0].characters;
      if (texts[1]) frontDesc = texts[1].characters;
    }
    if (sides[1] && "children" in sides[1]) {
      const texts = (sides[1] as FrameNode).children.filter(
        (c): c is TextNode => c.type === "TEXT",
      );
      if (texts[0]) backTitle = texts[0].characters;
      if (texts[1]) backDesc = texts[1].characters;
    }
  }

  // Background fills
  let frontBg = "";
  let backBg = "#2271b1";
  if ("fills" in node && Array.isArray(node.fills)) {
    const fill = analyseFills(node.fills as Paint[]);
    if (fill.type === "solid") frontBg = fill.color ?? "";
  }

  const s: FlipBoxSettings = {
    flip_effect: "flip",
    flip_direction: "left",
    front_title_text: frontTitle || "Front Title",
    front_description_text: frontDesc,
    front_background_color: frontBg || "#f8f9fa",
    back_title_text: backTitle || "Back Title",
    back_description_text: backDesc,
    back_background_color: backBg,
    height: pxToRemSize(300),
    border_radius: { top: "0.5", right: "0.5", bottom: "0.5", left: "0.5", unit: "rem" },
  };
  return widget(id, "flip-box", s as Record<string, unknown>);
}

/** VIDEO placeholder → Video widget */
export function mapVideoPlaceholder(node: SceneNode): ElementorWidget {
  const id = makeWidgetId();
  const s: VideoSettings = {
    video_type: "youtube",
    youtube_url: "https://www.youtube.com/watch?v=",
    aspect_ratio: "169",
    controls: "yes",
  };
  return widget(id, "video", s as Record<string, unknown>);
}
