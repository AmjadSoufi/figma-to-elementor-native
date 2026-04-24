// ─────────────────────────────────────────────────────────────────────────────
// Elementor JSON Type Definitions
// These represent the exact structure Elementor expects for template import.
// ─────────────────────────────────────────────────────────────────────────────

export type ElementorUnit = "px" | "%" | "em" | "rem" | "vw" | "vh" | "deg";

export interface ElementorSize {
  unit: ElementorUnit;
  size: number;
}

export interface ElementorSpacing {
  top: string;
  right: string;
  bottom: string;
  left: string;
  unit: ElementorUnit;
  isLinked?: boolean;
}

export interface ElementorBorderRadius {
  top: string;
  right: string;
  bottom: string;
  left: string;
  unit: ElementorUnit;
  isLinked?: boolean;
}

export interface ElementorBoxShadow {
  horizontal: number;
  vertical: number;
  blur: number;
  spread: number;
  color: string;
}

export interface ElementorTypography {
  typography_typography?: "custom";
  typography_font_family?: string;
  typography_font_size?: ElementorSize;
  typography_font_size_tablet?: ElementorSize;
  typography_font_size_mobile?: ElementorSize;
  typography_font_weight?: string;
  typography_font_style?: "normal" | "italic" | "oblique";
  typography_text_transform?: "none" | "uppercase" | "lowercase" | "capitalize";
  typography_text_decoration?: "none" | "underline" | "overline" | "line-through";
  typography_line_height?: ElementorSize;
  typography_letter_spacing?: ElementorSize;
}

export interface ElementorBackgroundClassic {
  background_background: "classic";
  background_color?: string;
  background_image?: { url: string; id: number };
  background_position?: string;
  background_repeat?: "no-repeat" | "repeat" | "repeat-x" | "repeat-y";
  background_size?: "auto" | "cover" | "contain";
  background_attachment?: "scroll" | "fixed";
}

export interface ElementorBackgroundGradient {
  background_background: "gradient";
  background_gradient_type?: "linear" | "radial";
  background_gradient_angle?: ElementorSize;
  background_color?: string;
  background_color_b?: string;
  background_color_stop?: ElementorSize;
  background_color_b_stop?: ElementorSize;
}

export type ElementorBackground = ElementorBackgroundClassic | ElementorBackgroundGradient;

// ── Container Settings ──────────────────────────────────────────────────────

export interface ElementorContainerSettings {
  // Layout
  flex_direction?: "row" | "column" | "row-reverse" | "column-reverse";
  flex_wrap?: "wrap" | "nowrap";
  flex_gap?: ElementorSize;
  flex_gap_column?: ElementorSize;
  elements_gap?: ElementorSize;
  gap?: ElementorSize;
  justify_content?:
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  align_items?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  align_content?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around";

  // Content width
  content_width?: "boxed" | "full";
  width?: ElementorSize;
  width_tablet?: ElementorSize;
  width_mobile?: ElementorSize;
  height?: "default" | "fit" | "min-height" | "full";
  min_height?: ElementorSize;
  custom_height?: ElementorSize;

  // Self sizing
  _element_width?: "auto" | "initial";
  _element_custom_width?: ElementorSize;
  _element_vertical_align?: string;

  // Spacing
  padding?: ElementorSpacing;
  padding_tablet?: ElementorSpacing;
  padding_mobile?: ElementorSpacing;
  margin?: ElementorSpacing;
  margin_tablet?: ElementorSpacing;
  margin_mobile?: ElementorSpacing;

  // Background
  background_background?: string;
  background_color?: string;
  background_image?: { url: string; id: number };
  background_position?: string;
  background_repeat?: string;
  background_size?: string;
  background_gradient_type?: string;
  background_gradient_angle?: ElementorSize;
  background_color_b?: string;
  background_color_stop?: ElementorSize;
  background_color_b_stop?: ElementorSize;

  // Border
  border_border?: "none" | "solid" | "double" | "dotted" | "dashed" | "groove";
  border_width?: ElementorSpacing;
  border_color?: string;
  border_radius?: ElementorBorderRadius;

