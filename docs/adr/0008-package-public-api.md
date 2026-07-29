# ADR 0008: Package and public API structure

Status: accepted

## Context

The initial repository has one reusable engine and must be easy to clone,
publish, and consume from Glyphkiln App without premature package coordination.

## Options considered

A multi-package workspace for schema/renderer/CLI, one package exporting every
internal path, and one package with curated root/schema exports.

## Decision

Ship one ESM package, `@glyphkiln/core`, with a curated root API, a public
`./schema` subpath, and a `glyphkiln` binary.

## Rationale

The modules share a release and determinism contract today. A single package
minimizes install/build complexity while the export map prevents accidental
internal API commitments.

## Tradeoffs

Consumers install PNG native dependencies even for schema-only use, and browser
consumers cannot yet import the Node renderer wholesale.

## Migration path

When independent consumers justify it, extract schema or renderer packages using
compatibility re-exports from `@glyphkiln/core`; introduce a workspace only when
packages have distinct release or runtime needs.
