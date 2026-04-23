## Executive Summary

The Dockerfile at `/home/aggerio/temp/opencode/samples/bench50/opa/wasm/Dockerfile` is a development/build image for compiling WebAssembly tooling (wabt, binaryen) with LLVM 21. Several security concerns were identified: deprecated and insecure GPG key handling, absence of a non-root user, lack of multi-stage builds leaving build tooling in the final image, and source cloning without commit pinning. The image appears intended for development rather than production, but the findings should still be addressed to reduce supply-chain and privilege-escalation risk.

## Findings

### Finding 1
- Finding ID: `insecure-gpg-key`
- Observed Issue: GPG key is fetched via `curl` and piped directly into `apt-key add` without integrity verification. `apt-key` is also deprecated.
- Severity: high
- Evidence: `RUN curl -L https://apt.llvm.org/llvm-snapshot.gpg.key | apt-key add -` (line 11)
- Related Control / Principle: Secure supply chain — verify artifact integrity before installation
- Recommendation: Download the key to a file, verify its fingerprint, and place it in `/etc/apt/trusted.gpg.d/` or use `signed-by` in the sources list entry. Example: `curl -fsSL https://apt.llvm.org/llvm-snapshot.gpg.key -o /etc/apt/trusted.gpg.d/llvm.gpg`

### Finding 2
### Finding 2
- Finding ID: `no-nonroot-user`
- Observed Issue: No `USER` directive is present; the container runs as root by default.
- Severity: medium
- Evidence: No `USER` instruction in the entire Dockerfile (lines 1–50)
- Related Control / Principle: Least privilege — containers should not run as root
- Recommendation: Add a non-root user and switch to it before `WORKDIR`, e.g., `RUN useradd -m builder && USER builder`

### Finding 3
- Finding ID: `no-multi-stage-build`
- Observed Issue: All build dependencies (cmake, clang, git, make, build-essential) and source trees (wabt, binaryen) remain in the final image.
- Severity: medium
- Evidence: Single `FROM ubuntu:24.04` with `RUN apt-get install -y curl git build-essential ...` (line 7) and no subsequent `FROM` stage
- Related Control / Principle: Minimal attack surface — production images should contain only runtime artifacts
- Recommendation: Use a multi-stage build; compile in a builder stage and copy only the resulting binaries (`wasm-opt`, `wasm-dis`, `wasm-as`, `wabt` tools) into a minimal runtime image

### Finding 4
- Finding ID: `unpinned-source-clones`
- Observed Issue: Git clones use branch/tag references (`$WABT_VERSION`, `$BINARYEN_VERSION`) rather than immutable commit hashes, allowing mutable tag changes to alter build output.
- Severity: low
- Evidence: `git checkout $WABT_VERSION` (line 34); `git checkout $BINARYEN_VERSION` (line 40)
- Related Control / Principle: Reproducible builds — pin dependencies to immutable references
- Recommendation: Replace ARG version tags with explicit commit SHAs, e.g., `git checkout <sha256-commit>`

### Finding 5
- Finding ID: `no-image-digest-pinning`
- Observed Issue: The base image `ubuntu:24.04` is pinned by digest, which is good, but the `ARG` tool versions lack checksum verification of downloaded artifacts.
- Severity: low
- Evidence: `FROM ubuntu:24.04@sha256:80dd3c3b9c6cecb9f1667e9290b3bc61b78c2678c02cbdae5f0fea92cc6734ab` (line 1); no checksum verification for git clone contents
- Related Control / Principle: Supply chain integrity — verify downloaded artifacts
- Recommendation: Add SHA256 checksum verification after cloning, or use `git clone` with a known commit and verify via `git verify-commit`

### Finding 6
- Finding ID: `deprecated-apt-key`
- Observed Issue: `apt-key` is deprecated and will be removed in future Debian/Ubuntu releases; its use is a security anti-pattern because it globally trusts all packages signed by that key.
- Severity: medium
- Evidence: `apt-key add -` (line 11)
- Related Control / Principle: Secure package management — use per-repository keyring scoping
- Recommendation: Use `signed-by` in the `deb` line (line 9): `deb [signed-by=/etc/apt/keyrings/llvm.gpg] http://apt.llvm.org/noble/ llvm-toolchain-noble-21 main`

## Final Risk Overview

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 1     |
| Medium   | 3     |
| Low      | 2     |

**Overall Risk: Medium**

The most pressing issue is the insecure GPG key handling (Findings 1 & 6), which could allow a man-in-the-middle to inject malicious packages during the LLVM toolchain installation. Running as root and retaining full build tooling in the image increase the blast radius if the container is compromised. For a development/build image these risks are partially acceptable, but pinning sources, using multi-stage builds, and dropping root privileges should be prioritized.