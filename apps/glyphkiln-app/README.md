# Glyphkiln App

Glyphkiln App is the self-hostable application workspace for Glyphkiln. Its
first roadmap slice is a local, read-only project workshop:

```text
brand snapshot controls
→ structured DesignDocument
→ Core validation
→ isolated deterministic SVG + PNG render
→ output and manifest downloads
```

The interface exposes every current Core template, format, and procedural
style. It keeps the active design document, validation results, output
fingerprints, registered-font hash, asset origins, and manifest-backed
provenance visible around the preview.

From the monorepo root:

```bash
npm run dev
```

Development and the packaged launcher bind `127.0.0.1` by default because this
milestone has no authentication or remote rate controls. A self-hosting
operator must explicitly set `GLYPHKILN_HOSTNAME` (for example, `0.0.0.0`) only
behind their own trusted access boundary. Non-loopback browser access must use
HTTPS, normally through a trusted reverse proxy; Web Crypto is intentionally
required before the browser will request or accept a proof. Plain HTTP remains
supported only on the local machine through `localhost` or `127.0.0.1`.

For a production build:

```bash
npm run build
npm start
```

The local endpoint is `POST /api/preview`. It accepts only bounded
`application/json` design documents, validates them with Core, admits one
isolated render at a time, passes the registered Inter bytes explicitly, and
returns `Cache-Control: no-store`. It does not accept rendering code or fetch
remote resources. Before presenting a response as proof, the browser recomputes
the design-document and output SHA-256 values and checks that SVG and PNG share
the same manifest provenance.

The production build stages the minimum runtime files needed by Next.js
standalone output, including Core and its native Resvg dependency. Test the
artifact on the same operating-system and CPU target it will run on:

```bash
npm run test:standalone --workspace @glyphkiln/app
```

To deploy only that output, preserve the complete
`apps/glyphkiln-app/.next/standalone` directory and run
`node apps/glyphkiln-app/start.mjs` from its root.

This milestone deliberately has no authentication, persistence, uploads,
network asset resolution, prompt interpretation, database, queue, or cloud
orchestration. Those remain later trust boundaries in the
[implementation plan](../../docs/full-implementation-plan.md).
