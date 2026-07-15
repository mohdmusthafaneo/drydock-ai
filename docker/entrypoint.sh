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
    su-exec nextjs npx prisma migrate deploy

    echo "Starting web (Next.js)..."
    exec su-exec nextjs node server.js
    ;;

  worker)
    if [ -z "$DATABASE_URL" ]; then
      echo "ERROR: DATABASE_URL is required for worker role (pg-boss job consumers)."
      exit 1
    fi

    echo "Starting platform worker (role=worker, pg-boss)..."
    exec su-exec nextjs npx tsx /app/scripts/agent-worker-loop.ts
    ;;

  *)
    echo "ERROR: Unknown AIDOS_PROCESS_ROLE=$ROLE (use 'web' or 'worker')"
    exit 1
    ;;
esac
