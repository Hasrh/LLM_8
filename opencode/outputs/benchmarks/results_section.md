## X. Results

### X.1 Experimental Run Summary

We executed the benchmark pipeline on a corpus of **50 cloned open-source repositories** under `samples/bench50/`. For runtime feasibility and consistent input formatting, each repository contributed one representative structured artifact (YAML/JSON/Dockerfile/Terraform where available), yielding **50 benchmark targets** listed in `benchmark/targets-50.txt`.

The following two systems were executed across all 50 targets:

1. **Direct GPT baseline**: `openrouter/openai/gpt-5.4-mini` (no agentic file workflow).
2. **Raw OpenCode baseline**: OpenCode default agent/model configuration, no retrieval.

RAG was not executed in this run because vector backend credentials were not configured in the environment at runtime.

### X.2 Quantitative Outcomes

Aggregate results from shard outputs (`outputs/benchmarks/2026-04-06T21-44-09-*`) are:

| System | Total Targets | Completed Runs | Failed Runs | Verification Passes | Mean Verification Score |
| --- | ---: | ---: | ---: | ---: | ---: |
| Direct GPT (`openrouter/openai/gpt-5.4-mini`) | 50 | 0 | 50 | 0 | N/A |
| Raw OpenCode (baseline) | 50 | 50 | 0 | 19 | 0.84 |

For failed GPT runs, the repeated error signature was:

- `No output generated. Check the stream for errors.`

### X.3 Baseline Quality Breakdown (OpenCode)

Across the 50 completed OpenCode baseline runs, verification sub-check pass rates were:

| Check | Pass Count | Pass Rate |
| --- | ---: | ---: |
| Structural completeness | 49/50 | 0.98 |
| Evidence grounding | 20/50 | 0.40 |
| Consistency | 50/50 | 1.00 |
| Empty/generic detection | 49/50 | 0.98 |

These results indicate that baseline OpenCode outputs were generally well-structured and internally consistent, but frequently lacked sufficiently explicit evidence fields.

### X.4 Interpretation

The direct GPT baseline was non-functional under the current benchmark execution path (0 successful outputs), while raw OpenCode produced stable outputs across all targets with moderate-to-strong aggregate verification quality (mean 0.84). Consequently, in this run the only valid cross-system numeric comparison is a **robustness contrast** (OpenCode operational vs. direct GPT non-operational), not a full quality ranking among three methods.

### X.5 Reproducibility Notes

- Repository corpus: `benchmark/repo-urls-50.txt`
- Resolved target artifacts: `benchmark/targets-50.txt`
- Aggregated stats snapshot: `outputs/benchmarks/aggregate-2026-04-06T21-44-09.json`
- Per-shard raw results: `outputs/benchmarks/2026-04-06T21-44-09-*/results.json`

To complete the originally planned three-way comparison (Direct GPT vs Raw OpenCode vs OpenCode+RAG), a follow-up run is required with vector backend configuration for the RAG suite.
