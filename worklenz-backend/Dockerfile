# --- Stage 1: Build ---
FROM node:22-slim AS builder

ARG RELEASE_VERSION
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN echo "$RELEASE_VERSION" > release

# --- Stage 2: Production Image ---
FROM node:22-slim

RUN apt-get update && apt-get install -y libpq5 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/build ./build
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/release ./release
COPY --from=builder --chown=node:node /usr/src/app/worklenz-email-templates ./worklenz-email-templates
COPY --from=builder --chown=node:node /usr/src/app/database/pg-migrations ./database/pg-migrations
COPY --from=builder --chown=node:node /usr/src/app/scripts/migrate.js ./scripts/migrate.js

RUN chown node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/public/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "build/bin/www"]
