// ─────────────────────────────────────────────────────────────────────────────
// assets.ts — Export image bytes from Figma nodes and build a manifest
// for the Elementor template. All image export uses the Figma Plugin API.
// ─────────────────────────────────────────────────────────────────────────────

import { AssetManifest } from "../types/elementor";
import { ConversionOptions } from "../types/figma-extended";

const _manifest: AssetManifest[] = [];
const _exportQueue: Array<{ nodeId: string; nodeName: string; format: "PNG" | "WEBP" | "SVG" }> =
  [];

/** Reset state at start of conversion */
export function resetAssets(): void {
  _manifest.length = 0;
  _exportQueue.length = 0;
}

/** Get the full asset manifest */
export function getAssetManifest(): AssetManifest[] {
  return [..._manifest];
}

/** Queue a node for image export */
export function queueImageExport(
  nodeId: string,
  nodeName: string,
  format: "PNG" | "WEBP" = "PNG",
): string {
  const safe = nodeName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `${safe}_${nodeId.replace(":", "-")}.${format.toLowerCase()}`;
  const placeholder = `__ASSET__/${filename}`;

  // Don't add duplicates
  if (!_exportQueue.find((e) => e.nodeId === nodeId)) {
    _exportQueue.push({ nodeId, nodeName, format });
    _manifest.push({
      node_id: nodeId,
      node_name: nodeName,
      filename,
      format,
      placeholder_url: placeholder,
    });
  }

  return placeholder;
}

/**
 * Queue a node for SVG export. Returns the placeholder URL that the Elementor
 * Icon widget will reference (the UI later rewrites it to the uploaded URL).
 */
export function queueSvgExport(nodeId: string, nodeName: string): string {
  const safe = nodeName.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "icon";
  const filename = `${safe}_${nodeId.replace(":", "-")}.svg`;
  const placeholder = `__ASSET__/${filename}`;

  if (!_exportQueue.find((e) => e.nodeId === nodeId)) {
    _exportQueue.push({ nodeId, nodeName, format: "SVG" });
    _manifest.push({
      node_id: nodeId,
      node_name: nodeName,
      filename,
      format: "SVG",
      placeholder_url: placeholder,
    });
  }
  return placeholder;
}

/** Get placeholder URL for a node that was already queued */
export function getPlaceholderUrl(nodeId: string): string | undefined {
  const entry = _manifest.find((m) => m.node_id === nodeId);
  return entry?.placeholder_url;
}

/**
 * Execute all queued image exports.
 * Returns an array of { nodeId, filename, data } for the UI to handle.
 */
export async function executeImageExports(
  opts: ConversionOptions,
): Promise<Array<{ nodeId: string; filename: string; data: Uint8Array }>> {
  if (!opts.exportImages || _exportQueue.length === 0) return [];

  const results: Array<{ nodeId: string; filename: string; data: Uint8Array }> = [];

  for (const entry of _exportQueue) {
    try {
      const node = await figma.getNodeByIdAsync(entry.nodeId);
      if (!node || !("exportAsync" in node)) continue;

      const exportable = node as ExportMixin;
      const data =
        entry.format === "SVG"
          ? await exportable.exportAsync({ format: "SVG" })
          : await exportable.exportAsync({
              format: "PNG",
              constraint: { type: "SCALE", value: opts.imageScale },
            });

      const manifest = _manifest.find((m) => m.node_id === entry.nodeId);
      const fallbackExt = entry.format === "SVG" ? "svg" : "png";
      const filename = manifest?.filename ?? `${entry.nodeId}.${fallbackExt}`;

      results.push({ nodeId: entry.nodeId, filename, data });
    } catch (err) {
      console.warn(`[Assets] Failed to export node ${entry.nodeId}:`, err);
    }
  }

  return results;
}

/**
 * Check whether a Figma node has an image fill and return the imageHash if so.
 */
export function getImageFillHash(node: SceneNode): string | null {
  if (!("fills" in node) || node.fills === figma.mixed) return null;
  const fills = node.fills as readonly Paint[];
  const imageFill = fills.find((f): f is ImagePaint => f.type === "IMAGE" && f.visible !== false);
  return imageFill?.imageHash ?? null;
}

/**
 * Detect whether a node is purely decorative (image/vector with no text children).
 * Used to decide between Image widget vs Container-with-background.
 */
export function isImageNode(node: SceneNode): boolean {
  if (node.type === "RECTANGLE" || node.type === "ELLIPSE") {
    const imageHash = getImageFillHash(node);
    if (imageHash) return true;
  }
  return false;
}
