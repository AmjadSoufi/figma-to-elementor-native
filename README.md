# Figma to Elementor Native Converter

A high-fidelity Figma plugin that converts Figma designs directly into Elementor (WordPress) native JSON templates.

## Features

- **Pixel-Perfect Fidelity:** Accurate mapping of Figma auto-layout (Fill, Hug, Fixed) to Elementor flex containers.
- **Responsive Widths:** Automatically calculates percentage-based widths for grid items.
- **Smart Layout Inference:** Detects rows and grids even in non-auto-layout Figma frames.
- **Gradient Support:** Converts Figma linear and radial gradients to Elementor background settings.
- **Global Styles:** (Coming soon) Support for Elementor Global Colors and Fonts.
- **Asset Export:** Exports images and backgrounds directly for use in WordPress.

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Load the `manifest.json` in Figma (Plugins -> Development -> Import plugin from manifest)

## Technology Stack

- TypeScript
- Webpack
- Figma Plugin API
- Elementor Template Schema
