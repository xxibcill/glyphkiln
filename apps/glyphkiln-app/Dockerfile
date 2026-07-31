# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/glyphkiln-app/package.json apps/glyphkiln-app/package.json
COPY packages/glyphkiln-core/package.json packages/glyphkiln-core/package.json
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
WORKDIR /opt/glyphkiln/apps/glyphkiln-app
RUN mkdir -p /var/lib/glyphkiln /tmp/glyphkiln \
    && chown -R node:node /var/lib/glyphkiln /tmp/glyphkiln /opt/glyphkiln
COPY --from=build --chown=node:node \
  /workspace/apps/glyphkiln-app/.next/standalone/ \
  /opt/glyphkiln/
USER node
EXPOSE 3000
CMD ["node", "start.mjs"]
