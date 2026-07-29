# ADR 0002: Schema validation

Status: accepted

## Context

External applications and optional LLM adapters will submit untrusted structured
documents. Core needs static types, strict runtime validation, unions, useful
paths, and JSON Schema for forms/structured output.

## Options considered

Zod 4, TypeBox plus an Ajv validator, JSON Schema authored by hand, and Valibot.

## Decision

Author strict Zod 4 schemas and export draft 2020-12 JSON Schema using Zod's
built-in converter.

## Rationale

Zod provides a mature TypeScript inference model, discriminated unions,
refinements, actionable issues, strict objects, and direct JSON Schema without a
second validation dependency.

## Tradeoffs

Generated JSON Schema can reflect only representable refinements, and schema
authoring is library-specific. TypeBox would make JSON Schema primary but would
require a separate validation/error stack.

## Migration path

Treat exported JSON Schema and validation fixtures as compatibility tests.
Another validator can replace Zod behind the same public functions if it accepts
and rejects the same documents and preserves useful problem paths.
