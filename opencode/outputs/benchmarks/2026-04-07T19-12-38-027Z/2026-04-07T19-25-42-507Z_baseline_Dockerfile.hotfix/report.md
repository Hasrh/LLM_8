## Executive Summary

The `Dockerfile.hotfix` builds a MinIO server image with a multi-stage build and includes signature verification for the primary binaries. However, several security weaknesses are present: overly permissive file permissions (`chmod 777`), downloaded SHA256 checksum files that are never verified, an unverified static curl binary fetched from GitHub, and signature/checksum artifacts leaked into the final image.

---

## Findings

### Finding 1
- **Finding ID:** F1-CHMOD777
- **Observed Issue:** `/usr/bin` is made world-writable (read/write/execute for all users), allowing any process or user in the container to modify system binaries.
- **Severity:** critical
- **Evidence:** `RUN chmod -R 777 /usr/bin` (line 56)
- **Related Control / Principle:** Least privilege / File permission hardening
- **Recommendation:** Remove the `chmod -R 777 /usr/bin` line. If write access is needed for a specific script, apply minimal permissions to only that file (e.g., `chmod 755 /usr/bin/docker-entrypoint.sh`).

### Finding 2
- **Finding ID:** F2-SHA256-UNVERIFIED
- **Observed Issue:** `.sha256sum` files are downloaded for both `minio` and `mc` binaries but are never used to verify integrity.
- **Severity:** medium
- **Evidence:**
  - `curl -s -q .../minio.${RELEASE}.sha256sum -o /go/bin/minio.sha256sum` (line 17)
  - `curl -s -q .../mc.sha256sum -o /go/bin/mc.sha256sum` (line 23)
  - No `sha256sum -c` or equivalent verification step exists anywhere in the Dockerfile.
- **Related Control / Principle:** Supply chain integrity verification
- **Recommendation:** Add explicit checksum verification, e.g., `RUN sha256sum -c /go/bin/minio.sha256sum && sha256sum -c /go/bin/mc.sha256sum`, or remove the download of these files if minisign verification is deemed sufficient.

### Finding 3
- **Finding ID:** F3-CURL-UNVERIFIED
- **Observed Issue:** A static `curl` binary is downloaded from GitHub Releases for `amd64` without any signature or checksum verification.
- **Severity:** high
- **Evidence:** `curl -L -s -q https://github.com/moparisthebest/static-curl/releases/latest/download/curl-${TARGETARCH} -o /go/bin/curl` (lines 26-28)
- **Related Control / Principle:** Supply chain integrity verification
- **Recommendation:** Verify the static curl binary against a known checksum or signature, or pin to a specific release tag with a verified hash.

### Finding 4
- **Finding ID:** F4-ARTIFACT-LEAK
- **Observed Issue:** Signature (`.minisig`) and checksum (`.sha256sum`) files are copied into the final runtime image alongside the binaries, increasing attack surface and image size unnecessarily.
- **Severity:** low
- **Evidence:**
  - `COPY --from=build /go/bin/minio* /usr/bin/` (line 59)
  - `COPY --from=build /go/bin/mc* /usr/bin/` (line 60)
- **Related Control / Principle:** Minimal attack surface / Image hygiene
- **Recommendation:** Copy only the required binaries explicitly: `COPY --from=build /go/bin/minio /usr/bin/minio` and `COPY --from=build /go/bin/mc /usr/bin/mc`.

### Finding 5
- **Finding ID:** F5-ENV-PUBKEY-EXPOSURE
- **Observed Issue:** The minisign public key is exposed as a container environment variable, making it visible in image metadata (`docker inspect`) and at runtime.
- **Severity:** low
- **Evidence:** `MINIO_UPDATE_MINISIGN_PUBKEY="RWTx5Zr1tiHQLwG9keckT0c45M3AGeHD6IvimQHpyRywVWGbP1aVSGav"` (line 52)
- **Related Control / Principle:** Information disclosure minimization
- **Recommendation:** This is a public key (not a secret), so risk is low. If MinIO does not require this ENV at runtime, remove it. Otherwise, document its purpose.

### Finding 6
- **Finding ID:** F6-NO-HEALTHCHECK
- **Observed Issue:** No `HEALTHCHECK` instruction is defined, preventing container orchestrators from detecting a non-functional MinIO process.
- **Severity:** low
- **Evidence:** No `HEALTHCHECK` instruction present in the Dockerfile.
- **Related Control / Principle:** Operational resilience / Container best practices
- **Recommendation:** Add a healthcheck, e.g., `HEALTHCHECK --interval=30s --timeout=5s CMD mc ready local || exit 1`.

---

## Final Risk Overview

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| Critical | 1     | F1          |
| High     | 1     | F3          |
| Medium   | 1     | F2          |
| Low      | 3     | F4, F5, F6  |

**Overall Risk: High**

The critical `chmod 777 /usr/bin` (F1) and the unverified third-party curl binary (F3) are the most urgent issues. The SHA256 files that are downloaded but never verified (F2) represent a gap in the supply chain verification chain — minisign verification is present and correct, but the redundant checksum files create confusion and could mask a verification failure if relied upon in downstream automation.