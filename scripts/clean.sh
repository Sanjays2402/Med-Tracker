#!/usr/bin/env bash
find . -name node_modules -type d -prune -exec rm -rf {} +
rm -rf .turbo .next dist build coverage
