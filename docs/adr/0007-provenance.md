# ADR 0007: Provenance strategy

Status: accepted

## Context

Consumers need reproducibility inputs, output verification, truthful asset
origins, and a precise non-generative rendering claim.

## Options considered

No manifest, document-only metadata, one request-level manifest, per-output JSON
manifests, and immediate C2PA signing.

## Decision

Return a versioned JSON manifest for each SVG or PNG output. Record the canonical
fingerprint and output hash separately. Defer signing/C2PA.

## Rationale

Per-output records describe exact bytes and methods, remain portable, and do not
pretend unsigned metadata is an authenticity proof. Asset origins pass through
without being erased.

## Tradeoffs

JSON can be detached or modified and the creation timestamp prevents whole-file
manifest equality. Verification must check the output hash; trust requires a
future signature outside Core.

## Migration path

Add a new manifest version and optional signing adapter. C2PA assertions can
embed or reference the existing fields while key custody stays with a trusted
worker/service.
