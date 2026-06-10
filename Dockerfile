# ---- Dependencies Stage ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies, skip postinstall (prisma generate needs schema)
RUN npm ci --ignore-scripts

# ---- Builder Stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache libc6-compat python3 make g++

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set DATABASE_URL for prisma generate (Prisma 7+ uses prisma.config.ts)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"

# Generate Prisma client
RUN npx prisma generate

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN npm run build

# ---- Runner Stage ----
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime dependencies (su-exec drops root → nextjs after volume chown)
RUN apk add --no-cache --update nodejs su-exec

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma 7: migrate deploy reads DATABASE_URL from prisma.config.ts (not schema.prisma)
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Copy Prisma schema, migrations, and generated client (for migrate + runtime)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma

# Copy node_modules for runtime (prisma CLI + client needed for migrate)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Agent control plane runtime assets (LLM skills + instruction templates)
COPY --from=builder --chown=nextjs:nodejs /app/skills ./skills
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/agent-control-plane/onboarding-assets ./src/lib/agent-control-plane/onboarding-assets
COPY --from=builder --chown=nextjs:nodejs /app/scripts/agent-worker-loop.mjs ./scripts/agent-worker-loop.mjs

COPY --chmod=755 docker/entrypoint.sh /app/docker/entrypoint.sh

# Writable agent instructions (Coolify volume mount target)
RUN mkdir -p /data/agent-instructions && chown -R nextjs:nodejs /data

# Expose the port
EXPOSE 3000

# Start the application
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV AGENT_INSTRUCTIONS_ROOT="/data/agent-instructions"

# Entrypoint runs as root briefly to fix volume ownership, then su-exec nextjs
USER root

ENTRYPOINT ["/app/docker/entrypoint.sh"]
