# Glyphkiln App

Glyphkiln App is the self-hostable application workspace for Glyphkiln. This
foundation uses the Next.js App Router and reads template metadata from the
documented `@glyphkiln/core/schema` export.

From the monorepo root:

```bash
npm run dev
```

For a production build:

```bash
npm run build
npm start
```

The build packages Next.js static assets into the standalone output. To deploy
only that output, preserve the complete
`apps/glyphkiln-app/.next/standalone` directory and run
`node apps/glyphkiln-app/server.js` from its root.

The current workspace intentionally contains only the application shell.
Authentication, persistence, uploads, API, and render workers remain separate
milestones in the [implementation plan](../../docs/full-implementation-plan.md).
