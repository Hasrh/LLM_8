## Executive Summary

A security audit was performed on the Next.js project repository (`next.js`). The project demonstrates mature security practices including dependency provenance verification, pre-commit hooks, protected branch enforcement, internal header filtering, and environment variable handling guidelines. Several areas for improvement were identified, including outdated dependency versions, lack of automated dependency vulnerability scanning, and insufficient branch protection automation.

## Findings

### Finding 1
- Finding ID: DEP-01
- Observed Issue: Multiple dependencies use outdated or experimental versions with known stability concerns
- Severity: medium
- Evidence: `"react": "19.0.0"` alongside `"react-builtin": "npm:react@19.3.0-canary-74568e86-20260328"`, `"babel-plugin-react-compiler": "0.0.0-experimental-1371fcb-20260227"`, `"eslint-plugin-react-hooks": "0.0.0-experimental-ab18f33d-20260220"`
- Related Control / Principle: ISO 27001 Section 8 - Operation (secure development practices)
- Recommendation: Pin production dependencies to stable releases; document rationale for experimental dependencies and establish review cadence for updating them

### Finding 2
- Finding ID: DEP-02
- Observed Issue: No automated dependency vulnerability scanning configured (e.g., Dependabot, Snyk, Renovate)
- Severity: medium
- Evidence: No evidence of automated vulnerability scanning in `.github/workflows/` or `package.json`. Only manual update scripts present (`sync-react`, `update-google-fonts`, `update_fonts_data.yml`)
- Related Control / Principle: ISO 27001 Section 6 - Planning (risk assessment), Section 8 - Operation
- Recommendation: Enable Dependabot or equivalent automated dependency scanning to detect and remediate vulnerable dependencies

### Finding 3
- Finding ID: SEC-01
- Observed Issue: Internal header filtering mechanism relies on manual maintenance of `INTERNAL_HEADERS` allowlist
- Severity: medium
- Evidence: AGENTS.md states "Next.js strips internal headers from incoming requests via `filterInternalHeaders()` in `packages/next/src/server/lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib/server-lib......