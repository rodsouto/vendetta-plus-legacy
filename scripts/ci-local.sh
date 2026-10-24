#!/usr/bin/env bash
# Runs the CI steps of .github/workflows/ci.yml on a fresh clone of the current commit, so uncommitted
# files and local build caches cannot hide a failure. Usage: scripts/ci-local.sh [git-ref]
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
ref="${1:-HEAD}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

git clone --quiet "$repo" "$work"
cd "$work"
git checkout --quiet "$(git -C "$repo" rev-parse "$ref")"

step() { printf '\n== %s\n' "$1"; }

step "install"
pnpm install --frozen-lockfile

step "generated files are up to date"
pnpm codegen
git diff --exit-code -- packages/spec-data/generated packages/rules/generated contracts/src/generated apps/web/src/chain/abi.ts

step "format"
pnpm format:check
forge fmt --check --root contracts

step "tests (rules engine, contracts)"
pnpm -r test

step "web build"
pnpm --filter @vendetta/web build

step "indexer build"
pnpm --filter @vendetta/indexer build

step "end-to-end (local chain + app)"
pnpm --filter @vendetta/web e2e

step "end-to-end with passkeys (local 4337 stack)"
pnpm --filter @vendetta/web e2e:aa

printf '\nCI passed for %s\n' "$(git rev-parse --short HEAD)"
