// ─────────────────────────────────────────────────────────────────────────────
// traversal.ts — Recursively walk a Figma node tree and convert each node
// into an Elementor Container or Widget. This is the heart of the converter.
//
// Rules:
//   - Frame / Component / Instance with children → Container
//   - Text → Heading or Text Editor widget
//   - Rectangle / Ellipse with image fill → Image widget
//   - Line / simple vector → Divider widget
//   - Complex vector → flagged (not converted)
//   - Group with no auto-layout → best-effort container
// ─────────────────────────────────────────────────────────────────────────────

import { ElementorContainer, ElementorElement, ElementorContainerSettings, ElementorSize } from '../types/elementor';
import { ConversionOptions } from '../types/figma-extended';
import { analyseLayout, buildContainerSettings, inferHtmlTag, isTopLevelSection, inferDirectionFromChildren, has12ColumnLayoutGuide } from './layout';
import { pxToRemSize, remSpacing } from './units';
import {
  makeWidgetId,
  mapTextNode,
  mapImageFillNode,
  mapDividerNode,
  mapSpacerNode,
  mapButtonComponent,
  mapIconComponent,
  mapIconBoxComponent,
  mapTestimonialComponent,
  mapStarRating,
  mapCounter,
  mapAlert,
  mapFlipBox,
  mapVideoPlaceholder,
  mapShapeAsSvgIcon,
  classifyComponent,
} from './widgets';
import { analyseFills } from './colors';
import {
  checkEffects,
  checkFills,
  checkStrokes,
  checkAbsolutePositioning,
  checkOverlappingChildren,
  checkBlendMode,
  checkMask,
  checkOpacity,
  checkRotation,
} from './unsupported';
import { queueImageExport, getImageFillHash, isImageNode } from './assets';

type ConvertibleNode = SceneNode;

let _nodeCount = 0;
export function getNodeCount(): number { return _nodeCount; }
export function resetNodeCount(): void { _nodeCount = 0; }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSize(size: number, unit: ElementorSize['unit'] = 'px'): ElementorSize {
  return { unit, size: Math.round(size) };
}

function isEmptySpacer(node: SceneNode): boolean {
  if (!('children' in node)) return false;
  const frame = node as FrameNode;
  if (frame.children.length !== 0) return false;
  if (frame.fills === figma.mixed) return false;
  const fills = frame.fills as Paint[];
  const hasFill = fills.some((f) => f.visible !== false && f.type !== 'IMAGE');
  return !hasFill;
}

function isLineNode(node: SceneNode): boolean {
  return node.type === 'LINE';
}

function isVectorShape(node: SceneNode): boolean {
  return node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'POLYGON';
}

function hasImageFill(node: SceneNode): boolean {
  if (!('fills' in node) || node.fills === figma.mixed) return false;
  return (node.fills as Paint[]).some((f) => f.type === 'IMAGE' && f.visible !== false);
}

function hasChildren(node: SceneNode): node is FrameNode | ComponentNode | InstanceNode | GroupNode {
  return 'children' in node && Array.isArray((node as FrameNode).children);
}

function hasPureTextChildren(node: FrameNode | ComponentNode | InstanceNode): boolean {
  if (!node.children) return false;
  return (
    node.children.length <= 3 &&
    node.children.every((c) => c.type === 'TEXT')
  );
}

type AutoLayoutFrame = FrameNode | ComponentNode | InstanceNode;
function hasAutoLayout(node: SceneNode): node is AutoLayoutFrame {
  return (
    'layoutMode' in node &&
    (node as FrameNode).layoutMode !== 'NONE'
  );
}

/**
 * Returns true if this child is absolutely positioned inside an auto-layout
 * parent. Such elements float outside the flex flow and must be skipped.
 */
function isAbsolutePositioned(node: SceneNode): boolean {
  return (
    'layoutPositioning' in node &&
    (node as FrameNode).layoutPositioning === 'ABSOLUTE'
  );
}

/**
 * True when this node is itself hidden OR any ancestor is hidden. We only need
 * to check the node (parents are skipped before recursion reaches children),
 * but we also guard against being called with a hidden node directly.
 */
function isEffectivelyHidden(node: SceneNode): boolean {
  return 'visible' in node && node.visible === false;
}

