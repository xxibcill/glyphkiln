# ADR 0003: Seeded randomness

Status: accepted

## Context

Procedural algorithms need portable deterministic randomness from human-readable
string seeds and stable published vectors.

## Options considered

Mulberry32, PCG32, xoshiro128**, cryptographic counter-mode generation, and a
dependency on a general random library.

## Decision

Use xoshiro128** with four state words derived from the first 128 bits of the
UTF-8 seed's SHA-256 digest. Version it as
`xoshiro128**/sha256-seed-v1`.

## Rationale

It is compact, fast, deterministic with explicit 32-bit operations, has adequate
quality for visual sampling, and SHA-256 avoids weak string-seed expansion.

## Tradeoffs

It is not cryptographically secure and changing any seed-expansion detail
changes all outputs. JavaScript integer behavior must remain explicitly
unsigned.

## Migration path

Never modify version 1 in place. Add a new named algorithm/version, publish new
vectors, and let a new template or background version opt in.
