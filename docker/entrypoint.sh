#!/bin/sh
set -e

ROLE="${AIDOS_PROCESS_ROLE:-web}"

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

    echo "Running database migrations..."
    npx prisma migrate deploy

    echo "Starting web (Next.js)..."
    exec node server.js
    ;;

  worker)
    if [ -z "$PLATFORM_WORKER_SECRET" ]; then
      echo "ERROR: PLATFORM_WORKER_SECRET is not set (required for worker role)."
      exit 1
    fi

    echo "Starting agent worker loop (role=worker)..."
    exec node /app/scripts/agent-worker-loop.mjs
    ;;

  *)
    echo "ERROR: Unknown AIDOS_PROCESS_ROLE=$ROLE (use 'web' or 'worker')"
    exit 1
    ;;
esac
