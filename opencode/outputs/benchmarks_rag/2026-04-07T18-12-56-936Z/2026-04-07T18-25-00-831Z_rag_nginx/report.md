## Executive Summary

This security audit examines the nginx source code repository (samples/bench50/nginx) against ISO/IEC 27001:2022 information security controls. The repository contains the nginx web server source with a default configuration file, GitHub Actions CI workflows, and a documented security policy. Key findings include: a positive security disclosure policy with SLAs, but a default configuration lacking TLS, no access logging, no security headers, running as default user, and CI workflows referencing external reusable workflows without pinned commit SHAs. Overall risk is **medium** — the default configuration is clearly intended as a template, but if deployed as-is would expose significant attack surface.

---

## Findings

### Finding 1
- **Finding ID:** NO-TLS
- **Observed Issue:** Default configuration has no HTTPS/TLS enabled. The server block listens on port 80 only. The HTTPS server block is fully commented out.
- **Severity:** high
- **Evidence:** `conf/nginx.conf:36` — `listen 80;` and `conf/nginx.conf:96-113` — entire SSL server block is commented out (`#server { # listen 443 ssl; ... }`)
- **Related Control / Principle:** ISO-ISOIEC270012022e-008 / Cryptographic Controls (12.3.1, 12.3.2) — policy on use of cryptographic controls and key management
- **Recommendation:** Uncomment and configure the SSL server block with modern TLS settings (TLS 1.2+), valid certificates, and strong cipher suites. Redirect HTTP to HTTPS.

### Finding 2
- **Finding ID:** NO-ACCESS-LOG
- **Observed Issue:** Access logging and error logging are both disabled (commented out) in the default configuration, preventing security monitoring and incident response.
- **Severity:** medium
- **Evidence:** `conf/nginx.conf:5-7` — `#error_log logs/error.log;` (all levels commented); `conf/nginx.conf:25` — `#access_log logs/access.log main;`
- **Related Control / Principle:** ISO-ISO27001pdf-021 / 13.1.1 Reporting information security events — logging is prerequisite for detection and reporting
- **Recommendation:** Enable access_log and error_log with appropriate verbosity. Configure log rotation and centralized log aggregation.

### Finding 3
- **Finding ID:** NO-SEC-HEADERS
- **Observed Issue:** No security headers are configured (e.g., X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, Strict-Transport-Security).
- **Severity:** medium
- **Evidence:** `conf/nginx.conf:17-115` — no `add_header` directives present anywhere in the http or server blocks
- **Related Control / Principle:** ISO-ISO27001pdf-020 / 12.2.4 Output data validation — ensuring output is properly validated and secured
- **Recommendation:** Add security headers: `add_header X-Content-Type-Options nosniff;`, `add_header X-Frame-Options DENY;`, `add_header Content-Security-Policy ...;` and HSTS when TLS is enabled.

### Finding 4
- **Finding ID:** DEFAULT-USER
- **Observed Issue:** The `user` directive is commented out, meaning nginx worker processes run as the default compiled-in user (typically `nobody` or `www-data`), with no explicit least-privilege configuration.
- **Severity:** low
- **Evidence:** `conf/nginx.conf:2` — `#user nobody;` (commented out)
- **Related Control / Principle:** ISO-ISOIEC270012022e-008 / Access Control — principle of least privilege for service accounts
- **Recommendation:** Explicitly set `user` directive to a dedicated, unprivileged nginx service account (e.g., `user nginx;` or `user www-data;`).

### Finding 5
- **Finding ID:** CI-UNPINNED
- **Observed Issue:** GitHub Actions workflows reference external reusable workflows using `@main` branch reference instead of pinned commit SHAs, risking supply chain compromise.
- **Severity:** medium
- **Evidence:** `.github/workflows/buildbot.yml:11` — `uses: nginx/ci-self-hosted/.github/workflows/nginx-buildbot.yml@main`; `.github/workflows/check-pr.yml:8` — `uses: nginx/ci-self-hosted/.github/workflows/nginx-check-pr.yml@main`
- **Related Control / Principle:** ISO-ISO27001pdf-021 / 12.5.1 Change control procedures — changes to software/packages should be controlled and verified
- **Recommendation:** Pin reusable workflow references to specific commit SHAs (e.g., `@a1b2c3d`) instead of mutable branch references (`@main`).

### Finding 6
- **Finding ID:** NO-RATE-LIMIT
- **Observed Issue:** No rate limiting, request size limits, or timeout hardening is configured, leaving the server vulnerable to DoS and abuse.
- **Severity:** medium
- **Evidence:** `conf/nginx.conf:17-115` — no `limit_req_zone`, `limit_req`, `client_max_body_size`, or explicit timeout configurations present; only `keepalive_timeout 65;` is set
- **Related Control / Principle:** ISO-ISOIEC270012022e-008 / Availability — protection against resource exhaustion and asymmetric attacks
- **Recommendation:** Add `limit_req_zone` and `limit_req` directives, set `client_max_body_size`, configure `client_body_timeout`, `client_header_timeout`, and `send_timeout`.

### Finding 7
- **Finding ID:** SERVER-INFO-EXPOSURE
- **Observed Issue:** `server_tokens` is not disabled, allowing nginx version information to be exposed in response headers and error pages, aiding attacker reconnaissance.
- **Severity:** low
- **Evidence:** `conf/nginx.conf:17-115` — no `server_tokens off;` directive present
- **Related Control / Principle:** ISO-ISO27001pdf-020 / 12.5.4 Information leakage — preventing disclosure of system information
- **Recommendation:** Add `server_tokens off;` in the http block to suppress version information.

### Finding 8
- **Finding ID:** SECURITY-POLICY-POSITIVE
- **Observed Issue:** A comprehensive security policy exists with defined vulnerability reporting channels, SLAs (acknowledgment within 1-3 days, fix within 90 days), and responsible disclosure practices. This is a positive finding.
- **Severity:** low (positive control)
- **Evidence:** `SECURITY.md:9-20` — multiple reporting methods (GitHub, F5, email); `SECURITY.md:46-49` — defined SLAs; `SECURITY.md:37-42` — responsible disclosure and embargo practices
- **Related Control / Principle:** ISO-ISO27001pdf-021 / 13.1.1 Reporting information security events; 12.6.1 Control of technical vulnerabilities
- **Recommendation:** No action required. Consider also publishing a `security.txt` file at `/.well-known/security.txt` for discoverability.

---

## Final Risk Overview

| Category | Risk Level | Summary |
|---|---|---|
| **Confidentiality** | High | No TLS encryption; no security headers; server version exposed |
| **Integrity** | Medium | No output validation headers; CI supply chain risk via unpinned workflows |
| **Availability** | Medium | No rate limiting, no request size limits, minimal timeout hardening |
| **Monitoring** | Medium | Access and error logging disabled by default |
| **Governance** | Low (Positive) | Well-defined security policy with SLAs and responsible disclosure |

**Overall Risk: Medium-High** — The default `nginx.conf` is clearly a development template, not production-ready. If deployed without modification, it would expose the server to eavesdropping, reconnaissance, abuse, and provide no audit trail. The repository-level security governance (SECURITY.md) is strong, but the default configuration requires hardening before any production use.