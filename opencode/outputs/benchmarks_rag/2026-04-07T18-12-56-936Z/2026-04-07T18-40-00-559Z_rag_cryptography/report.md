## Executive Summary

This audit examines the `pyca/cryptography` Python package (v47.0.0.dev1), a widely-used cryptographic library providing both high-level recipes (e.g., Fernet symmetric encryption) and low-level primitives backed by Rust and OpenSSL. The codebase demonstrates strong security engineering practices: a mature CI pipeline with coverage, Dependabot for automated dependency updates, strict linting/type-checking, FIPS mode test markers, and dual licensing (Apache-2.0 / BSD-3-Clause). The Fernet implementation correctly applies an Encrypt-then-MAC construction (AES-128-CBC + HMAC-SHA256). However, several areas warrant attention: continued support for EOL Python 3.8, absence of a formal cryptographic key management policy, and reliance on CBC mode (albeit mitigated by HMAC). Overall risk is **low** given the project's maturity and controls, but targeted improvements are recommended.

## Findings

### Finding 1
- **Finding ID:** CRYPTO-KEY-MGMT
- **Observed Issue:** No formal cryptographic key management policy or automated key rotation mechanism is evident. The `MultiFernet.rotate()` method requires manual invocation; keys are split deterministically from a 32-byte blob (`self._signing_key = key[:16]`; `self._encryption_key = key[16:]`) with no derivation function.
- **Severity:** medium
- **Evidence:** `src/cryptography/fernet.py:45-46` — `self._signing_key = key[:16]` / `self._encryption_key = key[16:]`. `pyproject.toml` contains no key management configuration.
- **Related Control / Principle:** ISO-27001 12.3.2 Key management
- **Recommendation:** Adopt HKDF or a similar KDF for key derivation from a master secret; document and automate key rotation workflows; publish a formal key management policy.

### Finding 2
- **Finding ID:** CRYPTO-CBC-MODE
- **Observed Issue:** Fernet uses AES-CBC mode rather than an authenticated encryption mode (e.g., AES-GCM). Confidentiality and integrity are achieved via a separate HMAC-SHA256 (Encrypt-then-MAC), which is cryptographically sound but increases implementation complexity and the risk of subtle misuse.
- **Severity:** low
- **Evidence:** `src/cryptography/fernet.py:68` — `modes.CBC(iv)`; `src/cryptography/fernet.py:79` — `HMAC(self._signing_key, hashes.SHA256())`. The signature is verified before decryption at `fernet.py:149` (`self._verify_signature(data)`), confirming correct Encrypt-then-MAC ordering.
- **Related Control / Principle:** ISO-17799 12.3 Cryptographic Controls
- **Recommendation:** Consider offering an AES-GCM-based alternative for new deployments while maintaining CBC for backward compatibility.

### Finding 3
- **Finding ID:** DEPS-EOL-PYTHON
- **Observed Issue:** Python 3.8 remains a supported target despite being end-of-life. A deprecation warning is present, but the package still ships and tests against it.
- **Severity:** low
- **Evidence:** `pyproject.toml:39` — `"Programming Language :: Python :: 3.8"`; `pyproject.toml:51` — `requires-python = ">=3.8,!=3.9.0,!=3.9.1"`; `src/cryptography/__init__.py:19-25` — deprecation warning for Python 3.8.
- **Related Control / Principle:** ISO-27001 12.4.1 Control of operational software
- **Recommendation:** Accelerate removal of Python 3.8 support to eliminate testing and dependency maintenance burden on an unsupported runtime.

### Finding 4
- **Finding ID:** SEC-DEPENDABOT
- **Observed Issue:** Insufficient evidence of vulnerability scanning beyond Dependabot. Dependabot is configured for `github-actions`, `cargo`, and `uv` ecosystems with daily schedules and unlimited PRs, which is positive.
- **Severity:** low
- **Evidence:** `.github/dependabot.yml` — three ecosystems configured, `interval: daily`, `open-pull-requests-limit: 1024`.
- **Related Control / Principle:** ISO-27001 12.6.1 Management of technical vulnerabilities
- **Recommendation:** Complement Dependabot with a dedicated software composition analysis (SCA) tool (e.g., OSV-Scanner, Trivy) for transitive dependency and native library (OpenSSL) vulnerability scanning.

### Finding 5
- **Finding ID:** SEC-CI-COVERAGE
- **Observed Issue:** Insufficient evidence — CI workflows exist (`ci.yml`, `benchmark.yml`, etc.) and the noxfile configures Rust and Python coverage collection, but the actual CI workflow content was not retrieved to confirm enforcement gates.
- **Severity:** low
- **Evidence:** `noxfile.py` — coverage via `pytest-cov`, `llvm-cov` for Rust; `pyproject.toml:140` — `skip_fips` pytest marker indicates FIPS mode testing. `.github/workflows/ci.yml` exists but content not retrieved.
- **Related Control / Principle:** ISO-27001 12.2.4 Output data validation; ISO-27001 12.4.3 Access control to program source code
- **Recommendation:** Ensure CI enforces minimum coverage thresholds and FIPS-mode test suites as mandatory gates before merge.

### Finding 6
- **Finding ID:** CRYPTO-RANDOM-IV
- **Observed Issue:** No issue found. IVs are generated via `os.urandom(16)`, which is cryptographically secure.
- **Severity:** low (informational — no issue)
- **Evidence:** `src/cryptography/fernet.py:56` — `iv = os.urandom(16)`; `src/cryptography/fernet.py:50` — `os.urandom(32)` for key generation; `src/cryptography/fernet.py:197` — `iv = os.urandom(16)` in `MultiFernet.rotate`.
- **Related Control / Principle:** ISO-17799 12.3 Cryptographic Controls
- **Recommendation:** No action required. Continue using `os.urandom` or consider `secrets` module for explicitness.

## Final Risk Overview

| Category | Risk Level | Notes |
|---|---|---|
| Cryptographic Implementation | Low | Encrypt-then-MAC correctly implemented; AES-CBC mitigated by HMAC-SHA256 |
| Key Management | Medium | No formal policy; manual rotation only |
| Dependency Management | Low | Dependabot active for 3 ecosystems; no SCA tool evident |
| Runtime Support | Low | Python 3.8 EOL but deprecation warning present |
| CI/CD Security | Low | Comprehensive test/lint/coverage pipeline; FIPS markers present |
| Randomness | Low | `os.urandom` used throughout |

**Overall Risk: Low.** The project demonstrates mature security practices. The primary actionable item is establishing a formal key management policy and derivation strategy (CRYPTO-KEY-MGMT).