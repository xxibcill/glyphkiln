# ADR 0004: Template versioning

Status: accepted

## Context

Constrained compositions must remain reproducible while the product learns what
good business graphics require.

## Options considered

A generic data-driven template language, a user-scripted template API, mutable
latest-only functions, and explicit immutable versioned functions.

## Decision

Use an explicit function and registry entry for every stable template version.
Documents name exact template IDs and semantic versions.

## Rationale

Concrete functions make layout review, testing, security, and version ownership
clear. They avoid prematurely building a language and prevent user code
execution.

## Tradeoffs

Some helper-level repetition remains, and old supported versions consume source
and test maintenance.

## Migration path

Add a new function/version alongside the old version. An explicit document
migration may opt into it; rendering never silently upgrades a document.
