#!/usr/bin/env bash
# Prints shell exports for Connexus GitHub token + repo list.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsx scripts/connexus-github-env.ts
