# Glyphkiln Core

Glyphkiln Core is the open-source deterministic rendering engine for
professional social-media graphics.

> Composed without generative image models and rendered deterministically from
> code; included asset origins are reported separately.

It accepts an untrusted, versioned design document; validates it strictly; lays
it out with an explicit font; renders safe SVG or PNG; and emits a provenance
manifest. It does not execute user code, fetch remote assets, call an LLM, or
depend on Glyphkiln Cloud.

## Status

This repository is a production-quality vertical slice (`0.2.0`).
Schema and templates are versioned, but the package itself is pre-1.0 and may
make documented breaking changes.

Core detects known bidi controls, strong right-to-left text, and
vertical-primary text that its LTR-horizontal layout cannot faithfully render.
The policy is pinned as `unicode-17.0.0/ltr-horizontal-v1`; unsupported visible
copy is rejected before asset or font resolution.

Supported templates:

- `product-announcement@1.1.1`
- `statistic-card@1.1.0`
- `quote-card@1.1.0`
- `article-cover@1.1.0`

Supported procedural styles:

- `flow-field@1.1.0`
- `layered-waves@1.1.0`
- `topographic-contours@1.1.0`
- `recursive-subdivision@1.1.0`

## Develop

Node.js 22.11 or newer is required.

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run text-layout-data:verify
npm run fixtures:verify
npm run examples:verify
npm run licenses:verify
npm run test:package-consumer
```

The included Inter variable font is open source under the SIL Open Font License.
It makes local examples reproducible without proprietary fonts.

## SDK

```ts
import { readFile } from "node:fs/promises";

import {
  analyzeTextLayoutSupport,
  inspectDesignDocument,
  renderGraphic,
  validateDesignDocument,
} from "@glyphkiln/core";

const input: unknown = JSON.parse(
  await readFile(new URL("./design.json", import.meta.url), "utf8"),
);
const validation = validateDesignDocument(input);
if (!validation.success) {
  throw new Error(JSON.stringify(validation.problems));
}

const headline = validation.data.layers.find((layer) => layer.type === "headline");
if (headline?.type === "headline") {
  console.log(analyzeTextLayoutSupport(headline.text));
}

console.log(inspectDesignDocument(validation.data).textLayout);
const result = await renderGraphic(validation.data, { formats: ["svg", "png"] });
for (const output of result.outputs) {
  console.log(output.format, output.bytes, output.manifest);
}
```

Use `renderGraphicIsolated` for untrusted workloads. It runs the same API in a
permission-limited child process with a fixed memory ceiling, serialized
concurrency, and a 15-second maximum timeout.

`createDesignDocument` supplies schema version `1.0.0` and a stable content ID
when omitted. `renderGraphic` validates again at the trust boundary. Assets and
fonts are byte-oriented caller inputs; the renderer performs no network access.

`analyzeTextLayoutSupport` returns stable `BIDI_CONTROL_UNSUPPORTED`,
`BIDI_LAYOUT_UNSUPPORTED`, and `VERTICAL_LAYOUT_UNSUPPORTED` diagnostics with
bounded numeric evidence. `inspectDesignDocument` applies the same policy to
every rendered semantic text field, including hidden layers. Hidden copy is
reported but does not block rendering.

See [Design document](docs/design-document.md),
[SDK and architecture](docs/architecture.md), and
[Determinism contract](docs/determinism.md). Public input, asset, font, and
deployment bounds are documented in
[Resource limits and worker profile](docs/resource-limits.md).

## CLI

From a clone:

```bash
npm run build
node dist/cli/index.js validate examples/product-announcement.json
node dist/cli/index.js inspect examples/product-announcement.json
node dist/cli/index.js render examples/product-announcement.json \
  --format png \
  --output examples/generated/product-announcement.png \
  --manifest
node dist/cli/index.js render examples/product-announcement.json \
  --format svg \
  --output examples/generated/product-announcement.svg \
  --manifest
```

Run `npm link` once if you want the literal `glyphkiln` command while developing;
normal consumers receive it from package installation. `--verify
<fingerprint>` makes render verification fail when a result differs from an
expected canonical fingerprint. Expected validation and quality failures print
actionable messages and return a nonzero exit code without a stack trace.
Existing output is preserved unless `--force` is supplied. `--version` prints
the installed package version. `validate` remains structural; `inspect` returns
`textLayout.renderable` and its diagnostics; `render` rejects unsupported
visible text with `QUALITY_VALIDATION_FAILED`.

## Formats

| ID                   |  Dimensions |
| -------------------- | ----------: |
| `linkedin-landscape` |  1200 × 627 |
| `instagram-square`   | 1080 × 1080 |
| `instagram-portrait` | 1080 × 1350 |
| `instagram-story`    | 1080 × 1920 |
| `x-landscape`        |  1200 × 675 |
| `youtube-thumbnail`  |  1280 × 720 |

The X default is 16:9 at 1200 × 675: a practical current default that maps
cleanly to common high-resolution preview surfaces. Applications can add new
versioned registry entries without scattering dimensions through templates.

## Examples and baselines

Reviewed example designs and their tracked SVG/PNG outputs live in
[`examples/`](examples/). Exact reviewed PNG baselines, source
designs, and manifests live in [`tests/visual/baselines/`](tests/visual/baselines/).

```bash
npm run build
npm run examples:generate
npm run examples:verify
```

## Documentation

- [Architecture](docs/architecture.md)
- [Rendering lifecycle](docs/rendering-lifecycle.md)
- [Design-document specification](docs/design-document.md)
- [Resource limits and worker profile](docs/resource-limits.md)
- [Fonts](docs/fonts.md) and [assets](docs/assets.md)
- [Text-layout diagnostics](docs/text-layout-diagnostics.md)
- [Provenance](docs/provenance.md)
- [Validation and quality policy](docs/quality-policy.md)
- [Template authoring](docs/template-authoring.md)
- [Procedural backgrounds](docs/procedural-backgrounds.md)
- [Visual regression](docs/visual-regression.md)
- [Versioning](docs/versioning.md), [release process](docs/release-process.md)
- [Known limitations](docs/known-limitations.md), [roadmap](docs/roadmap.md)
- [Architecture decisions](docs/adr/README.md)

## License and contributions

Glyphkiln Core is licensed under Apache-2.0. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [SECURITY.md](SECURITY.md). Font files retain their separate OFL terms in
`assets/fonts/OFL.txt`. The generated production dependency inventory is
[`THIRD_PARTY_LICENSES.json`](THIRD_PARTY_LICENSES.json). Unicode 17.0.0 data
used by text-layout diagnostics retains the Unicode License v3 in
`vendor/unicode/LICENSE.txt`.
