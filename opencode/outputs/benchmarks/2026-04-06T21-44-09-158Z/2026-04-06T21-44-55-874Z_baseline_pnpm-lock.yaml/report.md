## Executive Summary

A security review of `/home/aggerio/temp/opencode/samples/bench50/apisix/t/pnpm-lock.yaml` reveals **2 findings** related to deprecated packages with known security vulnerabilities and memory safety issues. The lockfile itself uses modern integrity hashing (sha512) and a current lockfile version (`9.0`). No lockfile tampering indicators were detected.

---

## Findings

### Finding 1
- **Finding ID**: DEPRECATED-GLOB
- **Observed Issue**: `glob@7.2.3` is explicitly marked deprecated with a warning that it "contain[s] widely publicized security vulnerabilities"
- **Severity**: high
- **Evidence**: Line 936: `deprecated: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version.`
- **Related Control / Principle**: Dependency Vulnerability Management — known vulnerable dependencies must be updated or replaced
- **Recommendation**: Upgrade to `glob@10.x` or later (the current major version with fixes). If a transitive dependency, run `pnpm update glob` or add an override in `package.json` to force a patched version.

---

### Finding 2
- **Finding ID**: DEPRECATED-INFLIGHT
- **Observed Issue**: `inflight@1.0.6` is deprecated and documented to leak memory
- **Severity**: medium
- **Evidence**: Line 1010: `deprecated: This module is not supported, and leaks memory. Do not use it.`
- **Related Control / Principle**: Resource Safety / Memory Leak Prevention — unsupported modules with known memory leaks should be removed
- **Recommendation**: Replace with `lru-cache` or a modern alternative as suggested by the deprecation notice. Update any direct or transitive consumers (likely `glob` or `rimraf` chains).

---

### Finding 3
- **Finding ID**: LOCKFILE-PEER-RESOLUTION
- **Observed Issue**: Multiple packages have optional or unmet peer dependencies that could lead to runtime incompatibilities (e.g., `@modelcontextprotocol/sdk@1.26.0` requires `zod@^3.25 || ^4.0`; `express-rate-limit@8.2.1` requires `express`)
- **Severity**: low
- **Evidence**: Lines 398-403, 844-845 — peer dependency declarations present but lockfile does not confirm all peers are resolved within this scope (this is a dev/test fixture, not a production package)
- **Related Control / Principle**: Dependency Consistency — peer dependencies should be explicitly satisfied to avoid runtime errors
- **Recommendation**: Verify peer dependencies are satisfied in the consuming project's `package.json`. For a test fixture, this is acceptable but should be documented.

---

## Final Risk Overview

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| Critical | 0 | — |
| High | 1 | DEPRECATED-GLOB |
| Medium | 1 | DEPRECATED-INFLIGHT |
| Low | 1 | LOCKFILE-PEER-RESOLUTION |

**Overall Risk**: **Medium** — driven primarily by the deprecated `glob` package with acknowledged security vulnerabilities. This file appears to be a test fixture (`samples/bench50/apisix/t/`), which limits production blast radius, but the vulnerabilities should still be remediated to prevent unsafe patterns from propagating.