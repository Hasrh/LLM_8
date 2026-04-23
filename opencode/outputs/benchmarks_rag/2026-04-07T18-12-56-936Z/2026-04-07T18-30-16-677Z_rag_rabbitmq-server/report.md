## Executive Summary

A surface-level security review of the RabbitMQ server repository root directory structure was performed. Evidence is limited to file/directory names only; no file contents were analyzed. The project exhibits standard open-source hygiene (CI/CD via `.github/`, contribution guidelines, licensing). No obvious credential leaks or insecure artifacts are visible at the root level. Deeper analysis of file contents, dependency manifests, CI workflows, and source code is required for a thorough assessment.

## Findings

### Finding 1
- Finding ID: SEC-01
- Observed Issue: No visible `SECURITY.md` or vulnerability disclosure policy file at repository root
- Severity: medium
- Evidence: Directory listing shows `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `GEMINI.md`, `AGENTS.md` but no `SECURITY.md`
- Related Control / Principle: ISO 27001 — 10.10.1 Audit logging / 10.6.1 Network controls (incident management and vulnerability handling)
- Recommendation: Add a `SECURITY.md` file defining coordinated vulnerability disclosure procedures, supported versions, and contact channels

### Finding 2
- Finding ID: DEP-01
- Observed Issue: `deps/` directory present — third-party dependency inventory unknown without content inspection
- Severity: medium
- Evidence: `deps/` directory exists; no visible lockfile (e.g., `rebar.lock`) in root listing
- Related Control / Principle: ISO 27001 — 10.4.1 Controls against malicious code / 10.4.2 Controls against mobile code
- Recommendation: Verify dependency pinning via `rebar.lock`; run SCA tooling (e.g., `mix audit`, `dependabot`) to identify vulnerable transitive dependencies

### Finding 3
- Finding ID: CI-01
- Observed Issue: CI/CD pipeline contents unverifiable from directory listing alone
- Severity: low
- Evidence: `.github/` directory present; no visibility into workflow YAML files, secrets configuration, or branch protection rules
- Related Control / Principle: ISO 27001 — 10.6.2 Security of network services / 10.10.2 Monitoring system use
- Recommendation: Review `.github/workflows/*.yml` for use of pinned action versions, `permissions:` scoping, and absence of secret exfiltration vectors

### Finding 4
- Finding ID: CRED-01
- Observed Issue: No obvious credential/secret files at repository root
- Severity: low
- Evidence: `.gitignore` and `.dockerignore` present; no `.env`, `credentials.*`, `*.pem`, or `*.key` files visible in root
- Related Control / Principle: ISO 27001 — 11.5.3 Password management system / 11.6.1 Information access restriction
- Recommendation: Confirm via `git log --all --full-history -- "*.pem" "*.key" ".env*"` that no secrets were ever committed and later removed; rotate any that were

### Finding 5
- Finding ID: DOC-01
- Observed Issue: AI assistant configuration files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) present — potential prompt-injection surface if untrusted PRs modify them
- Severity: low
- Evidence: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` all present at root
- Related Control / Principle: ISO 27001 — 10.7.4 Security of system documentation / 10.8.3 Physical media in transit
- Recommendation: Treat AI config files as security-sensitive; require code-owner review for changes; document expected behavior to detect malicious modifications

## Final Risk Overview

| Category | Risk Level | Notes |
|---|---|---|
| Secret Exposure | Low | No credential files visible at root |
| Dependency Risk | Medium | `deps/` present; lockfile status unknown |
| Vulnerability Disclosure | Medium | No `SECURITY.md` observed |
| CI/CD Security | Low | Insufficient evidence — workflow files not reviewed |
| AI Config Integrity | Low | AI assistant files present; treat as code |

**Overall: Medium** — Surface-level review reveals no critical issues, but dependency management and vulnerability disclosure practices cannot be verified without inspecting file contents, CI workflows, and dependency manifests.