  // Shadow
  box_shadow_box_shadow_type?: "yes" | "";
  box_shadow_box_shadow?: ElementorBoxShadow;

  // Overflow
  overflow?: "default" | "hidden";

  // Opacity
  opacity?: ElementorSize;

  // Position (for z-index only — not absolute positioning)
  z_index?: number;

  // HTML tag
  html_tag?: "div" | "header" | "footer" | "main" | "article" | "section" | "aside" | "nav";

  // Responsive visibility
  hide_desktop?: string;
  hide_tablet?: string;
  hide_mobile?: string;

  [key: string]: unknown;
}

// ── Widget Settings ─────────────────────────────────────────────────────────

export interface HeadingSettings extends ElementorTypography {
  title?: string;
  header_size?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  align?: "left" | "center" | "right" | "justify";
  title_color?: string;
  link?: { url: string; is_external?: string; nofollow?: string };
  _element_width?: string;
  [key: string]: unknown;
}

export interface TextEditorSettings {
  editor?: string; // HTML string
  align?: "left" | "center" | "right" | "justify";
  text_color?: string;
  _element_width?: string;
  typography_typography?: "custom";
  typography_font_family?: string;
  typography_font_size?: ElementorSize;
  typography_font_size_tablet?: ElementorSize;
  typography_font_size_mobile?: ElementorSize;
  typography_font_weight?: string;
  typography_line_height?: ElementorSize;
  typography_letter_spacing?: ElementorSize;
  [key: string]: unknown;
}

