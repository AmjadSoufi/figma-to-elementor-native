// ─────────────────────────────────────────────────────────────────────────────
// index.ts — Conversion orchestrator. Wires together all converter modules.
// ─────────────────────────────────────────────────────────────────────────────

import { ConversionOptions } from '../types/figma-extended';
import { ElementorTemplate } from '../types/elementor';
import { runPreflight } from './preflight';
import { convertRoot } from './traversal';
import { buildTemplate, serializeTemplate, validateTemplate, countElements } from './json-builder';
import { extractGlobalColors } from './colors';
import { extractGlobalFonts } from './typography';
import { resetFlags, getFlaggedItems, computeFidelityScore } from './unsupported';
import { resetAssets, getAssetManifest, executeImageExports } from './assets';
import { resetWidgetCounter, makeWidgetId } from './widgets';

export type ProgressCallback = (step: string, percent: number) => void;

export const DEFAULT_OPTIONS: ConversionOptions = {
  maxDepth: 12,
  containerMaxWidth: 1200,
  exportImages: true,
  imageFormat: 'PNG',
  imageScale: 2,
  inferHeadings: true,
  useGlobalColors: true,
  useGlobalFonts: true,
  includeProWidgets: true,
  mobileBreakpoint: 767,
  tabletBreakpoint: 1024,
  skipHeaderFooter: false,
};

export interface ConversionResult {
  json: string;
  template: ElementorTemplate;
  flaggedCount: number;
  fidelityScore: number;
  elementCount: number;
  warnings: string[];
  imageExports?: Array<{ nodeId: string; filename: string; data: Uint8Array }>;
}

/**
 * Full conversion pipeline:
 * 1. Reset state
 * 2. Extract global tokens
 * 3. Traverse and convert node tree
 * 4. Collect flagged items
 * 5. Compute fidelity score
 * 6. Build and validate template JSON
 * 7. (Optional) execute image exports
 */
export async function runConversion(
  node: FrameNode | ComponentNode,
  opts: ConversionOptions = DEFAULT_OPTIONS,
  onProgress?: ProgressCallback,
  fileKey = ''
): Promise<ConversionResult> {

  const progress = onProgress ?? (() => {});

  // ── Reset all module state ─────────────────────────────────────────────
  resetFlags();
  resetAssets();
  resetWidgetCounter();

  // ── Step 1: Global tokens ──────────────────────────────────────────────
  progress('Extracting global colors and fonts…', 10);
  const globalColors = opts.useGlobalColors ? await extractGlobalColors() : [];
  const globalFonts = opts.useGlobalFonts ? await extractGlobalFonts() : [];

  // ── Step 2: Tree traversal ────────────────────────────────────────────
  progress('Traversing and converting design tree…', 30);
  const content = convertRoot(node, opts);

  // ── Step 3: Flagged items + score ─────────────────────────────────────
  progress('Computing fidelity score…', 60);
  const flaggedItems = getFlaggedItems();

  // Count total converted nodes from traversal
  const elementCount = countElements(content);
  const fidelityScore = computeFidelityScore(elementCount + flaggedItems.length);

  // ── Step 4: Asset manifest ────────────────────────────────────────────
  const assetManifest = getAssetManifest();

  // ── Step 5: Build template ────────────────────────────────────────────
  progress('Assembling Elementor template…', 75);

  const template = buildTemplate({
    title: node.name,
    figmaFileKey: fileKey,
    figmaNodeId: node.id,
    figmaNodeName: node.name,
    content,
    globalColors,
    globalFonts,
    flaggedItems,
    fidelityScore,
    assetManifest,
  });

  // ── Step 6: Validate ──────────────────────────────────────────────────
  const warnings = validateTemplate(template);

  // ── Step 7: Serialize ─────────────────────────────────────────────────
  progress('Serializing JSON…', 85);
  const json = serializeTemplate(template);

  // ── Step 8: Image exports ─────────────────────────────────────────────
  let imageExports: Array<{ nodeId: string; filename: string; data: Uint8Array }> | undefined;
  if (opts.exportImages && assetManifest.length > 0) {
    progress(`Exporting ${assetManifest.length} image asset(s)…`, 90);
    imageExports = await executeImageExports(opts);
  }

  progress('Done!', 100);

  return {
    json,
    template,
    flaggedCount: flaggedItems.length,
    fidelityScore,
    elementCount,
    warnings,
    imageExports,
  };
}