/**
 * A child is a full-bleed break-out of its parent's 12-col grid when it
 * (almost) fills the parent width. These map to content_width:'full' + 100%.
 */
function isFullBleedBreakout(child: SceneNode, parentWidth: number): boolean {
  if (parentWidth <= 0) return false;
  return child.width / parentWidth >= 0.95;
}

/** Small vector shapes are candidates for SVG → Icon widget emission. */
const SVG_ICON_MAX_DIMENSION = 64;
function isSvgIconCandidate(node: SceneNode): boolean {
  const isShape =
    node.type === 'VECTOR' ||
    node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'STAR' ||
    node.type === 'POLYGON';
  if (!isShape) return false;
  return (
    node.width > 0 &&
    node.height > 0 &&
    node.width <= SVG_ICON_MAX_DIMENSION &&
    node.height <= SVG_ICON_MAX_DIMENSION
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Container Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildContainer(
  node: FrameNode | ComponentNode | InstanceNode | GroupNode,
  elements: ElementorElement[],
  opts: ConversionOptions,
  isTopLevel: boolean,
  parentWidth: number,
  rootWidth: number,
  childLayoutGrow: number,
  parentIsRow: boolean,
  parentIsGrid: boolean,
  parentHas12Grid: boolean,
  isBreakout: boolean
): ElementorContainer {
  const id = makeWidgetId();

  let settings: ElementorContainerSettings = {};

  if ('layoutMode' in node) {
    const frame = node as FrameNode | ComponentNode | InstanceNode;
    // Pass childLayoutGrow so isFill is correctly determined
    const layout = analyseLayout(frame, childLayoutGrow);

    // Extract background fill — handle solid, gradient, and image fills
    let bgColor = '';
    let bgFill = undefined;
    if ('fills' in node && node.fills !== figma.mixed) {
      const fill = analyseFills(node.fills as Paint[]);
      if (fill.type === 'solid' && fill.color && fill.color !== 'transparent') {
        bgColor = fill.color;
      } else if (fill.type === 'gradient') {
        bgFill = fill;
      }
    }

    settings = buildContainerSettings(
      layout, opts, isTopLevel, parentWidth, parentIsRow,
      bgColor || undefined, bgFill, parentIsGrid, parentHas12Grid, isBreakout
    );

    // Fix: after buildContainerSettings sets html_tag to 'div', update from real name
    settings.html_tag = inferHtmlTag(node.name);

    // Corner radius — rem for accessibility.
    const cr = 'cornerRadius' in node ? node.cornerRadius : undefined;
    if (cr && cr !== figma.mixed && cr !== 0) {
      const v = String(Math.round((cr as number) / 16 * 1000) / 1000);
      settings.border_radius = { top: v, right: v, bottom: v, left: v, unit: 'rem' };
      settings.overflow = 'hidden';
    } else if ('topLeftRadius' in node) {
      const f = node as FrameNode;
      const tl = (f.topLeftRadius ?? 0) / 16;
      const tr = (f.topRightRadius ?? 0) / 16;
      const br = (f.bottomRightRadius ?? 0) / 16;
      const bl = (f.bottomLeftRadius ?? 0) / 16;
      if (tl + tr + br + bl > 0) {
        const r = (n: number) => String(Math.round(n * 1000) / 1000);
        settings.border_radius = {
          top: r(tl), right: r(tr), bottom: r(br), left: r(bl),
          unit: 'rem',
        };
        settings.overflow = 'hidden';
      }
    }

    // Box shadow
    if ('effects' in node) {
      const shadow = node.effects?.find(
        (e): e is DropShadowEffect => e.type === 'DROP_SHADOW' && e.visible !== false
      );
      if (shadow) {
        const { r, g, b, a } = shadow.color;
        const rgba = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a.toFixed(2)})`;
        settings.box_shadow_box_shadow_type = 'yes';
        settings.box_shadow_box_shadow = {
          horizontal: Math.round(shadow.offset.x),
          vertical: Math.round(shadow.offset.y),
          blur: Math.round(shadow.radius),
          spread: Math.round(shadow.spread ?? 0),
          color: rgba,
        };
      }
    }

    // Border
    if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
      const stroke = (node.strokes as Paint[]).find(
        (s): s is SolidPaint => s.type === 'SOLID' && s.visible !== false
      );
      if (stroke) {
        const weight = 'strokeWeight' in node && node.strokeWeight !== figma.mixed ? (node.strokeWeight as number ?? 1) : 1;
        const rgba = `rgba(${Math.round(stroke.color.r * 255)},${Math.round(stroke.color.g * 255)},${Math.round(stroke.color.b * 255)},${stroke.opacity ?? 1})`;
        const w = String(Math.round(weight));
        settings.border_border = 'solid';
        settings.border_width = { top: w, right: w, bottom: w, left: w, unit: 'px' };
        settings.border_color = rgba;
      }
    }

    // Opacity
    const opacity = 'opacity' in node ? ((node as FrameNode).opacity ?? 1) : 1;
    if (opacity < 0.99) {
      settings.opacity = { unit: 'px', size: Math.round(opacity * 100) / 100 };
    }

    // Image background fill — must take priority over gradient/solid above
    if ('fills' in node && node.fills !== figma.mixed) {
      const imageFill = (node.fills as Paint[]).find(
        (f): f is ImagePaint => f.type === 'IMAGE' && f.visible !== false
      );
      if (imageFill && opts.exportImages) {
        const url = queueImageExport(node.id + '_bg', node.name + '_bg', opts.imageFormat);
        settings.background_background = 'classic';
        settings.background_image = { url, id: 0 };
        settings.background_size = 'cover';
        settings.background_position = 'center center';
        settings.background_repeat = 'no-repeat';
      }
    }

    // Min-height for fixed-size frames (non-auto-layout)
    // so empty/sparse containers don't collapse to zero height.
    if (!layout.isAutoLayout && node.height > 0) {
      settings.min_height = pxToRemSize(node.height);
    }

  } else {
    // GroupNode — no layout info, infer direction from children
    const groupChildren = 'children' in node ? (node as GroupNode).children : [];
    const groupLayout = inferDirectionFromChildren(groupChildren);

    let customWidth = pxToRemSize(node.width);
    if (isBreakout || (isTopLevel)) {
      customWidth = makeSize(100, '%');
    } else if (parentIsGrid) {
      customWidth = makeSize(100, '%');
    } else if (parentHas12Grid && parentWidth > 0) {
      const pct = Math.round((node.width / parentWidth) * 100);
      customWidth = makeSize(Math.min(Math.max(pct, 5), 100), '%');
    } else if (parentIsRow && parentWidth > 0) {
      const pct = Math.round((node.width / parentWidth) * 100);
      customWidth = makeSize(Math.min(Math.max(pct, 5), 100), '%');
    }

    settings = {
      flex_direction: groupLayout.direction,
      flex_wrap: groupLayout.isWrap ? 'wrap' : 'nowrap',
      _element_width: 'initial',
      _element_custom_width: customWidth,
      html_tag: inferHtmlTag(node.name),
      min_height: pxToRemSize((node as GroupNode).height ?? 0),
    };
    if (isTopLevel || isBreakout) settings.content_width = 'full';
    else if (parentHas12Grid) settings.content_width = 'boxed';
    if (groupLayout.gap > 0) {
      settings.flex_gap = pxToRemSize(groupLayout.gap);
      settings.elements_gap = pxToRemSize(groupLayout.gap);
      settings.gap = pxToRemSize(groupLayout.gap);
    }
  }

  return {
    id,
    elType: 'container',
    settings,
    elements,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Traversal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively convert a Figma SceneNode into Elementor elements.
 * Returns null if the node should be silently skipped (e.g., invisible).
 */
export function convertNode(
  node: ConvertibleNode,
  opts: ConversionOptions,
  depth: number,
  parentHasLayout: boolean,
  parentWidth: number,
  rootWidth: number,
  isTopLevel: boolean,
  childLayoutGrow = 0,
  parentIsRow = false,
  parentIsGrid = false,
  parentHas12Grid = false,
  isBreakout = false
): ElementorElement | null {
  _nodeCount++;

  // Skip invisible nodes
  if ('visible' in node && node.visible === false) return null;

  // Skip absolutely positioned children — they live outside the flex flow
  // and cannot be placed in Elementor's layout model.
  if (!isTopLevel && isAbsolutePositioned(node)) return null;

  // Skip headers/footers if requested
  if (isTopLevel && opts.skipHeaderFooter) {
    const name = node.name.toLowerCase();
    if (name.includes('header') || name.includes('nav') || name.includes('footer')) {
      return null;
    }
  }

  // Max depth guard
  if (depth > opts.maxDepth) {
    // Flatten: export as image
    if (opts.exportImages) {
      const url = queueImageExport(node.id, node.name, opts.imageFormat);
      const { id } = { id: makeWidgetId() };
      return {
        id,
        elType: 'widget',
        widgetType: 'image',
        settings: { image: { url, id: 0, alt: node.name }, image_size: 'full' },
        elements: [],
      };
    }
    return null;
  }

  // Run unsupported checks
  checkEffects(node);
  checkBlendMode(node);
  checkMask(node);
  checkRotation(node);
  if ('fills' in node && node.fills !== figma.mixed) checkFills(node);
  if ('strokes' in node) checkStrokes(node);
  checkAbsolutePositioning(node, parentHasLayout);

  // ── TEXT ──────────────────────────────────────────────────────────────────
  if (node.type === 'TEXT') {
    return mapTextNode(node, opts);
  }

  // ── LINE ─────────────────────────────────────────────────────────────────
  if (isLineNode(node)) {
    return mapDividerNode(node);
  }

  // ── VECTOR / BOOLEAN_OPERATION / STAR / POLYGON ──────────────────────────
  // Small shapes → Elementor Icon widget backed by an exported SVG asset.
  // Larger/complex vectors remain unsupported.
  if (isSvgIconCandidate(node)) {
    return mapShapeAsSvgIcon(node, opts);
  }
  if (isVectorShape(node)) {
    return null;
  }

  // ── RECTANGLE / ELLIPSE with image fill → Image widget ───────────────────
  if (
    (node.type === 'RECTANGLE' || node.type === 'ELLIPSE') &&
    hasImageFill(node)
  ) {
    return mapImageFillNode(node as RectangleNode | EllipseNode, opts);
  }

  // ── RECTANGLE / ELLIPSE without image fill → skip (will be handled as
  //    container background by the parent) ───────────────────────────────────
  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE') {
    // If it has a solid fill it can be a decorative block — wrap as container
    if (!hasChildren(node)) {
      const fill = 'fills' in node && node.fills !== figma.mixed
        ? analyseFills(node.fills as Paint[])
        : null;
      if (fill?.type === 'solid' && node.height < 4) {
        // Likely a divider / separator line
        return mapDividerNode(node);
      }
      if (fill?.type === 'solid' && node.height >= 4) {
        // Coloured block — convert to container
        const id = makeWidgetId();
        return {
          id,
          elType: 'container',
          settings: {
            flex_direction: 'column',
            background_background: 'classic',
            background_color: fill.color ?? '#ffffff',
            _element_width: 'initial',
            _element_custom_width: pxToRemSize(node.width),
            min_height: pxToRemSize(node.height),
            html_tag: 'div',
          },
          elements: [],
        };
      }
      return null;
    }
  }

  // ── INSTANCE with component classification ────────────────────────────────
  if (node.type === 'INSTANCE' || node.type === 'COMPONENT') {
    const hint = classifyComponent(node.name);

    if (opts.includeProWidgets || hint.widgetType === 'button' ||
        hint.widgetType === 'icon' || hint.widgetType === 'icon-box' ||
        hint.widgetType === 'testimonial' || hint.widgetType === 'star-rating' ||
        hint.widgetType === 'counter' || hint.widgetType === 'alert' ||
        hint.widgetType === 'divider'
    ) {
      if (hint.widgetType === 'button') {
        return mapButtonComponent(node as InstanceNode, opts);
      }
      if (hint.widgetType === 'icon') {
        return mapIconComponent(node, opts);
      }
      if (hint.widgetType === 'icon-box') {
        return mapIconBoxComponent(node as InstanceNode, opts);
      }
      if (hint.widgetType === 'testimonial') {
        return mapTestimonialComponent(node as InstanceNode, opts);
      }
      if (hint.widgetType === 'star-rating') {
        return mapStarRating(node);
      }
      if (hint.widgetType === 'counter') {
        return mapCounter(node as InstanceNode);
      }
      if (hint.widgetType === 'alert') {
        return mapAlert(node as InstanceNode);
      }
      if (hint.widgetType === 'divider') {
        return mapDividerNode(node);
      }
      if (hint.widgetType === 'video') {
        return mapVideoPlaceholder(node);
      }
      if (opts.includeProWidgets && hint.widgetType === 'flip-box') {
        return mapFlipBox(node as InstanceNode);
      }
    }
    // Fall through to frame handling
  }

  // ── FRAME / COMPONENT / INSTANCE / GROUP (with children) ─────────────────
  if (hasChildren(node)) {
    const frame = node as FrameNode;

    // Check for overlapping children
    checkOverlappingChildren(node);

    // Empty spacer
    if (isEmptySpacer(node)) {
      return mapSpacerNode(node);
    }

    // Button: frame with only one text child and a significant corner radius
    if (
      frame.children?.length === 1 &&
      frame.children[0].type === 'TEXT' &&
      ('cornerRadius' in node) &&
      node.cornerRadius !== figma.mixed &&
      (node.cornerRadius as number ?? 0) >= 4
    ) {
      return mapButtonComponent(frame, opts);
    }

    // Recurse into children, skipping invisible and absolutely positioned ones
    const childElements: ElementorElement[] = [];
    const children = [...frame.children].filter(
      (c) => c.visible !== false && !isAbsolutePositioned(c)
    );

    // Determine this node's layout flavour so children know how to size themselves.
    // thisIsGrid    → CSS grid; children must not set their own width.
    // thisIsRow     → flex row; children size as % of parent.
    // thisHas12Grid → Figma 12-col Layout Guide is attached to this frame;
    //                 children should be boxed within it unless they break out.
    const { thisIsRow, thisIsGrid } = (() => {
      if ('layoutMode' in node) {
        const f = node as FrameNode | ComponentNode | InstanceNode;
        const analysed = analyseLayout(f, 0);
        return {
          thisIsRow: analysed.direction === 'row' && !analysed.isGrid,
          thisIsGrid: analysed.isGrid,
        };
      }
      return { thisIsRow: false, thisIsGrid: false };
    })();
    const thisHas12Grid = has12ColumnLayoutGuide(node);

    for (const child of children) {
      // Pass the child's own layoutGrow value so the child container
      // can determine whether it is a "fill" element.
      const grow = 'layoutGrow' in child ? (child as FrameNode).layoutGrow ?? 0 : 0;
      const childIsBreakout = thisHas12Grid && isFullBleedBreakout(child, node.width);
      const el = convertNode(
        child,
        opts,
        depth + 1,
        hasAutoLayout(node),
        node.width,
        rootWidth,
        false,
        grow,
        thisIsRow,
        thisIsGrid,
        thisHas12Grid,
        childIsBreakout
      );
      if (el) childElements.push(el);
    }

    // Build the container, passing childLayoutGrow and parentIsRow for this node
    return buildContainer(
      frame,
      childElements,
      opts,
      isTopLevel,
      parentWidth,
      rootWidth,
      childLayoutGrow,
      parentIsRow,
      parentIsGrid,
      parentHas12Grid,
      isBreakout
    );
  }

  // ── Unhandled node type ───────────────────────────────────────────────────
  return null;
}

/**
 * Convert the root selection (a Frame or top-level container) into Elementor elements.
 * Returns the top-level array of containers/sections.
 */
export function convertRoot(
  root: FrameNode | ComponentNode,
  opts: ConversionOptions
): ElementorElement[] {
  resetNodeCount();

  const rootWidth = root.width;
  const rootHas12Grid = has12ColumnLayoutGuide(root);
  const elements: ElementorElement[] = [];

  // If the root has auto-layout children, treat each direct child as a "section"
  if (root.layoutMode !== 'NONE' && root.children) {
    for (const child of root.children) {
      if (child.visible === false) continue;
      if (isAbsolutePositioned(child)) continue;
      const grow = 'layoutGrow' in child ? (child as FrameNode).layoutGrow ?? 0 : 0;
      const childIsBreakout = rootHas12Grid && isFullBleedBreakout(child, rootWidth);
      const el = convertNode(
        child, opts, 0, true, rootWidth, rootWidth, true, grow,
        false, false, rootHas12Grid, childIsBreakout
      );
      if (el) elements.push(el);
    }
  } else {
    // Root IS the section
    const el = convertNode(root, opts, 0, false, rootWidth, rootWidth, true, 0);
    if (el) elements.push(el);
  }

  return elements;
}
