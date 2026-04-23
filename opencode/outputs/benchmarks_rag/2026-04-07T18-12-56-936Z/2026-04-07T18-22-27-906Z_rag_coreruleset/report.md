## Executive Summary

The OWASP Core Rule Set (CRS) v4.26.0-dev is an open-source Web Application Firewall rule set for ModSecurity. The project demonstrates mature security practices including GPG-signed releases, a formal vulnerability disclosure process, LTS support with defined EOL dates, pre-commit CI hooks, automated dependency updates via Renovate, and a structured contribution process requiring signed commits. However, several areas present risk: known false positives at PL1 are acknowledged, permanent client blocking can be bypassed via User-Agent manipulation, and the project relies on external infrastructure for release verification. Overall risk is **low-to-medium** given the project's nature as a security tool with transparent governance.

## Findings

### Finding 1
- **Finding ID**: RELEASE-INTEGRITY
- **Observed Issue**: Releases are GPG-signed with a publicly distributed key; verification produces an untrusted signature warning by default ("WARNING: This key is not certified with a trusted signature!").
- **Severity**: low
- **Evidence**: `"gpg: WARNING: This key is not certified with a trusted signature!"` — SECURITY.md lines 57-59
- **Related Control / Principle**: ISO-ISO27001pdf-023 (15.1.2 Intellectual property rights / integrity of distributed artifacts)
- **Recommendation**: Publish the GPG key fingerprint via multiple independent channels (e.g., OpenPGP Web Key Directory, key transparency logs) to strengthen trust-on-first-use verification for new users.

### Finding 2
- **Finding ID**: VULN-DISCLOSURE
- **Observed Issue**: A formal vulnerability reporting process exists via `security@coreruleset.org` with GPG encryption support, version verification steps, and sandbox testing. CVE identifiers are offered.
- **Severity**: low
- **Evidence**: `"Our email is security@coreruleset.org. You can send us encrypted email using the same GPG key we use to sign releases"` — SECURITY.md line 96
- **Related Control / Principle**: ISO-ISO27001pdf-023 (15.2.1 Compliance with security policies)
- **Recommendation**: No immediate action required. Consider publishing a security.txt file at `/.well-known/security.txt` for automated discovery.

### Finding 3
- **Finding ID**: KNOWN-BYPASS
- **Observed Issue**: Permanent blocking of clients is based on User-Agent/IP combination; changing the User-Agent bypasses the filter.
- **Severity**: medium
- **Evidence**: `"Permanent blocking of clients is based on a previous user agent / IP combination. Changing the user agent will thus allow to bypass this new filter."` — KNOWN_BUGS.md lines 15-17
- **Related Control / Principle**: ISO-ISO27001pdf-020 (12.2.4 Output data validation / access control integrity)
- **Recommendation**: Prioritize the planned IP-only filter mentioned in the same bug entry. Until then, document this limitation prominently in deployment guides.

### Finding 4
- **Finding ID**: FALSE-POSITIVES-PL1
- **Observed Issue**: False positives are acknowledged at the default paranoia level 1, which is the level most installations use.
- **Severity**: medium
- **Evidence**: `"There are still false positives for standard web applications in the default install (paranoia level 1). Please report these when you encounter them."` — KNOWN_BUGS.md lines 9-11
- **Related Control / Principle**: ISO-ISO27001pdf-020 (12.4.1 Control of operational software)
- **Recommendation**: Implement automated false-positive regression testing in CI. Provide a curated exclusion-rule template for common frameworks out of the box.

### Finding 5
- **Finding ID**: DEPENDENCY-MGMT
- **Observed Issue**: Renovate is configured for weekly runs but only `docker-compose` manager is enabled. Pre-commit hooks pin `crs-toolchain@v2.4.0` and `pre-commit-hooks@v6.0.0` but Go module and pre-commit hook version updates are not automated.
- **Severity**: low
- **Evidence**: `"enabledManagers": ["docker-compose"]` — renovate.json lines 8-10; `additional_dependencies: ['github.com/coreruleset/crs-toolchain/v2@v2.4.0']` — .pre-commit-config.yaml line 33
- **Related Control / Principle**: ISO-ISO27001pdf-020 (12.4.1 Control of operational software)
- **Recommendation**: Enable `gomod` and `pre-commit` managers in Renovate to ensure upstream dependency updates are tracked automatically.

### Finding 6
- **Finding ID**: CI-SECURITY
- **Observed Issue**: Pre-commit CI is configured to auto-fix and auto-commit to PRs (`autofix_prs: true`), which could allow a compromised upstream hook to introduce malicious code into PRs without reviewer awareness.
- **Severity**: medium
- **Evidence**: `"autofix_prs: true"` — .pre-commit-config.yaml line 7
- **Required**: Ensure branch protection rules require review after auto-fix commits; consider pinning hook revisions with SHA digests instead of tags.
- **Related Control / Principle**: ISO-ISO27001pdf-020 (12.4.3 Access control to program source code)
- **Recommendation**: Pin pre-commit hook revisions to immutable SHA digests. Require approving reviews after any automated commit.

### Finding 7
- **Finding ID**: EOL-SUPPORT
- **Observed Issue**: v3.3.x reaches end-of-life in Q3 2026 with no further security patches. Users on this branch will be exposed to unpatched vulnerabilities.
- **Severity**: medium
- **Evidence**: `"3.3.x | :x: | EOL - Q3 2026"` — SECURITY.md line 22; `"If you are on the v3.3.x branch, it will be completely unsupported by Q3 2026."` — SECURITY.md line 30
- **Related Control / Principle**: ISO-ISO27001pdf-023 (15.1.1 Identification of applicable legislation / lifecycle management)
- **Recommendation**: Provide automated migration tooling or a detailed migration guide from v3.3.x to v4.x. Send advance deprecation notices through release channels.

### Finding 8
- **Finding ID**: LICENSE-COMPLIANCE
- **Observed Issue**: The project uses Apache License 2.0 with a 2025 copyright notice. License includes standard patent grant and disclaimer clauses. No NOTICE file was observed in the repository root.
- **Severity**: low
- **Evidence**: `"Copyright 2025 OWASP CRS project"` — LICENSE line 189; Apache License 2.0 Section 4(d) requires NOTICE file inclusion if one exists in the source.
- **Related Control / Principle**: ISO-ISO27001pdf-023 (15.1.2 Intellectual property rights)
- **Recommendation**: If third-party attributions exist, ensure a NOTICE file is included in distributions to satisfy Section 4(d) of the Apache 2.0 license.

## Final Risk Overview

| Category | Risk Level | Notes |
|---|---|---|
| Release Integrity | Low | GPG signing present; trust bootstrap is manual |
| Vulnerability Disclosure | Low | Mature process with encrypted channel |
| Rule Effectiveness | Medium | Known bypasses (UA-based blocking) and false positives at PL1 |
| Supply Chain / CI | Medium | Auto-fix PRs without SHA-pinned hooks; limited Renovate coverage |
| Lifecycle Management | Medium | v3.3.x EOL imminent (Q3 2026) |
| Licensing | Low | Apache 2.0; verify NOTICE file presence |

**Overall Risk: Medium** — The project demonstrates strong security hygiene for an open-source security tool. Primary risks center on known rule-level bypasses, false positives in default configuration, and CI supply-chain hardening opportunities.