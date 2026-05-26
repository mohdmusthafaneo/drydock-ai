#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Configure it in Coolify (or docker-compose) before starting the app."
  exit 1
fi

if [ ! -f /app/prisma.config.ts ]; then
  echo "ERROR: /app/prisma.config.ts is missing from the image. Rebuild the Docker image."
  exit 1
fi

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec node server.js
