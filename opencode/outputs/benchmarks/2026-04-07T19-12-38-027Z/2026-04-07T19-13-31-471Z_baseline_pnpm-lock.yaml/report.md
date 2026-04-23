## Executive Summary

Audit of `pnpm-lock.yaml` reveals multiple dependency hygiene concerns including deprecated packages with acknowledged security vulnerabilities, duplicate package versions increasing supply chain attack surface, and an outdated core protobuf library. No lockfile integrity or tampering indicators were observed.

## Findings

### Finding 1
- Finding ID: DEPRECATED-GLOB
- Observed Issue: `glob@7.2.3` is deprecated and explicitly notes "widely publicized security vulnerabilities"
- Severity: high
- Evidence: Line 936: `deprecated: Old versions of glob are not supported, and contain widely publicized security vulnerabilities`
- Related Control / Principle: Dependency Vulnerability Management
- Recommendation: Upgrade to `glob@10.x` or later; update dependent packages (`jest`, `istanbul-lib-source-maps`, etc.) that pull in this version

### Finding 2
- Finding ID: DEPRECATED-INFLIGHT
- Observed Issue: `inflight@1.0.6` is deprecated and leaks memory
- Severity: medium
- Evidence: Line 1010: `deprecated: This module is not supported, and leaks memory.`
- Related Control / Principle: Dependency Lifecycle Management
- Recommendation: Replace with `lru-cache` or upgrade transitive dependents; this is pulled in by `glob@7.2.3`

### Finding 3
- Finding ID: DUPLICATE-PACKAGE-VERSIONS
- Observed Issue: Multiple Babel and utility packages have two or more versions resolved simultaneously, increasing bundle size and supply chain attack surface
- Severity: low
- Evidence: `@babel/traverse` at 7.27.0 (line 254) and 7.28.0 (line 258); `@babel/types` at 7.27.0 (line 262) and 7.28.0 (line 266); `@jridgewell/trace-mapping` at 0.3.25, 0.3.29, and 0.3.9 (lines 380-387); `debug` at 4.4.0 and 4.4.3 (lines 702-718)
- Related Control / Principle: Dependency Deduplication / Supply Chain Minimization
- Recommendation: Run `pnpm dedupe` and align version specifiers in `package.json` to allow resolution to single versions

### Finding 4
- Finding ID: OUTDATED-PROTOBUF
- Observed Issue: `google-protobuf@3.21.4` is a legacy major version (v3) while the ecosystem has moved to v4+
- Severity: low
- Evidence: Line 942-943: `google-protobuf@3.21.4` with no newer resolution
- Related Control / Principle: Dependency Currency
- Recommendation: Evaluate migration to `@bufbuild/protobuf` or protobufjs for active maintenance and security patches

### Finding 5
- Finding ID: NO-LOCKFILE-INTEGRITY-CONTROL
- Observed Issue: No evidence of `pnpm-lock.yaml` integrity verification (e.g., `onlyBuiltDependencies`, `ignoredBuiltDependencies`, or CI lockfile checksum enforcement)
- Severity: low
- Evidence: No `onlyBuiltDependencies`, `.pnpmfile.cjs`, or CI configuration visible in this file
- Related Control / Principle: Lockfile Integrity Verification
- Recommendation: Add CI step to verify `pnpm-lock.yaml` is unchanged after install; consider `pnpm audit` in CI pipeline

## Final Risk Overview

| Severity | Count |
|----------|-------|
| High     | 1     |
| Medium   | 1     |
| Low      | 3     |

**Overall Risk: Medium**

The primary risk driver is the deprecated `glob@7.2.3` with acknowledged security vulnerabilities. The remaining findings are dependency hygiene issues that compound supply chain risk but do not represent immediate exploitable conditions. All packages carry valid `sha512` integrity hashes, indicating no lockfile tampering was detected.