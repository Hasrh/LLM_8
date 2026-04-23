#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIST="${1:-"$ROOT/benchmark/repos.txt"}"
# RAG backend: default pinecone per RUNNING.md (PINECONE_API_KEY + PINECONE_INDEX). Override: qdrant | lexical
VECTOR="${2:-pinecone}"

if [[ ! -f "$LIST" ]]; then
  echo "Missing list file: $LIST" >&2
  exit 1
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY is required for the GPT suite." >&2
  exit 1
fi

if [[ "$VECTOR" == "pinecone" ]]; then
  if [[ -z "${PINECONE_API_KEY:-}" || -z "${PINECONE_INDEX:-}" ]]; then
    echo "RAG with Pinecone needs PINECONE_API_KEY and PINECONE_INDEX (see RUNNING.md)." >&2
    exit 1
  fi
fi

if [[ "$VECTOR" == "qdrant" ]]; then
  if [[ -z "${QDRANT_URL:-}" ]]; then
    echo "RAG with Qdrant needs QDRANT_URL (optional QDRANT_API_KEY)." >&2
    exit 1
  fi
fi

cd "$ROOT/packages/opencode"

bun run --conditions=browser ./src/index.ts benchmark \
  --list "$LIST" \
  --suite gpt \
  --suite opencode \
  --suite rag \
  --vector "$VECTOR" \
  --controls "$ROOT/data/security_controls.json" \
  --gpt-model openai/gpt-5.4-mini \
  --out "$ROOT/outputs/benchmarks"
