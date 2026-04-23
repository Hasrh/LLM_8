Reviewing the Dockerfile for evidence-backed issues only. I’ll keep the report tied strictly to what is visible in the file.## Executive Summary
The Dockerfile shows two clear security concerns: private key material is baked into the image, and the container runs without an explicit non-root user. Package installation is also unpinned, which weakens build determinism and patch control.

## Findings
### Finding 1
- Finding ID: embedded-private-keys
- Observed Issue: Private key material is copied into the image build context and likely stored in image layers.
- Severity: high
- Evidence: `COPY smb/certs/ca.key /fixture/certs/ca.key` and `COPY smb/certs/key.pem /fixture/certs/key.pem`
- Related Control / Principle: secret handling / key management
- Recommendation: Do not bake private keys into the image; provide them at runtime via a secret store, mounted volume, or build-time secret mechanism.

### Finding 2
- Finding ID: root-runtime
- Observed Issue: The container has no `USER` directive, so it will run as root by default.
- Severity: medium
- Evidence: No `USER` instruction is present; the container starts with `CMD ["/bin/sh", "-c", "/fixture/provision/installsmb.sh && service samba-ad-dc restart && echo Samba started && sleep infinity"]`
- Related Control / Principle: least privilege
- Recommendation: Run the container as a non-root user where feasible, and isolate any privileged startup steps to the smallest possible scope.

### Finding 3
- Finding ID: unpinned-packages
- Observed Issue: System packages are installed without version pinning.
- Severity: medium
- Evidence: `RUN DEBIAN_FRONTEND=noninteractive apt-get update -qqy && \` followed by `apt-get install -qqy tzdata winbind samba ldap-utils`
- Related Control / Principle: supply-chain hardening / reproducible builds
- Recommendation: Pin package versions and use a controlled update process so the image does not silently change as repository contents change.

## Final Risk Overview
Overall risk is medium-high. The most significant issue is embedded private key exposure, followed by root execution and unpinned dependencies that reduce build integrity and operational control.