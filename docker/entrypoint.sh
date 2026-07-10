#!/bin/sh
set -e

ROLE="${AIDOS_PROCESS_ROLE:-web}"
INSTRUCTIONS_ROOT="${AGENT_INSTRUCTIONS_ROOT:-/data/agent-instructions}"

# Coolify/host volumes mount as root — ensure nextjs (uid 1001) can write agent bundles.
fix_instructions_volume_permissions() {
  mkdir -p "$INSTRUCTIONS_ROOT"
  chown -R nextjs:nodejs "$INSTRUCTIONS_ROOT"
}

case "$ROLE" in
  web)
    if [ -z "$DATABASE_URL" ]; then
      echo "ERROR: DATABASE_URL is not set."
      exit 1
    fi

    if [ ! -f /app/prisma.config.ts ]; then
      echo "ERROR: /app/prisma.config.ts is missing from the image. Rebuild the Docker image."
      exit 1
    fi

    fix_instructions_volume_permissions

    echo "Running database migrations..."
    su-exec nextjs npx prisma migrate deploy

    echo "Starting web (Next.js)..."
    exec su-exec nextjs node server.js
    ;;

  worker)
    if [ -z "$PLATFORM_WORKER_SECRET" ] && [ -z "$DATABASE_URL" ]; then
      echo "ERROR: DATABASE_URL or PLATFORM_WORKER_SECRET is required for worker role."
      exit 1
    fi

    if [ -z "$PLATFORM_WORKER_SECRET" ]; then
      echo "WARN: PLATFORM_WORKER_SECRET is not set — legacy HTTP worker fallback unavailable."
    fi

    echo "Starting agent worker (role=worker)..."
    exec su-exec nextjs npx tsx /app/scripts/agent-worker-loop.ts
    ;;

  *)
    echo "ERROR: Unknown AIDOS_PROCESS_ROLE=$ROLE (use 'web' or 'worker')"
    exit 1
    ;;
esac