export interface ButtonSettings {
  text?: string;
  link?: { url: string; is_external?: string };
  align?: "left" | "center" | "right" | "justify";
  button_type?: "info" | "success" | "warning" | "danger" | "";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  icon?: string;
  icon_align?: "left" | "right";
  background_color?: string;
  button_text_color?: string;
  border_border?: string;
  border_width?: ElementorSpacing;
  border_color?: string;
  border_radius?: ElementorBorderRadius;
  typography_typography?: "custom";
  typography_font_size?: ElementorSize;
  typography_font_weight?: string;
  text_padding?: ElementorSpacing;
  hover_color?: string;
  button_background_hover_color?: string;
  hover_border_color?: string;
  hover_animation?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface ImageSettings {
  image?: { url: string; id: number; alt?: string };
  image_size?: "thumbnail" | "medium" | "large" | "full" | "custom";
  image_custom_dimension?: { width: number; height: number };
  align?: "left" | "center" | "right";
  caption?: string;
  link_to?: "none" | "file" | "custom";
  link?: { url: string };
  width?: ElementorSize;
  height?: ElementorSize;
  object_fit?: "fill" | "cover" | "contain";
  border_radius?: ElementorBorderRadius;
  opacity?: ElementorSize;
  css_filters_css_filter?: "normal";
  _element_width?: string;
  [key: string]: unknown;
}

export interface IconSettings {
  icon?: { value: string; library: string };
  view?: "default" | "stacked" | "framed";
  shape?: "circle" | "square";
  align?: "left" | "center" | "right";
  primary_color?: string;
  secondary_color?: string;
  size?: ElementorSize;
  rotate?: ElementorSize;
  border_width?: ElementorSize;
  border_radius?: ElementorSize;
  _element_width?: string;
  [key: string]: unknown;
}

export interface DividerSettings {
  style?: "solid" | "double" | "dotted" | "dashed";
  weight?: ElementorSize;
  color?: string;
  bring_to_front?: string;
  width?: ElementorSize;
  align?: "left" | "center" | "right";
  look?: "line" | "gap";
  gap?: ElementorSize;
  _element_width?: string;
  [key: string]: unknown;
}

export interface SpacerSettings {
  space?: ElementorSize;
  _element_width?: string;
  [key: string]: unknown;
}

export interface IconBoxSettings extends ElementorTypography {
  icon?: { value: string; library: string };
  icon_image?: { url: string; id: number };
  view?: "default" | "stacked" | "framed";
  shape?: "circle" | "square";
  icon_size?: ElementorSize;
  icon_color?: string;
  title_text?: string;
  description_text?: string;
  position?: "top" | "left" | "right";
  align?: "left" | "center" | "right";
  title_color?: string;
  description_color?: string;
  title_size?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  _element_width?: string;
  [key: string]: unknown;
}

export interface ImageBoxSettings extends ElementorTypography {
  image?: { url: string; id: number };
  image_size?: string;
  title_text?: string;
  description_text?: string;
  position?: "top" | "left" | "right";
  align?: "left" | "center" | "right" | "justify";
  title_color?: string;
  description_color?: string;
  title_size?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  _element_width?: string;
  [key: string]: unknown;
}

export interface VideoSettings {
  video_type?: "youtube" | "vimeo" | "hosted";
  youtube_url?: string;
  vimeo_url?: string;
  autoplay?: string;
  mute?: string;
  loop?: string;
  controls?: string;
  aspect_ratio?: "169" | "219" | "43" | "32" | "11" | "916";
  image_overlay?: { url: string; id: number };
  show_image_overlay?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface StarRatingSettings {
  rating_scale?: "5" | "10";
  rating?: number;
  star_color?: string;
  unmarked_star_color?: string;
  star_size?: ElementorSize;
  align?: "left" | "center" | "right" | "justify";
  _element_width?: string;
  [key: string]: unknown;
}

export interface CounterSettings {
  starting_number?: number;
  ending_number?: number;
  duration?: number;
  title?: string;
  align?: "left" | "center" | "right";
  number_color?: string;
  title_color?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface ProgressBarSettings {
  title?: string;
  percent?: ElementorSize;
  inner_text?: string;
  bar_height?: ElementorSize;
  bar_color?: string;
  bar_bg_color?: string;
  title_color?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface AlertSettings {
  alert_type?: "info" | "success" | "warning" | "danger";
  alert_title?: string;
  alert_description?: string;
  show_dismiss_button?: string;
  background_color?: string;
  border_color?: string;
  alert_title_color?: string;
  alert_description_color?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface SocialIconsSettings {
  social_icon_list?: Array<{
    social_icon: { value: string; library: string };
    link: { url: string; is_external: string };
  }>;
  shape?: "rounded" | "square" | "circle";
  columns?: string;
  align?: "left" | "center" | "right";
  icon_size?: ElementorSize;
  icon_spacing?: ElementorSize;
  icon_color?: "default" | "custom";
  icon_primary_color?: string;
  icon_secondary_color?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface GoogleMapsSettings {
  address?: string;
  zoom?: ElementorSize;
  height?: ElementorSize;
  _element_width?: string;
  [key: string]: unknown;
}

// ── Pro Widget Settings ──────────────────────────────────────────────────────

export interface FlipBoxSettings {
  border_radius?: ElementorBorderRadius;
  flip_effect?: "flip" | "slide" | "push" | "zoom-in" | "zoom-out" | "fade";
  flip_direction?: "left" | "right" | "up" | "down";
  front_title_text?: string;
  front_description_text?: string;
  front_background_color?: string;
  front_title_color?: string;
  front_description_color?: string;
  back_title_text?: string;
  back_description_text?: string;
  back_background_color?: string;
  back_title_color?: string;
  back_description_color?: string;
  height?: ElementorSize;
  _element_width?: string;
  [key: string]: unknown;
}

export interface CallToActionSettings {
  title?: string;
  description?: string;
  button?: string;
  link?: { url: string; is_external: string };
  layout?: "classic" | "cover" | "image";
  align?: "left" | "center" | "right";
  _element_width?: string;
  [key: string]: unknown;
}

export interface PriceTableSettings {
  header_title_color?: string;
  header_price_color?: string;
  header_background_color?: string;
  header_title?: string;
  header_description?: string;
  price?: string;
  currency_symbol?: string;
  period?: string;
  features_list?: Array<{ item_text: string; item_icon: { value: string; library: string } }>;
  button_text?: string;
  button_link?: { url: string };
  button_background_color?: string;
  button_color?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface TestimonialSettings extends ElementorTypography {
  testimonial_content?: string;
  testimonial_image?: { url: string; id: number };
  testimonial_name?: string;
  testimonial_job?: string;
  testimonial_alignment?: "left" | "center" | "right";
  content_color?: string;
  name_color?: string;
  job_color?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface TabsSettings {
  tabs?: Array<{
    tab_title: string;
    tab_content: string;
  }>;
  type?: "horizontal" | "vertical";
  tab_active_color?: string;
  tab_color?: string;
  tab_active_background_color?: string;
  tab_background_color?: string;
  content_color?: string;
  _element_width?: string;
  [key: string]: unknown;
}

export interface AccordionSettings {
  tabs?: Array<{
    tab_title: string;
    tab_content: string;
  }>;
  icon?: { value: string; library: string };
  icon_active?: { value: string; library: string };
  item_spacing?: ElementorSize;
  title_color?: string;
  title_active_color?: string;
  content_color?: string;
  border_color?: string;
  _element_width?: string;
  [key: string]: unknown;
}

// ── Widget Type Union ────────────────────────────────────────────────────────

export type WidgetType =
  | "heading"
  | "text-editor"
  | "button"
  | "image"
  | "icon"
  | "icon-box"
  | "image-box"
  | "divider"
  | "spacer"
  | "video"
  | "star-rating"
  | "counter"
  | "progress"
  | "alert"
  | "social-icons"
  | "google_maps"
  | "testimonial"
  | "testimonial-carousel"
  | "tabs"
  | "accordion"
  | "flip-box"
  | "call-to-action"
  | "price-table"
  | "image-carousel";

export type WidgetSettings =
  | HeadingSettings
  | TextEditorSettings
  | ButtonSettings
  | ImageSettings
  | IconSettings
  | IconBoxSettings
  | ImageBoxSettings
  | DividerSettings
  | SpacerSettings
  | VideoSettings
  | StarRatingSettings
  | CounterSettings
  | ProgressBarSettings
  | AlertSettings
  | SocialIconsSettings
  | GoogleMapsSettings
  | TestimonialSettings
  | TabsSettings
  | AccordionSettings
  | FlipBoxSettings
  | CallToActionSettings
  | PriceTableSettings
  | { [key: string]: unknown };

// ── Core Element Types ───────────────────────────────────────────────────────

export interface ElementorWidget {
  id: string;
  elType: "widget";
  widgetType: WidgetType | string;
  settings: WidgetSettings;
  elements: [];
}

export interface ElementorContainer {
  id: string;
  elType: "container";
  settings: ElementorContainerSettings;
  elements: ElementorElement[];
}

export type ElementorElement = ElementorContainer | ElementorWidget;

// ── Template Root ────────────────────────────────────────────────────────────

export interface FlaggedItem {
  node_id: string;
  node_name: string;
  category: "layout" | "visual-effect" | "typography" | "animation" | "asset" | "component";
  reason: string;
  nearest_native: string;
  action: "manual-review" | "export-asset";
}

export interface GlobalColor {
  _id: string;
  title: string;
  color: string;
}

export interface GlobalFont {
  _id: string;
  title: string;
  typography_typography: "custom";
  typography_font_family: string;
  typography_font_size?: ElementorSize;
  typography_font_weight?: string;
}

export interface ElementorTemplate {
  version: "0.4";
  title: string;
  type: "page" | "section" | "container";
  content: ElementorElement[];
  page_settings: {
    margin?: ElementorSpacing;
    padding?: ElementorSpacing;
    custom_css?: "";
  };
  metadata: {
    generated_by: "Figma2ElementorNative";
    plugin_version: "1.0.0";
    figma_file_key: string;
    figma_node_id: string;
    figma_node_name: string;
    exported_at: string;
    global_colors: GlobalColor[];
    global_fonts: GlobalFont[];
    flagged_items: FlaggedItem[];
    fidelity_score: number;
    asset_manifest: AssetManifest[];
  };
}

export interface AssetManifest {
  node_id: string;
  node_name: string;
  filename: string;
  format: "PNG" | "WEBP" | "SVG";
  placeholder_url: string;
}
