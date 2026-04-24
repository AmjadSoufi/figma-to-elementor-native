// ─────────────────────────────────────────────────────────────────────────────
// json-builder.ts — Assemble the final Elementor-compatible template JSON.
// ─────────────────────────────────────────────────────────────────────────────

import { ElementorTemplate, ElementorElement, GlobalColor, GlobalFont } from "../types/elementor";
import { FlaggedItem, AssetManifest } from "../types/elementor";

export interface BuildTemplateOptions {
  title: string;
  figmaFileKey: string;
  figmaNodeId: string;
  figmaNodeName: string;
  content: ElementorElement[];
  globalColors: GlobalColor[];
  globalFonts: GlobalFont[];
  flaggedItems: FlaggedItem[];
  fidelityScore: number;
  assetManifest: AssetManifest[];
}

/**
 * Assemble and return the final Elementor template JSON string.
 * This output is directly importable via Elementor → Templates → Import.
 */
export function buildTemplate(opts: BuildTemplateOptions): ElementorTemplate {
  const template: ElementorTemplate = {
    version: "0.4",
    title: opts.title || "Converted from Figma",
    type: "page",
    content: opts.content,
    page_settings: {
      // No custom CSS — hard rule
      custom_css: "",
    },
    metadata: {
      generated_by: "Figma2ElementorNative",
      plugin_version: "1.0.0",
      figma_file_key: opts.figmaFileKey,
      figma_node_id: opts.figmaNodeId,
      figma_node_name: opts.figmaNodeName,
      exported_at: new Date().toISOString(),
      global_colors: opts.globalColors,
      global_fonts: opts.globalFonts,
      flagged_items: opts.flaggedItems,
      fidelity_score: opts.fidelityScore,
      asset_manifest: opts.assetManifest,
    },
  };

  return template;
}

/**
 * Serialize the template to a pretty-printed JSON string.
 * Also injects minimal Elementor page settings.
 */
export function serializeTemplate(template: ElementorTemplate): string {
  return JSON.stringify(template, null, 2);
}

/**
 * Validate that the template content array is non-empty and all elements
 * have the required fields. Returns error messages.
 */
export function validateTemplate(template: ElementorTemplate): string[] {
  const errors: string[] = [];

  if (!template.content || template.content.length === 0) {
    errors.push("Template content is empty — no elements were converted.");
  }

  function validateElement(el: ElementorElement, path: string): void {
    if (!el.id) errors.push(`Missing id at ${path}`);
    if (!el.elType) errors.push(`Missing elType at ${path}`);
    if (el.elType === "widget" && !(el as { widgetType?: string }).widgetType) {
      errors.push(`Missing widgetType at ${path}`);
    }
  }

  function walkElements(elements: ElementorElement[], parentPath: string): void {
    elements.forEach((el, i) => {
      const path = `${parentPath}[${i}]`;
      validateElement(el, path);
      if ("elements" in el && Array.isArray(el.elements)) {
        walkElements(el.elements, path + ".elements");
      }
    });
  }

  if (template.content) {
    walkElements(template.content, "content");
  }

  return errors;
}

/**
 * Count total elements in the template (recursive).
 */
export function countElements(elements: ElementorElement[]): number {
  let count = 0;
  for (const el of elements) {
    count++;
    if ("elements" in el && Array.isArray(el.elements)) {
      count += countElements(el.elements);
    }
  }
  return count;
}
