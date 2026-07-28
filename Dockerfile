# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24-bookworm-slim

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# Keep the browser-runtime task graph in the dependency layer. Its heavy Office/Markdown graph
# changes far less often than the Nuxt app, so normal application edits should reuse this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY i18n ./i18n
COPY components.json nuxt.config.ts tailwind.config.ts tsconfig.json ./
COPY public ./public
COPY scripts ./scripts
COPY shared ./shared
COPY server ./server
COPY app ./app
RUN --mount=type=cache,id=codex-gateway-nuxt-build,target=/app/node_modules/.cache/nuxt,sharing=locked \
    --mount=type=cache,id=codex-gateway-turbo,target=/app/.turbo,sharing=locked \
    pnpm build

FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
