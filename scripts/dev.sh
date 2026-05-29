#!/usr/bin/env bash
set -euo pipefail
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
