#!/usr/bin/env bash
rm -f packages/db/prisma/dev.db
pnpm db:migrate
pnpm db:seed
