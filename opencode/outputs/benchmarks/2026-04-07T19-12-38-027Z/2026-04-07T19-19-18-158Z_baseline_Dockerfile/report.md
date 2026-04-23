## Executive Summary

The Dockerfile at `/home/aggerio/temp/opencode/samples/bench50/elasticsearch/x-pack/test/smb-fixture/src/main/resources/Dockerfile` defines a Samba/Active Directory test fixture container. Several security concerns are identified, most notably the inclusion of private key material (`ca.key`, `key.pem`) in the image layers, execution as root, and use of an unpinned base image. As a test fixture, the risk is partially mitigated by its intended isolated use, but the patterns should not propagate to production images.

## Findings

### Finding 1
- Finding ID: DOCKER-001
- Observed Issue: Private key material (`ca.key`, `key.pem`) is baked into the image layers, making it recoverable by anyone with access to the image.
- Severity: high
- Evidence: `COPY smb/certs/ca.key /fixture/certs/ca.key` and `COPY smb/certs/key.pem /fixture/certs/key.pem`
- Related Control / Principle: Secrets management — no secrets in image layers
- Recommendation: Mount certificates at runtime via Docker secrets, bind mounts, or a secrets manager instead of `COPY`-ing them into the image.

### Finding 2
- Finding ID: DOCKER-002
- Observed Issue: No `USER` directive — the container runs as root by default.
- Severity: medium
- Evidence: No `USER` instruction present in the Dockerfile.
- Related Control / Principle: Least privilege
- Recommendation: Add a non-root `USER` directive if the Samba service does not require root. If root is required for `samba-ad-dc`, document the justification and consider namespace remapping.

### Finding 3
- Finding ID: DOCKER-003
- Observed Issue: Base image is not pinned to a digest, allowing non-deterministic and potentially vulnerable image pulls.
- Severity: medium
- Evidence: `FROM ubuntu:24.04` (tag-only reference, no `@sha256:...` digest).
- Related Control / Principle: Supply chain integrity / reproducible builds
- Recommendation: Pin to a specific digest, e.g., `FROM ubuntu:24.04@sha256:<digest>`.

### Finding 4
- Finding ID: DOCKER-004
- Observed Issue: No `HEALTHCHECK` instruction defined.
- Severity: low
- Evidence: Absence of any `HEALTHCHECK` directive.
- Related Control / Principle: Container observability / operational resilience
- Recommendation: Add a `HEALTHCHECK` that validates the Samba AD DC service is responding (e.g., via `smbclient` or `ldapsearch`).

### Finding 5
- Finding ID: DOCKER-005
- Observed Issue: Multi-package `apt-get install` does not clean the apt cache, increasing image size and attack surface.
- Severity: low
- Evidence: `apt-get install -qqy tzdata winbind samba ldap-utils` with no `&& rm -rf /var/lib/apt/lists/*`
- Related Control / Principle: Minimal attack surface
- Recommendation: Append `&& rm -rf /var/lib/apt/lists/*` to the same `RUN` layer to reduce image size and remove cached package data.

### Finding 6
- Finding ID: DOCKER-006
- Observed Issue: The `CMD` runs a shell script that starts a service and then `sleep infinity`, providing no graceful shutdown handling.
- Severity: low
- Evidence: `CMD ["/bin/sh", "-c", "/fixture/provision/installsmb.sh && service samba-ad-dc restart && echo Samba started && sleep infinity"]`
- Related Control / Principle: Proper process management
- Recommendation: Use an init system (e.g., `tini`) or run `samba-ad-dc` as PID 1 directly (e.g., `CMD ["samba-ad-dc", "foreground"]`) to enable proper signal handling and graceful shutdown.

## Final Risk Overview

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 1     |
| Medium   | 2     |
| Low      | 3     |

**Overall Risk: Medium.** The highest-severity finding is the inclusion of private keys in image layers (DOCKER-001). The remaining findings are standard Docker hardening gaps. Since this is a test fixture, the blast radius is limited to test environments, but the patterns should be corrected before any reuse in shared or production contexts.