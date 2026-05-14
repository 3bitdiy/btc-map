# SVG Map Migration Plan

This project is migrating from MapLibre/PMTiles to a custom SVG-based interactive map.

## Goal

Keep the current UX logic (filters, detail panel, i18n, colony data flow), and replace only the map rendering layer.

## Phase 1: Placeholder SVG foundation (implemented now)

1. Replace MapLibre container with an inline SVG scene.
2. Add a dedicated marker layer on top of SVG.
3. Render colony markers from the existing `public/data/colonies.json` data.
4. Keep all existing filter and detail-panel behavior.
5. Keep marker positions generated from existing longitude/latitude fields using a simple bounding-box projection.

Outcome: fast migration without waiting for final design files.

## Phase 2: Design asset integration

1. Swap placeholder SVG with final design SVG export.
2. Replace placeholder marker SVG with final marker icon set.
3. Add a per-colony anchor mapping (`colony_id -> x/y`) in SVG coordinates.
4. Fine-tune hit zones, hover states, and label layers.

Outcome: visual parity with Figma while keeping stable app logic.

## Phase 3: Interaction polish

1. Add smooth pan/zoom only if needed for UX.
2. Add keyboard focus states and accessibility labels for all markers.
3. Add marker clustering or overlap handling if data grows.
4. Optional deep links (`?colony=<id>`) for direct panel opening.

Outcome: production-ready interaction quality.

## Required files for final swap

1. Final map SVG (cleaned and optimized).
2. Final marker SVG icons (default/hover/active/inactive states).
3. Optional font files if custom fonts are required.
4. Optional anchor map JSON for precise marker placement.

## Notes

- Figma CSS layer export is a visual reference only, not a direct implementation source.
- Existing panel/filter/i18n logic should remain in place to reduce migration risk.
