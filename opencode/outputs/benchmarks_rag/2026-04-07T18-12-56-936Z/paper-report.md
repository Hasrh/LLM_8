# OpenCode security audit benchmark — RAG and baselines (technical report)

## Order
① OpenCode + RAG · ② GPT direct · ③ OpenCode baseline

## Key
- GPT mean **0.905** = mean fraction of checks passed on **[0,1]**, not "94% accuracy".
- RAG: five checks + large clipped inputs; GPT: four checks + one small file + different model.

## Shared-four means
| Config | Mean | All 4 pass |
| --- | --- | --- |
| ① RAG | 0.725 | 24.0% |
| ② GPT | 0.905 | 62.0% |


Full PDF: `paper-report.pdf` in run dir.
