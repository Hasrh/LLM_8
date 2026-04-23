## Executive Summary

A security review of `/home/aggerio/temp/opencode/samples/bench50/apisix/t/pnpm-lock.yaml` identified **2 findings** related to deprecated dependencies with known security issues. The lockfile itself contains explicit deprecation and security warnings for `glob@7.2.3` and `inflight@1.0.6`. No other critical vulnerabilities are directly evidenced in the lockfile content.

## Findings

### Finding 1

- **Finding ID**: DEPRECATED-GLOB
- **Observed Issue**: `glob@7.2.3` is explicitly marked as deprecated with known security vulnerabilities
- **Severity**: high
- **Evidence**: Line 936: `deprecated: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version.`
- **Related Control / Principle**: Dependency lifecycle management — use only supported package versions
- **Recommendation**: Upgrade to `glob@10.x` or later (or `glob@8.x+`) to remediate known vulnerabilities. Update any transitive dependency pulling in `glob@7.2.3` (likely via `jest`, `istanbul-lib-source-maps`, or `glob`'s consumers in the test stack).

### Finding 2

- **Finding ID**: DEPRECATED-INFLIGHT
- **Observed Issue**: `inflight@1.0.6` is deprecated and known to leak memory
- **Severity**: medium
- **Evidence**: Line 1010: `deprecated: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.`
- **Related Control / Principle**: Dependency lifecycle management — avoid unsupported packages with resource leaks
- **Recommendation**: Replace `inflight` usage with `lru-cache` or upgrade the parent dependency that pulls it in (typically `glob` or `rimraf`). Since `glob@7.2.3` transitively depends on `inflight`, resolving Finding 1 may also resolve this.

## Final Risk Overview

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 1     |
| Medium   | 1     |
| Low      | 0     |

**Overall Risk**: Medium-High. The primary concern is `glob@7.2.3` which the lockfile itself flags as containing "widely publicized security vulnerabilities." Both findings are likely resolvable together by upgrading the `glob` dependency chain. No evidence of malicious packages, integrity mismatches, or resolution overrides was found in the reviewed content.