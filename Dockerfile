# Qualilab LIMS — production image.
#
# Three stages so the final image carries only what runs: the standalone
# server, the static assets, the generated Prisma client, and a Chromium for
# the PDF rendering. No sources, no devDependencies.

FROM node:22-slim AS deps
WORKDIR /app
# OpenSSL here too, not only in `build` below: `npm ci` downloads Prisma's
# schema engine for the platform it detects (debian-openssl-3.0.x with the
# binary, the openssl-1.1.x default without). The `migrate` service runs
# from `build`, which detects 3.0.x once OpenSSL is there: an engine fetched
# here without it would be the wrong one, and `migrate deploy` would try to
# download the right one from binaries.prisma.sh at every deploy (refused
# offline — rehearsed 23/10 in node:22-slim with --network none).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema present.
# (src/generated is gitignored build output — generate recreates it.)
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
# Prisma reads the OpenSSL version to name its platform — in `prisma
# generate` and `next build` here, and in `migrate deploy` (the compose
# `migrate` service runs from this stage). Without the binary it printed
# « prisma:warn Prisma failed to detect the libssl/openssl version »
# (harmless, DEPLOY.md « Lot 2 du 16/10 »); installed so the deploy logs
# carry no warning — with the same line in `deps`, so that the engine `npm
# ci` fetched is the one detected here. The runtime image is unchanged (the
# app queries through the driver adapter, no native engine).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build needs no real database: pages are dynamic and query at runtime.
# But page-data collection IMPORTS the route modules, and prisma.ts /
# auth-server.ts read these env vars at import time — without values the
# build dies on "Failed to collect page data". Placeholders only: nothing
# connects during build, and the runtime container provides the real values.
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
ENV AUTH_SECRET="build-placeholder-not-a-secret"
ENV BETTER_AUTH_URL="http://localhost:3000"
ENV BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:3000"
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined into the client bundle AT BUILD TIME, so
# the demo-accounts panel is controlled here (via compose build args), not by
# runtime env. Rebuild after changing it in .env.
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Laboratory wall clock (compose can override with TZ).
ENV TZ=Africa/Casablanca

# Chromium renders the reports, invoices and bench sheets.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

# The standalone output bundles the server and its node_modules subset.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migrations run from the build stage (compose `migrate` service) — these
# prisma copies remain for ad-hoc CLI use but the boot path no longer needs
# them.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
# prisma.config.ts imports dotenv/config; the standalone bundle doesn't
# carry dotenv, and `migrate deploy` at boot dies without it.
COPY --from=build /app/node_modules/dotenv ./node_modules/dotenv
# Next's file tracing prunes playwright-core's non-required assets
# (browsers.json), which its runtime reads — PDF rendering 500s without the
# complete package.
COPY --from=build /app/node_modules/playwright-core ./node_modules/playwright-core

# Run as a non-root user: the container serves health data.
RUN useradd --system --create-home qualilab
USER qualilab

EXPOSE 3000
CMD ["node", "server.js"]
