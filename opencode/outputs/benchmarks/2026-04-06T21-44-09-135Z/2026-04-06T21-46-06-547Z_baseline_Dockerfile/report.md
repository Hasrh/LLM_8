## Executive Summary

The Dockerfile defines a Samba AD DC test fixture based on `ubuntu:24.04`. Two high-severity findings were identified: private key material (`ca.key`, `key.pem`) is baked directly into the image layers, and the container runs as root with no `USER` directive. Additional medium/low findings include missing image hardening (apt cache cleanup, no healthcheck, shell-as-PID-1). As a test fixture the blast radius is limited, but the certificate embedding pattern should not propagate to production images.

## Findings

### Finding 1
- **Finding ID**: CERT-IN-IMAGE
- **Observed Issue**: Private key files (`ca.key`, `key.pem`) are copied into the image and persist in layer history.
- **Severity**: high
- **Evidence**: `COPY smb/certs/ca.key /fixture/certs/ca.key` and `COPY smb/certs/key.pem /fixture/certs/key.pem`
- **Related Control / Principle**: Secrets must not be embedded in container images; use runtime secret injection (e.g., Docker secrets, mounted volumes, or build-time `--secret`).
- **Recommendation**: Remove `COPY` of `.key` files. Mount certificates at runtime via `--volume` or Docker secrets. If build-time embedding is unavoidable, use multi-stage builds with `--mount=type=secret` and ensure keys never appear in any layer.

### Finding 2
- **Finding ID**: ROOT-CONTAINER
- **Observed Issue**: No `USER` directive; container process runs as root.
- **Severity**: medium
- **Evidence**: Absence of any `USER` instruction in the 16-line Dockerfile.
- **Related Control / Principle**: Least privilege — containers should run as a non-root user.
- **Recommendation**: Create a dedicated non-root user (e.g., `RUN useradd -r samba && USER samba`) and verify Samba AD DC can operate under that user, or use rootless container runtimes.

### Finding 3
- **Finding ID**: APT-CACHE-NOT-CLEANED
- **Observed Issue**: `apt-get update` and `apt-get install` are not followed by cache cleanup, inflating image size and attack surface.
- **Severity**: low
- **Evidence**: `RUN DEBIAN_FRONTEND=noninteractive apt-get update -qqy && apt-get install -qqy winbind samba ldap-utils` — no `rm -rf /var/lib/apt/lists/*`
- **Related Control / Principle**: Minimize image footprint.
- **Recommendation**: Append `&& rm -rf /var/lib/apt/lists/*` to the same `RUN` layer.

### Finding 4
- **Finding ID**: NO-HEALTHCHECK
- **Observed Issue**: No `HEALTHCHECK` instruction to monitor Samba AD DC liveness.
- **Severity**: low
- **Evidence**: No `HEALTHCHECK` directive present in the Dockerfile.
- **Related Control / Principle**: Container observability / operational readiness.
- **Recommendation**: Add `HEALTHCHECK CMD ldapsearch -x -H ldap://localhost -b "" -s base "(objectClass=*)" || exit 1` (or equivalent Samba-specific probe).

### Finding 5
- **Finding ID**: SHELL-AS-PID1
- **Observed Issue**: CMD uses `/bin/sh -c "..."` as PID 1, which does not forward signals properly to child processes.
- **Severity**: low
- **Evidence**: `CMD ["/bin/sh", "-c", "/fixture/provision/installsmb.sh && service samba-ad-dc restart && echo Samba started && sleep infinity"]`
- **Related Control / Principle**: Graceful shutdown / proper signal handling in containers.
- **Recommendation**: Use `tini` or `dumb-init` as the entrypoint, or restructure so `samba-ad-dc` runs as PID 1 directly with `exec` in a shell script.

## Final Risk Overview

| Finding ID | Severity |
|---|---|
| CERT-IN-IMAGE | high |
| ROOT-CONTAINER | medium |
| APT-CACHE-NOT-CLEANED | low |
| NO-HEALTHCHECK | low |
| SHELL-AS-PID1 | low |

**Overall Risk**: **Medium-High**, driven primarily by private key material embedded in image layers. For a test fixture this is partially mitigated by limited exposure, but the pattern should not be adopted in production Dockerfiles.