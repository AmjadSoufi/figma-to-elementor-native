// ─────────────────────────────────────────────────────────────────────────────
// layout.ts — Analyse Figma auto-layout frames and produce Elementor
// Container settings (flex/grid direction, gap, padding, alignment).
// ─────────────────────────────────────────────────────────────────────────────

import { ElementorContainerSettings, ElementorSize, ElementorSpacing } from '../types/elementor';
import { LayoutAnalysis, AnalysedFill } from '../types/figma-extended';
import { ConversionOptions } from '../types/figma-extended';
import { REM_ROOT, pxToRemSize, remSpacing } from './units';

type LayoutFrame = FrameNode | ComponentNode | InstanceNode;

/**
 * A Figma frame has a "12-column layout guide" when its layoutGrids contain
 * a visible COLUMNS grid with exactly 12 sections. Used as the authoritative
 * signal for "this frame hosts the 12-col grid".
 */
export function has12ColumnLayoutGuide(node: SceneNode): boolean {
  if (!('layoutGrids' in node)) return false;
  const grids = (node as FrameNode).layoutGrids;
  if (!Array.isArray(grids) || grids.length === 0) return false;
  return grids.some(
    (g) => g.visible !== false && g.pattern === 'COLUMNS' && (g as GridLayoutGrid & { count?: number }).count === 12
  );
}

/**
 * Width of the 12-col grid's content band (all columns + gutters). For
 * COLUMNS grids with alignment='CENTER'|'MIN'|'MAX' Figma stores offset,
 * count, width, gutter. We reconstruct: count*width + (count-1)*gutter.
 *
 * Returns 0 if no usable 12-col grid is found.
 */
