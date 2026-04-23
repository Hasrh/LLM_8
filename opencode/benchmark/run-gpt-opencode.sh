#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIST="${1:-"$ROOT/benchmark/repos.txt"}"

if [[ ! -f "$LIST" ]]; then
  echo "Missing list file: $LIST" >&2
  exit 1
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY is required for GPT suite." >&2
  exit 1
fi

cd "$ROOT/packages/opencode"

bun run --conditions=browser ./src/index.ts benchmark \
  --list "$LIST" \
  --suite gpt \
  --suite opencode \
  --gpt-model openrouter/openai/gpt-5.4-mini \
  --out "$ROOT/outputs/benchmarks"
