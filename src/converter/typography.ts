// ─────────────────────────────────────────────────────────────────────────────
// typography.ts — Map Figma text properties to Elementor typography settings
// ─────────────────────────────────────────────────────────────────────────────

import { ElementorTypography, GlobalFont, ElementorSize } from '../types/elementor';
import { TextAnalysis } from '../types/figma-extended';
import { rgbaToString } from './colors';

let _fontCounter = 0;

function makeFontId(): string {
  _fontCounter++;
  return `global-font-${_fontCounter}`;
}

/**
 * Heading level inference from font size.
 * Heuristic based on common design system font scales.
 */
export function inferHeadingLevel(fontSize: number): TextAnalysis['inferredLevel'] {
  if (fontSize >= 56) return 'h1';
  if (fontSize >= 40) return 'h2';
  if (fontSize >= 30) return 'h3';
  if (fontSize >= 22) return 'h4';
  if (fontSize >= 18) return 'h5';
  // 17px+ can still be a small heading; below that is body text.
  if (fontSize >= 17) return 'h6';
  return 'body';
}

/**
 * Map Figma font weight name (style) to CSS font-weight number string.
 */
export function fontStyleToWeight(style: string): string {
  const s = style.toLowerCase();
  if (s.includes('thin') || s === '100') return '100';
  if (s.includes('extralight') || s.includes('extra light') || s === '200') return '200';
  if (s.includes('light') || s === '300') return '300';
  if (s.includes('regular') || s.includes('normal') || s === '400') return '400';
  if (s.includes('medium') || s === '500') return '500';
  if (s.includes('semibold') || s.includes('semi bold') || s.includes('demi') || s === '600') return '600';
  if (s.includes('bold') || s === '700') return '700';
  if (s.includes('extrabold') || s.includes('extra bold') || s.includes('heavy') || s === '800') return '800';
  if (s.includes('black') || s.includes('ultra') || s === '900') return '900';
  return '400';
}

/**
 * Determine if a font style name implies italic.
 */
export function isItalicStyle(style: string): boolean {
  const s = style.toLowerCase();
  return s.includes('italic') || s.includes('oblique');
}

/**
 * Extract text analysis from a Figma TextNode.
 * Handles mixed styles by reading the dominant/first segment.
 */
export function analyseTextNode(node: TextNode, inferHeadings: boolean): TextAnalysis {
  const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 16;
  const fontNameVal = node.fontName;
  const fontName: FontName = typeof fontNameVal === 'symbol'
    ? { family: 'Inter', style: 'Regular' }
    : fontNameVal;

  const isMixed = node.fontSize === figma.mixed || node.fills === figma.mixed;

  // Text color — take the first visible solid fill
  let color = '#000000';
  const nodeFills = node.fills;
  if (Array.isArray(nodeFills)) {
    const solidFill = nodeFills.find(
      (f): f is SolidPaint => f.type === 'SOLID' && f.visible !== false
    );
    if (solidFill) {
      const a = solidFill.opacity ?? 1;
      color = rgbaToString(solidFill.color.r, solidFill.color.g, solidFill.color.b, a);
    }
  }

  // Line height
  let lineHeight: number | null = null;
  const lh = node.lineHeight;
  if (lh && typeof lh !== 'symbol') {
    if (lh.unit === 'PIXELS') lineHeight = lh.value / fontSize; // convert to em ratio
    else if (lh.unit === 'PERCENT') lineHeight = lh.value / 100;
  }

  // Letter spacing — Figma stores in % of font size or px
  let letterSpacing = 0;
  const ls = node.letterSpacing;
  if (ls && typeof ls !== 'symbol') {
    if (ls.unit === 'PIXELS') letterSpacing = ls.value;
    else if (ls.unit === 'PERCENT') letterSpacing = (ls.value / 100) * fontSize;
  }

  // Text align
  const alignMap: Record<string, TextAnalysis['textAlign']> = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right',
    JUSTIFIED: 'justify',
  };
  const textAlign = alignMap[node.textAlignHorizontal] ?? 'left';

  // Text decoration
  const textDec = node.textDecoration;
  let textDecoration: TextAnalysis['textDecoration'] = 'none';
  if (textDec && typeof textDec !== 'symbol') {
    if (textDec === 'UNDERLINE') textDecoration = 'underline';
    else if (textDec === 'STRIKETHROUGH') textDecoration = 'line-through';
  }

  // Text case
  const textCase = node.textCase;
  let textTransform: TextAnalysis['textTransform'] = 'none';
  if (textCase && typeof textCase !== 'symbol') {
    if (textCase === 'UPPER') textTransform = 'uppercase';
    else if (textCase === 'LOWER') textTransform = 'lowercase';
    // TITLE CASE: capitalize is not a native Elementor text-transform value; skip
  }

  const inferred = inferHeadings ? inferHeadingLevel(fontSize) : 'body';

  return {
    content: node.characters,
    fontSize,
    fontFamily: fontName.family,
    fontWeight: fontStyleToWeight(fontName.style),
    fontStyle: isItalicStyle(fontName.style) ? 'italic' : 'normal',
    lineHeight,
    letterSpacing,
    textAlign,
    color,
    textDecoration,
    textTransform,
    isMixedStyles: isMixed,
    inferredLevel: inferred,
  };
}

/**
 * Convert a TextAnalysis to Elementor typography settings object.
 * Returns a partial that can be merged into any widget's settings.
 */
export function textAnalysisToTypography(
  text: TextAnalysis,
  mobileBreak: number
): ElementorTypography {
  const settings: ElementorTypography = {
    typography_typography: 'custom',
    typography_font_family: text.fontFamily,
    typography_font_size: { unit: 'px', size: text.fontSize },
    typography_font_size_tablet: { unit: 'px', size: Math.round(text.fontSize * 0.9) },
    typography_font_size_mobile: { unit: 'px', size: Math.round(text.fontSize * 0.8) },
    typography_font_weight: text.fontWeight,
  };

  if (text.fontStyle === 'italic') {
    settings.typography_font_style = 'italic';
  }

  if (text.textTransform !== 'none') {
    settings.typography_text_transform = text.textTransform;
  }

  if (text.textDecoration !== 'none') {
    settings.typography_text_decoration = text.textDecoration;
  }

  if (text.lineHeight !== null) {
    settings.typography_line_height = { unit: 'em', size: text.lineHeight };
  }

  if (text.letterSpacing !== 0) {
    settings.typography_letter_spacing = { unit: 'px', size: text.letterSpacing };
  }

  return settings;
}

/**
 * Extract Figma document-level text styles as Elementor Global Fonts.
 */
export async function extractGlobalFonts(): Promise<GlobalFont[]> {
  const styles = await figma.getLocalTextStylesAsync();
  const result: GlobalFont[] = [];

  for (const style of styles) {
    const fontName = style.fontName;
    if (typeof fontName === 'symbol') continue;

    const fontSize = typeof style.fontSize === 'number' ? style.fontSize : undefined;
    const weight = fontStyleToWeight(fontName.style);

    const gf: GlobalFont = {
      _id: makeFontId(),
      title: style.name.replace(/\//g, ' / '),
      typography_typography: 'custom',
      typography_font_family: fontName.family,
      typography_font_weight: weight,
    };

    if (fontSize) {
      gf.typography_font_size = { unit: 'px', size: fontSize };
    }

    result.push(gf);
  }

  return result;
}
