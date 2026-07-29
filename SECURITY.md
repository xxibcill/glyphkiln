# Security policy

## Reporting

Please report vulnerabilities privately through GitHub Security Advisories for
this repository. Do not include exploitable details in a public issue. Maintainers
will acknowledge a report within seven days and coordinate disclosure.

Only the latest released minor version is supported during the pre-1.0 phase.

## Trust boundaries

- `glyphkiln-core` validates untrusted structured documents and renders only
  built-in, versioned algorithms. It accepts already-resolved bytes and never
  fetches arbitrary URLs.
- `glyphkiln-app` will own uploads, access control, project persistence, and
  browser-facing request limits. It must not bypass Core validation.
- Asset-ingestion services must scan, fully decode, normalize, and verify files
  before providing bytes to Core. Core independently checks hashes, bounded
  PNG/JPEG structure, dimensions, bytes, and decoded-pixel counts.
- Rendering workers must apply `RENDER_WORKER_PROFILE` or stricter limits, run
  without network access, and receive only approved fonts/assets.
- Optional LLM adapters may propose a design document. Their output is untrusted
  data and receives exactly the same validation as any other caller.
- Glyphkiln Cloud may orchestrate workers but is not trusted by, imported into,
  or required by Core.

Core generates SVG itself and rejects active/external output. It does not accept
uploaded SVG in `1.0.0`; PNG and JPEG are the only asset MIME types. Core never
executes arbitrary JavaScript, model-generated code, or template expressions.

`RENDER_RESOURCE_LIMITS` bounds document/metadata bytes, depth and entries;
asset count, bytes, dimensions and decoded pixels; font count and bytes; and
requested outputs. The CLI performs a fixed-size input read. Production hosts
must additionally enforce the public worker profile's concurrency, memory,
network, and wall-clock limits because a library cannot sandbox its own process.
