#!/usr/bin/env bash
# OpenCode agentic baseline only (no GPT, no RAG). Same targets as GPT bench when using targets-50.txt.
#
# Usage:
#   ./benchmark/run-opencode-baseline-only.sh [path-to-target-list]
#
# Optional env: OUT, MODEL, AGENT, PROMPT, MAXCHARS, FAILFAST (same pattern as run-rag-only.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIST="${1:-"$ROOT/benchmark/targets-50.txt"}"
OUT="${OUT:-"$ROOT/outputs/benchmarks"}"

if [[ ! -f "$LIST" ]]; then
  echo "Missing list file: $LIST" >&2
  exit 1
fi

cd "$ROOT/packages/opencode"

args=(
  bun run --conditions=browser ./src/index.ts benchmark
  --list "$LIST"
  --suite opencode
  --out "$OUT"
)

[[ -n "${MODEL:-}" ]] && args+=(--model "$MODEL")
[[ -n "${AGENT:-}" ]] && args+=(--agent "$AGENT")
[[ -n "${PROMPT:-}" ]] && args+=(--prompt "$PROMPT")
[[ -n "${MAXCHARS:-}" ]] && args+=(--maxchars "$MAXCHARS")
[[ "${FAILFAST:-}" == "1" ]] && args+=(--failfast)

exec "${args[@]}"