export function get12ColumnContentWidth(node: SceneNode): number {
  if (!('layoutGrids' in node)) return 0;
  const grids = (node as FrameNode).layoutGrids;
  if (!Array.isArray(grids)) return 0;
  const grid = grids.find(
    (g) => g.visible !== false && g.pattern === 'COLUMNS' && (g as GridLayoutGrid & { count?: number }).count === 12
  ) as (GridLayoutGrid & { count: number; sectionSize?: number; gutterSize?: number }) | undefined;
  if (!grid) return 0;
  const col = grid.sectionSize ?? 0;
  const gutter = grid.gutterSize ?? 0;
  if (col <= 0) return 0;
  return grid.count * col + (grid.count - 1) * gutter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alignment Mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapPrimaryAlign(
  value: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
): 'flex-start' | 'center' | 'flex-end' | 'space-between' {
  const map: Record<string, 'flex-start' | 'center' | 'flex-end' | 'space-between'> = {
    MIN: 'flex-start',
    CENTER: 'center',
    MAX: 'flex-end',
    SPACE_BETWEEN: 'space-between',
  };
  return map[value] ?? 'flex-start';
}

function mapCounterAlign(
  value: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'
): ElementorContainerSettings['align_items'] {
  const map: Record<string, ElementorContainerSettings['align_items']> = {
    MIN: 'flex-start',
    CENTER: 'center',
    MAX: 'flex-end',
    BASELINE: 'baseline',
  };
  return map[value] ?? 'flex-start';
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Layout Inference (for non-auto-layout frames)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For frames WITHOUT auto-layout, inspect where children are positioned to
 * infer whether they form a row, a wrapped grid, or a vertical stack.
 *
 * Returns: 'row' | 'wrap' | 'column'
 */
export function inferDirectionFromChildren(
  children: readonly SceneNode[]
): { direction: 'row' | 'column'; isWrap: boolean; gap: number; gapColumn: number; gridColumns: number } {
  const visible = children.filter((c) => c.visible !== false);
  if (visible.length === 0) return { direction: 'column', isWrap: false, gap: 0, gapColumn: 0, gridColumns: 1 };
  if (visible.length === 1) return { direction: 'column', isWrap: false, gap: 0, gapColumn: 0, gridColumns: 1 };

  // Check if children share similar Y values → they are in the same row
  const ys = visible.map((c) => c.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const ySpread = maxY - minY;

  // Treat as a row if all children start within 20% of the shortest child's height
  const minHeight = Math.min(...visible.map((c) => c.height));
  const inSameRow = ySpread < Math.max(minHeight * 0.25, 10);

  if (inSameRow) {
    // Sort by X to compute gaps between children
    const sorted = [...visible].sort((a, b) => a.x - b.x);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      gaps.push(sorted[i].x - (prev.x + prev.width));
    }
    const avgGap = gaps.length > 0 ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : 0;
    return { direction: 'row', isWrap: false, gap: Math.max(0, avgGap), gapColumn: 0, gridColumns: visible.length };
  }

  // Multiple distinct Y rows → check if children form a grid (same width, multiple rows)
  const uniqueYs = [...new Set(ys.map((y) => Math.round(y / 5) * 5))]; // bucket to 5px
  if (uniqueYs.length > 1) {
    // Sort children into rows
    const rows: SceneNode[][] = [];
    for (const y of uniqueYs.sort((a, b) => a - b)) {
      const row = visible.filter((c) => Math.abs(c.y - y) < 20);
      if (row.length > 1) rows.push(row);
    }

    // If we detected multiple rows each with > 1 child → it's a wrap grid
    if (rows.length > 1) {
      const firstRow = rows[0].sort((a, b) => a.x - b.x);
      const colGaps: number[] = [];
      for (let i = 1; i < firstRow.length; i++) {
        colGaps.push(firstRow[i].x - (firstRow[i - 1].x + firstRow[i - 1].width));
      }
      const avgColGap = colGaps.length > 0
        ? Math.round(colGaps.reduce((s, g) => s + g, 0) / colGaps.length)
        : 0;

      // Row gap: distance between the bottom of row 0 and top of row 1
      const row0Bottom = Math.max(...rows[0].map((c) => c.y + c.height));
      const row1Top = Math.min(...rows[1].map((c) => c.y));
      const rowGap = Math.max(0, row1Top - row0Bottom);

      const gridColumns = Math.max(...rows.map((r) => r.length));
      return { direction: 'row', isWrap: true, gap: Math.max(0, avgColGap), gapColumn: rowGap, gridColumns };
    }
  }

  // Vertical stack — compute average gap between siblings
  const sorted = [...visible].sort((a, b) => a.y - b.y);
  const vGaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    vGaps.push(sorted[i].y - (prev.y + prev.height));
  }
  const avgVGap = vGaps.length > 0
    ? Math.round(vGaps.reduce((s, g) => s + g, 0) / vGaps.length)
    : 0;

  return { direction: 'column', isWrap: false, gap: Math.max(0, avgVGap), gapColumn: 0, gridColumns: 1 };
}

/**
 * Count the maximum number of children appearing in the same row of an
 * auto-layout WRAP frame. Used to pick a CSS grid column count.
 */
function countWrapColumns(children: readonly SceneNode[]): number {
  const visible = children.filter((c) => c.visible !== false);
  if (visible.length <= 1) return Math.max(1, visible.length);

  // Bucket by Y (5px tolerance)
  const ys = visible.map((c) => Math.round(c.y / 5) * 5);
  const uniqueYs = [...new Set(ys)].sort((a, b) => a - b);
  const rowCounts = uniqueYs.map((y) => visible.filter((c) => Math.abs(c.y - y) < 20).length);
  return Math.max(1, ...rowCounts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Frame Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract layout analysis from a Figma frame-like node.
 *
 * @param node            The Figma frame / component / instance node.
 * @param childLayoutGrow The `layoutGrow` value of this node as seen from its
 *                        parent. Passed from traversal because `layoutGrow`
 *                        is a child-level property, not the frame's own.
 */
export function analyseLayout(node: LayoutFrame, childLayoutGrow = 0): LayoutAnalysis {
  const isAutoLayout = node.layoutMode !== 'NONE';

  let direction: LayoutAnalysis['direction'];
  let isWrap: boolean;
  let gap: number;
  let gapColumn: number;
  let gridColumns: number;

  if (isAutoLayout) {
    direction =
      node.layoutMode === 'HORIZONTAL' ? 'row' :
      node.layoutMode === 'VERTICAL'   ? 'column' : 'none';

    isWrap = 'layoutWrap' in node && node.layoutWrap === 'WRAP';
    gap = node.itemSpacing ?? 0;
    gapColumn = isWrap && 'counterAxisSpacing' in node
      ? ((node as FrameNode).counterAxisSpacing ?? gap)
      : gap;
    gridColumns = isWrap && 'children' in node
      ? countWrapColumns((node as FrameNode).children)
      : 1;
  } else {
    // No auto-layout — infer from child positions
    const children = 'children' in node ? (node as FrameNode).children : [];
    const inferred = inferDirectionFromChildren(children);
    direction = inferred.direction;
    isWrap = inferred.isWrap;
    gap = inferred.gap;
    gapColumn = inferred.gapColumn;
    gridColumns = inferred.gridColumns;
  }

  // Treat wrap rows as a CSS grid when we have ≥2 columns — grid handles
  // gap math deterministically, whereas flex-wrap + % widths overflows and
  // collapses the rows to a single column.
  const isGrid = isWrap && direction === 'row' && gridColumns >= 2;

  // Padding
  const paddingTop    = node.paddingTop ?? 0;
  const paddingRight  = node.paddingRight ?? 0;
  const paddingBottom = node.paddingBottom ?? 0;
  const paddingLeft   = node.paddingLeft ?? 0;

  // Alignment (only meaningful for auto-layout, but record anyway)
  const primaryAxisAlignFigma  = node.primaryAxisAlignItems ?? 'MIN';
  const counterAxisAlignFigma  = node.counterAxisAlignItems ?? 'MIN';
  const primaryAxisAlign = mapPrimaryAlign(primaryAxisAlignFigma as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN');
  const crossAxisAlign   = mapCounterAlign(counterAxisAlignFigma as 'MIN' | 'CENTER' | 'MAX' | 'BASELINE');

  // Sizing behaviour
  const hSizing = 'layoutSizingHorizontal' in node
    ? (node as FrameNode).layoutSizingHorizontal : undefined;

  // isFill: child fills its parent's main axis
  const isFill = childLayoutGrow === 1 || hSizing === 'FILL';

  // isHugging: shrinks to fit its own content
  const primarySizing = node.primaryAxisSizingMode ?? 'FIXED';
  const counterSizing = node.counterAxisSizingMode ?? 'FIXED';
  const isHugging = !isFill && (hSizing === 'HUG' || primarySizing === 'AUTO' || counterSizing === 'AUTO');

  return {
    isAutoLayout,
    direction,
    isWrap,
    isGrid,
    gridColumns,
    gap,
    gapColumn,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    primaryAxisAlign,
    crossAxisAlign: crossAxisAlign as 'flex-start' | 'center' | 'flex-end' | 'stretch',
    width: node.width,
    height: node.height,
    isFull: false,
    isHugging,
    isFill,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Tag Inference
// ─────────────────────────────────────────────────────────────────────────────

/** Infer a semantic HTML tag from a layer name */
export function inferHtmlTag(name: string): ElementorContainerSettings['html_tag'] {
  const lower = name.toLowerCase();
  if (lower.includes('header') || lower.includes('nav')) return 'header';
  if (lower.includes('footer')) return 'footer';
  if (lower.includes('hero') || lower.includes('section')) return 'section';
  if (lower.includes('main') || lower.includes('content')) return 'main';
  if (lower.includes('aside') || lower.includes('sidebar')) return 'aside';
  if (lower.includes('article') || lower.includes('post') || lower.includes('card')) return 'article';
  return 'div';
}

// ─────────────────────────────────────────────────────────────────────────────
// Container Settings Builder
// ─────────────────────────────────────────────────────────────────────────────

// Spacings/radii in this module are emitted as rem for accessibility.
// See units.ts for the convention.
function makeSpacing(t: number, r: number, b: number, l: number): ElementorSpacing {
  return remSpacing(t, r, b, l);
}

function makeSize(size: number, unit: ElementorSize['unit'] = 'px'): ElementorSize {
  return { unit, size: Math.round(size) };
}

/** Shorthand: a gap/size in rem. */
function remGap(px: number): ElementorSize {
  return pxToRemSize(px);
}

/**
 * Build the full Elementor Container settings from a LayoutAnalysis.
 *
 * Key rule for child width:
 *   - isTopLevel → full-width section (content_width: 'full', width: 100%)
 *   - isFill     → 100% of parent (flex fill)
 *   - isHugging  → auto (shrink to content)
 *   - fixed, parent is ROW → use % so columns work at all viewport sizes
 *   - fixed, parent is COLUMN → use px for precise height/width control
 *
 * @param layout      Analysed layout data
 * @param opts        Conversion options
 * @param isTopLevel  Is this a top-level section?
 * @param parentWidth Width of the parent container (px)
 * @param parentIsRow True when the parent flex direction is 'row'
 * @param bgColor     Optional solid background color
 * @param bgFill      Optional full AnalysedFill for gradient/image support
 */
export function buildContainerSettings(
  layout: LayoutAnalysis,
  opts: ConversionOptions,
  isTopLevel: boolean,
  parentWidth: number,
  parentIsRow: boolean,
  bgColor?: string,
  bgFill?: AnalysedFill,
  parentIsGrid = false,
  parentHas12Grid = false,
  isFullBleedBreakout = false
): ElementorContainerSettings {
  const settings: ElementorContainerSettings = {};

  // ── Direction / Flex / Grid ────────────────────────────────────────────────
  // Use inferred direction even for non-auto-layout frames (from analyseLayout)
  if (layout.isGrid) {
    // CSS Grid — deterministic column/gap handling, unlike flex-wrap.
    settings.container_type = 'grid';
    settings.grid_columns_grid = { unit: 'fr', size: layout.gridColumns, sizes: [] };
    settings.grid_rows_grid = { unit: 'fr', size: 1, sizes: [] };
    const colGap = layout.gap;
    const rowGap = layout.gapColumn || layout.gap;
    settings.grid_gaps = {
      column: colGap / REM_ROOT,
      row: rowGap / REM_ROOT,
      isLinked: colGap === rowGap,
      unit: 'rem',
      size: colGap / REM_ROOT,
    };
    settings.grid_auto_flow = 'row';
    // Responsive: collapse to 2 cols on tablet, 1 on mobile
    const tabletCols = Math.max(1, Math.min(layout.gridColumns, 2));
    settings.grid_columns_grid_tablet = { unit: 'fr', size: tabletCols, sizes: [] };
    settings.grid_columns_grid_mobile = { unit: 'fr', size: 1, sizes: [] };
    settings.justify_content = layout.primaryAxisAlign;
    settings.align_items = layout.crossAxisAlign;
  } else if (layout.direction === 'row') {
    settings.flex_direction = 'row';
    settings.flex_wrap = layout.isWrap ? 'wrap' : 'nowrap';
    settings.justify_content = layout.primaryAxisAlign;
    settings.align_items = layout.crossAxisAlign;
    if (layout.gap > 0) {
      settings.flex_gap = remGap(layout.gap);
      settings.elements_gap = remGap(layout.gap);
      settings.gap = remGap(layout.gap);
    }
    if (layout.isWrap && layout.gapColumn !== layout.gap) {
      settings.flex_gap_column = remGap(layout.gapColumn);
    }
  } else if (layout.direction === 'column') {
    settings.flex_direction = 'column';
    if (layout.isAutoLayout) {
      settings.justify_content = layout.primaryAxisAlign;
      settings.align_items = layout.crossAxisAlign;
      if (layout.gap > 0) {
        settings.flex_gap = remGap(layout.gap);
        settings.elements_gap = remGap(layout.gap);
        settings.gap = remGap(layout.gap);
      }
    }
  } else {
    // direction === 'none' (rare fallback)
    settings.flex_direction = 'column';
  }

  // ── Padding ────────────────────────────────────────────────────────────────
  const hasPadding =
    layout.paddingTop + layout.paddingRight + layout.paddingBottom + layout.paddingLeft > 0;
  if (hasPadding) {
    settings.padding = makeSpacing(
      layout.paddingTop, layout.paddingRight, layout.paddingBottom, layout.paddingLeft
    );
    settings.padding_tablet = makeSpacing(
      Math.round(layout.paddingTop * 0.75),
      Math.round(layout.paddingRight * 0.75),
      Math.round(layout.paddingBottom * 0.75),
      Math.round(layout.paddingLeft * 0.75)
    );
    settings.padding_mobile = makeSpacing(
      Math.min(layout.paddingTop, 20),
      Math.min(layout.paddingRight, 16),
      Math.min(layout.paddingBottom, 20),
      Math.min(layout.paddingLeft, 16)
    );
  }

  // ── Background ─────────────────────────────────────────────────────────────
  if (bgFill && bgFill.type === 'gradient' && bgFill.colorStop && bgFill.colorStop.length >= 2) {
    settings.background_background = 'gradient';
    settings.background_gradient_type = bgFill.gradientAngle !== undefined ? 'linear' : 'radial';
    settings.background_color = bgFill.colorStop[0];
    settings.background_color_b = bgFill.colorStop[bgFill.colorStop.length - 1];
    settings.background_gradient_angle = makeSize(bgFill.gradientAngle ?? 135, 'deg' as ElementorSize['unit']);
    settings.background_color_stop = makeSize(0, '%');
    settings.background_color_b_stop = makeSize(100, '%');
  } else if (bgColor && bgColor !== 'transparent') {
    settings.background_background = 'classic';
    settings.background_color = bgColor;
  }

  // ── Width / Content Width ──────────────────────────────────────────────────
  if (isTopLevel) {
    // Top-level section → full canvas width
    settings.content_width = 'full';
    settings.width = makeSize(100, '%');
    settings.width_tablet = makeSize(100, '%');
    settings.width_mobile = makeSize(100, '%');
  } else if (isFullBleedBreakout) {
    // Child spans the full parent width and is explicitly breaking out of the
    // 12-col grid — emit full-bleed width.
    settings.content_width = 'full';
    settings._element_width = 'initial';
    settings._element_custom_width = makeSize(100, '%');
    settings.width = makeSize(100, '%');
    settings.width_tablet = makeSize(100, '%');
    settings.width_mobile = makeSize(100, '%');
  } else if (parentHas12Grid) {
    // Inside the 12-col grid: keep the child boxed within the grid's content
    // band. Use its fractional share of the parent (expressed in %) so it
    // lines up with the grid columns at any viewport.
    settings.content_width = 'boxed';
    if (parentWidth > 0) {
      const pct = Math.min(Math.max(Math.round((layout.width / parentWidth) * 100), 5), 100);
      settings._element_width = 'initial';
      settings._element_custom_width = makeSize(pct, '%');
    } else {
      settings._element_width = 'initial';
      settings._element_custom_width = pxToRemSize(layout.width);
    }
    settings.width_tablet = makeSize(100, '%');
    settings.width_mobile = makeSize(100, '%');
  } else if (parentIsGrid) {
    // Grid cell already has its width; stretch the child to fill it.
    settings._element_width = 'initial';
    settings._element_custom_width = makeSize(100, '%');
  } else if (layout.isFill && !parentIsRow) {
    // Fills horizontal space.
    // If parent is a column, 100% is correct.
    // If parent is a row, forcing 100% width breaks wrapping grids,
    // so we fall through to the computed % calculation below.
    settings._element_width = 'initial';
    settings._element_custom_width = makeSize(100, '%');
  } else if (layout.isHugging) {
    // Shrink to content
    settings._element_width = 'auto';
  } else {
    // Fixed size.
    // When the parent is a ROW, express width as % so flex columns work at
    // any viewport size and Elementor's flex model places them side by side.
    // When the parent is a COLUMN, rem so the layout scales with user zoom.
    if (parentIsRow && parentWidth > 0) {
      const pct = (layout.width / parentWidth) * 100;
      const safePct = Math.min(Math.max(Math.round(pct), 5), 100);
      settings._element_width = 'initial';
      settings._element_custom_width = makeSize(safePct, '%');
    } else {
      settings._element_width = 'initial';
      settings._element_custom_width = pxToRemSize(layout.width);
    }
  }

  // ── HTML tag placeholder (overwritten by traversal after this call) ────────
  settings.html_tag = 'div';

  return settings;
}

/**
 * Determine if a top-level frame should be treated as a "section"
 * (full-width background band) vs an inner "boxed" container.
 */
export function isTopLevelSection(
  node: SceneNode,
  rootWidth: number,
  opts: ConversionOptions
): boolean {
  const widthRatio = node.width / rootWidth;
  return widthRatio >= 0.9; // 90%+ of the root width = full-width section
}

/**
 * Build responsive width settings for inner containers inside a section.
 * Returns a boxed container capped at containerMaxWidth.
 */
export function buildBoxedInnerSettings(opts: ConversionOptions): Partial<ElementorContainerSettings> {
  return {
    content_width: 'boxed',
    width: pxToRemSize(opts.containerMaxWidth),
    width_tablet: { unit: '%', size: 100 },
    width_mobile: { unit: '%', size: 100 },
  };
}
