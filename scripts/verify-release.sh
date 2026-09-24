#!/usr/bin/env bash

set -euo pipefail

npm ci
npm run build
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run text-layout-data:verify
npm run fixtures:verify
npm run scene-kernel-fixture:verify
npm run schema-conformance:verify
npm run identity:verify
npm run examples:verify
npm run licenses:verify
npm audit --audit-level=low
npm run pack:core:dry-run
npm run test:package-consumer
