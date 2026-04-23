#!/usr/bin/env bash
# Security benchmark: RAG suite only (no GPT, no baseline OpenCode).
#
# Set credentials before running, e.g. in this file or in your shell:
#   export PINECONE_API_KEY="your-key"
#   export PINECONE_INDEX="your-index"
# Or for Qdrant: pass `qdrant` as the second argument and set QDRANT_URL (and optional QDRANT_API_KEY).
#
# Usage:
#   ./benchmark/run-rag-only.sh [path-to-target-list] [pinecone|qdrant|lexical]
#
# Optional env:
#   CONTROLS   — path to security_controls.json (default: repo data/security_controls.json)
#   OUT        — benchmark output base dir (default: outputs/benchmarks)
#   TOPK       — retrieved controls count (default: 5)
#   MODEL      — provider/model for RAG agent pass-through (--model)
#   AGENT      — agent name (--agent)
#   PROMPT     — extra prompt (--prompt)
#   MAXCHARS   — ingest cap (--maxchars)
#
# Or uncomment and paste values here:
# export PINECONE_API_KEY=""
# export PINECONE_INDEX=""

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIST="${1:-"$ROOT/benchmark/repos-50.txt"}"
VECTOR="${2:-pinecone}"
CONTROLS="${CONTROLS:-"$ROOT/data/security_controls.json"}"
OUT="${OUT:-"$ROOT/outputs/benchmarks_rag"}"
TOPK="${TOPK:-5}"

if [[ ! -f "$LIST" ]]; then
  echo "Missing list file: $LIST" >&2
  exit 1
fi

if [[ ! -f "$CONTROLS" ]]; then
  echo "Missing controls file: $CONTROLS" >&2
  exit 1
fi

if [[ "$VECTOR" == "pinecone" ]]; then
  if [[ -z "${PINECONE_API_KEY:-}" || -z "${PINECONE_INDEX:-}" ]]; then
    echo "Pinecone RAG needs PINECONE_API_KEY and PINECONE_INDEX (see RUNNING.md)." >&2
    exit 1
  fi
fi

if [[ "$VECTOR" == "qdrant" ]]; then
  if [[ -z "${QDRANT_URL:-}" ]]; then
    echo "Qdrant RAG needs QDRANT_URL (optional QDRANT_API_KEY)." >&2
    exit 1
  fi
fi

cd "$ROOT/packages/opencode"

args=(
  bun run --conditions=browser ./src/index.ts benchmark
  --list "$LIST"
  --suite rag
  --vector "$VECTOR"
  --controls "$CONTROLS"
  --topk "$TOPK"
  --out "$OUT"
)

[[ -n "${MODEL:-}" ]] && args+=(--model "$MODEL")
[[ -n "${AGENT:-}" ]] && args+=(--agent "$AGENT")
[[ -n "${PROMPT:-}" ]] && args+=(--prompt "$PROMPT")
[[ -n "${MAXCHARS:-}" ]] && args+=(--maxchars "$MAXCHARS")

exec "${args[@]}"
