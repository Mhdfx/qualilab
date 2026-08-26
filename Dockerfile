# Qualilab LIMS — production image.
#
# Three stages so the final image carries only what runs: the standalone
# server, the static assets, the generated Prisma client, and a Chromium for
# the PDF rendering. No sources, no devDependencies.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, which needs the schema present.
# (src/generated is gitignored build output — generate recreates it.)
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build needs no real database: pages are dynamic and query at runtime.
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

# Chromium renders the reports, invoices and bench sheets.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

# The standalone output bundles the server and its node_modules subset.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migrations are applied at start-up (see docker-compose command).
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
# prisma.config.ts imports dotenv/config; the standalone bundle doesn't
# carry dotenv, and `migrate deploy` at boot dies without it.
COPY --from=build /app/node_modules/dotenv ./node_modules/dotenv

# Run as a non-root user: the container serves health data.
RUN useradd --system --create-home qualilab
USER qualilab

EXPOSE 3000
CMD ["node", "server.js"]
