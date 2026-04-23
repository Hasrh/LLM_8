# Security Benchmark Scripts

This folder provides thin wrappers around `opencode benchmark`.

## 1) Prepare target list

Edit `benchmark/repos.txt` with one local repository path per line.

## 2) Set OpenRouter key for raw GPT suite

```bash
export OPENROUTER_API_KEY="..."
```

## 3) Run GPT + raw OpenCode only

```bash
./benchmark/run-gpt-opencode.sh
```

## 4) Run all suites (GPT + OpenCode + RAG)

```bash
./benchmark/run-all.sh
```

To force a specific RAG backend:

```bash
./benchmark/run-all.sh ./benchmark/repos.txt pinecone
```

Outputs are written to `outputs/benchmarks/<timestamp>/`:

- `results.json`
- `summary.md`
- plus per-run artifacts under mode-specific run directories
