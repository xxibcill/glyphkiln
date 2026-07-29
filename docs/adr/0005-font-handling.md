# ADR 0005: Font handling

Status: accepted

## Context

System font discovery and silent fallback make measurement and pixels platform
dependent. Font licensing also belongs to the caller.

## Options considered

System fonts, browser fallback stacks, path-based fonts named by the document,
caller-supplied bytes, and converting all text to paths.

## Decision

Require explicit family/weight/style declarations and verify caller-supplied
bytes by SHA-256. Bundle open-source Inter for development. Measure with fontkit,
and disable system fonts in Resvg.

## Rationale

Bytes make identity portable and content-addressable. The same verified source
feeds measurement and rasterization, while documents cannot choose filesystem
paths.

## Tradeoffs

Font bytes use memory and temporary files during PNG rendering. Core does not
yet subset fonts, report glyph coverage, or expose advanced shaping features.

## Migration path

Add a font-loader abstraction or subset cache without changing document
declarations. Any measurement/shaping pixel change requires a renderer-version
bump and baseline review.
