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
- Asset-ingestion services must scan, decode, normalize, and verify files before
  providing bytes to Core. Core independently checks hash and image magic bytes.
- Rendering workers must run without network access, with filesystem and resource
  limits, and with only approved fonts/assets.
- Optional LLM adapters may propose a design document. Their output is untrusted
  data and receives exactly the same validation as any other caller.
- Glyphkiln Cloud may orchestrate workers but is not trusted by, imported into,
  or required by Core.

Core generates SVG itself and rejects active/external output. It does not accept
uploaded SVG in `1.0.0`; PNG and JPEG are the only asset MIME types. Core never
executes arbitrary JavaScript, model-generated code, or template expressions.

Denial-of-service limits in the schema cap text, layers, assets, chart points,
and canvas dimensions. Production workers should additionally enforce CPU,
memory, input-byte, and wall-clock limits.
