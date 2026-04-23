## Executive Summary

The `Dockerfile.hotfix` builds a MinIO server image using a multi-stage build with signature verification via minisign. Several security concerns were identified, most notably a `chmod -R 777 /usr/bin` instruction that grants world-writable permissions to a critical system directory, an unverified third-party `curl` binary download, and downloaded SHA256 checksum files that are never used for verification. The container also runs as root with no `USER` directive.

## Findings

### Finding 1
- Finding ID: WORLD-WRITABLE-USBIN
- Observed Issue: Recursive `chmod 777` on `/usr/bin` grants read, write, and execute permissions to all users on a critical system binary directory, enabling potential container escape or privilege escalation if the container is compromised.
- Severity: critical
- Evidence: `RUN chmod -R 777 /usr/bin` (line 56)
- Related Control / Principle: Least privilege; immutable infrastructure
- Recommendation: Remove the `chmod -R 777 /usr/bin` line. If specific binaries need execute permissions, apply narrowly (e.g., `chmod +x /usr/bin/minio /usr/bin/mc`).

### Finding 2
- Finding ID: UNVERIFIED-CURL-BINARY
- Observed Issue: A `curl` binary is downloaded from a third-party GitHub releases URL (`github.com/moparisthebest/static-curl`) with no cryptographic signature or checksum verification.
- Severity: high
- Evidence: `curl -L -s -q https://github.com/moparisthebest/static-curl/releases/latest/download/curl-${TARGETARCH} -o /go/bin/curl` (lines 27-28), with no subsequent verification step.
- Related Control / Principle: Supply chain integrity; artifact verification
- Recommendation: Pin to a specific release version, download the corresponding checksum/signature files, and verify before use. Alternatively, use the system `curl` already installed via `apk`.

### Finding 3
- Finding ID: UNUSED-SHA256-CHECKSUMS
- Observed Issue: SHA256 checksum files (`minio.${RELEASE}.sha256sum`, `mc.sha256sum`) are downloaded but never used to verify the corresponding binaries. Only minisign verification is performed.
- Severity: medium
- Evidence: Lines 17 and 23 download `.sha256sum` files, but lines 32-33 only run `minisign -Vqm` — no `sha256sum -c` or equivalent is executed.
- Related Control / Principle: Defense in depth; artifact integrity verification
- Recommendation: Either remove the unused `.sha256sum` downloads or add explicit checksum verification (e.g., `sha256sum -c /go/bin/minio.sha256sum`) before the minisign check.

### Finding 4
- Finding ID: NO-USER-DIRECTIVE
- Observed Issue: No `USER` directive is specified; the container runs as root by default.
- Severity: medium
- Evidence: Absence of any `USER` instruction in the final stage (lines 35-71).
- Related Control / Principle: Least privilege; non-root container execution
- Recommendation: Add a non-root user (e.g., `USER 1000:1000` or a named `minio` user) and ensure file permissions support it.

### Finding 5
- Finding ID: HARDCODED-MINISIGN-PUBKEY
- Observed Issue: The minisign public key is hardcoded directly in the Dockerfile. While this is the official MinIO signing key, hardcoding reduces agility for key rotation.
- Severity: low
- Evidence: `-P RWTx5Zr1tiHQLwG9keckT0c45M3AGeHD6IvimQHpyRywVWGbP1aVSGav` (lines 32-33) and `MINIO_UPDATE_MINISIGN_PUBKEY` env var (line 52).
- Related Control / Principle: Key management; configuration externalization
- Recommendation: Accept the public key as a build argument or runtime environment variable to support key rotation without rebuilding the image.

### Finding 6
- Finding ID: SILENT-CURL-FLAGS
- Observed Issue: All `curl` invocations use `-s -q` (silent, quiet) flags, suppressing error output and making build-time failures or tampering harder to detect in CI logs.
- Severity: low
- Evidence: `curl -s -q` used in lines 15-17, 21-23, 27.
- Related Control / Principle: Auditability; fail-fast builds
- Recommendation: Remove `-q` and consider removing `-s` in CI contexts. Use `curl -fSsL` to fail on HTTP errors while still showing errors.

## Final Risk Overview

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| Critical | 1 | WORLD-WRITABLE-USBIN |
| High | 1 | UNVERIFIED-CURL-BINARY |
| Medium | 2 | UNUSED-SHA256-CHECKSUMS, NO-USER-DIRECTIVE |
| Low | 2 | HARDCODED-MINISIGN-PUBKEY, SILENT-CURL-FLAGS |

**Overall Risk: High** — The `chmod -R 777 /usr/bin` vulnerability is the most severe issue, as it fundamentally undermines container isolation. The unverified third-party `curl` binary introduces a supply chain risk. Addressing these two findings should be prioritized.