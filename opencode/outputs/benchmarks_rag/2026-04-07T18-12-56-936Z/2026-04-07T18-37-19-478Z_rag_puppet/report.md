## Executive Summary

A security audit of the Puppet configuration management project (v8.11.0) repository was performed against available ISO/IEC 27001:2022 controls. The project demonstrates several positive security practices including CI-based static analysis, Mend vulnerability scanning, least-privilege CI permissions, and CODEOWNERS-based review gating. However, notable concerns include a dynamic `eval()` invocation in the Gemfile, an installation script with hardcoded system paths and shell command execution, and no evidence of automated dependency update mechanisms. Overall risk is assessed as **medium**, with one high-severity finding.

## Findings

### Finding 1
- Finding ID: DYN-EVAL-GEMFILE
- Observed Issue: The Gemfile executes arbitrary Ruby code from a local file if present.
- Severity: high
- Evidence: `Gemfile` line 83: `eval(File.read("#{__FILE__}.local"), binding)` — evaluates arbitrary code from `Gemfile.local` with full binding context.
- Related Control / Principle: ISO-ISO27001pdf-012 (10.4 Protection Against Malicious and Mobile Code); 12.5.3 Restrictions on changes to software packages
- Recommendation: Replace `eval()` with a declarative merge strategy (e.g., `instance_eval` with a restricted sandbox, or structured config file parsing such as YAML/JSON). If local overrides are required, validate and restrict the allowed directives.

### Finding 2
- Finding ID: SYS-PATHS-INSTALL
- Observed Issue: The installation script hardcodes system-wide paths and executes shell commands without input sanitization.
- Severity: medium
- Evidence: `install.rb` lines 201, 216, 224, etc. hardcode paths like `/usr/bin`, `/etc/puppetlabs/puppet`, `/opt/puppetlabs/puppet/cache`. Line 88-90: `%x{which gzip}` and `%x{#{gzip} -f #{omf}}` execute shell commands. Line 51: `git describe --tags --dirty --abbrev=7` in Rakefile.
- Related Control / Principle: ISO-ISO27001pdf-021 (12.5.1 Change control procedures); 12.5.3 Restrictions on changes to software packages
- Recommendation: Use parameterized path resolution with allowlists. Replace shell interpolation (`%x{...}`) with safe subprocess APIs that avoid shell injection (e.g., `Open3.capture3` with argument arrays). Validate all user-supplied `--*dir` options against a safe path prefix.

### Finding 3
- Finding ID: DEP-UPDATE-AUTOMATION
- Observed Issue: No evidence of automated dependency update or pinning mechanisms (e.g., Dependabot, Renovate) was found in the repository.
- Severity: medium
- Evidence: No `.github/dependabot.yml` or equivalent configuration found in `.github/`. The `.github/workflows/` directory contains only `backport.yml`, `checks.yaml`, `jira.yml`, `mend.yaml`, `rspec_tests.yaml`.
- Related Control / Principle: ISO-ISO27001pdf-021 (12.6.1 Control of technical vulnerabilities)
- Recommendation: Enable Dependabot or Renovate for automated dependency version pinning and security update PRs. Complement with the existing Mend scanning for post-merge vulnerability monitoring.

### Finding 4
- Finding ID: SECRET-MGMT-CI
- Observed Issue: CI workflows reference secrets but the secret rotation policy and access controls are not evidenced in the repository.
- Severity: low
- Evidence: `mend.yaml` lines 30-32 reference `${{ secrets.MEND_API_KEY }}` and `${{ secrets.MEND_TOKEN }}`. No evidence of secret rotation schedule, access review, or scoped permissions beyond standard GitHub secrets.
- Related Control / Principle: ISO-ISOIEC270012022e-005 (7.5 Documented information — control of documented information); 7.5.3 Control of documented information
- Recommendation: Document secret rotation policy in repository security documentation. Consider using OpenID Connect (OIDC) for cloud provider authentication instead of long-lived API keys where possible.

### Finding 5
- Finding ID: CI-PERMISSIONS-LEAST-PRIV
- Observed Issue: The `checks.yaml` workflow correctly applies least-privilege permissions; `mend.yaml` does not declare explicit permissions.
- Severity: low
- Evidence: `checks.yaml` line 11: `permissions: contents: read`. `mend.yaml` has no `permissions:` block, defaulting to repository-level permissions.
- Related Control / Principle: ISO-ISO27001pdf-012 (10.1.3 Segregation of duties)
- Recommendation: Add explicit `permissions:` block to `mend.yaml` restricting to the minimum required (e.g., `contents: read`).

### Finding 6
- Finding ID: CODE-REVIEW-GATING
- Observed Issue: CODEOWNERS file exists but branch protection rules are not evidenced in the repository configuration.
- Severity: low
- Evidence: `CODEOWNERS` file defines ownership: `* @puppetlabs/phoenix`, `/lib/puppet/pal @puppetlabs/bolt`, `/lib/puppet/application/module.rb @puppetlabs/modules`. No `.github/branch_protection` or equivalent evidence found.
- Related Control / Principle: ISO-ISO27001pdf-012 (10.1.3 Segregation of duties); 10.1.4 Separation of development, test, and operational facilities
- Recommendation: Ensure GitHub branch protection rules are configured to require CODEOWNERS review approval before merging. Document the branch protection policy.

## Final Risk Overview

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| Critical | 0 | — |
| High | 1 | DYN-EVAL-GEMFILE |
| Medium | 2 | SYS-PATHS-INSTALL, DEP-UPDATE-AUTOMATION |
| Low | 3 | SECRET-MGMT-CI, CI-PERMISSIONS-LEAST-PRIV, CODE-REVIEW-GATING |

**Positive controls observed:**
- Mend vulnerability scanning on push to main (`mend.yaml`) — aligns with 12.6.1 Control of technical vulnerabilities.
- CI static analysis via RuboCop and Ruby warnings (`checks.yaml`) — supports code quality and change control (12.5.1).
- Least-privilege CI permissions in `checks.yaml` (`permissions: contents: read`).
- CODEOWNERS-based review routing supports segregation of duties (10.1.3).
- Apache-2.0 license clearly declared in `puppet.gemspec`.

**Key remediation priority:** Address the `eval()` call in `Gemfile` (DYN-EVAL-GEMFILE) as the highest-risk item, followed by enabling automated dependency updates and hardening the install script against shell injection.