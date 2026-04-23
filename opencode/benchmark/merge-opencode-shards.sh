#!/usr/bin/env bash
# Merge OpenCode baseline rows from parallel 2026-04-06 benchmark shards into
# outputs/benchmarks/merged-opencode-bench50.json (for render-benchmark-pdf.ts).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bun "$ROOT/benchmark/merge-opencode-shards.ts"
