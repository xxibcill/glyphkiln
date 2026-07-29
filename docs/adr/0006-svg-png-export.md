# ADR 0006: SVG and PNG export

Status: accepted

## Context

Both vector and raster outputs must share layout and be deterministic without
accepting active SVG content.

## Options considered

Separate SVG and Canvas renderers, browser screenshots, Node Canvas plus SVG
reconstruction, and SVG as the canonical intermediate rasterized by Resvg.

## Decision

Generate standalone SVG from owned scene primitives, run active-content checks,
and use `@resvg/resvg-js@2.6.2` for PNG.

## Rationale

One intermediate prevents layout drift. Resvg provides a practical pinned,
headless rasterizer and accepts explicit local font files with system loading
disabled.

## Tradeoffs

Exact PNG output remains sensitive to the native Resvg/platform build. Embedded
images are restricted to verified raster data URIs, and CSS/filters are
deliberately minimal.

## Migration path

Change the renderer configuration/version, produce side-by-side baselines, and
review a migration. A different rasterizer may consume the same generated SVG.
