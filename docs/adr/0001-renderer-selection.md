# ADR 0001: Renderer selection

Status: accepted

## Context

Core needs deterministic SVG and PNG from constrained semantic documents, with
an auditable security surface and no browser service.

## Options considered

Direct SVG generation, Satori with Resvg, Skia Canvas, headless browser
rendering, and Node Canvas.

## Decision

Use a small renderer-neutral scene, serialize SVG directly, and rasterize the
same SVG through pinned Resvg.

## Rationale

It keeps vector output first-class, avoids CSS/browser variability, makes active
content easy to prohibit, and shares one geometry/layout result across formats.

## Tradeoffs

Core owns typography, wrapping, and scene serialization. The visual vocabulary
is narrower than browsers or Skia, which is desirable for the first constrained
templates but limits freeform composition.

## Migration path

Preserve the document, template, scene, and manifest contracts. A future
Satori/Skia adapter can consume scene data or replace only the serialization
boundary under a new renderer version and reviewed baselines.
