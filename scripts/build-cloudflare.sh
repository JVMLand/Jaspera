#!/usr/bin/env bash
set -euo pipefail
# Compatibility entry point for the configured Cloudflare build command.
exec pnpm exec tsx scripts/build-cloudflare.ts
