## Executive Summary

The `log4j2.yaml` configuration for the Kafka Trogdor test resources contains logging configuration with an overly verbose root logger level and lacks log persistence controls. The configuration is minimal, using only a console appender with no file output, rotation, or sensitive data filtering.

## Findings

### Finding 1
- Finding ID: LOG-001
- Observed Issue: Root logger set to TRACE level, which may capture and expose sensitive data including credentials, tokens, and PII in console output
- Severity: medium
- Evidence: `Root: level: TRACE`
- Related Control / Principle: Least Privilege Logging / Sensitive Data Protection
- Recommendation: Reduce root logger to INFO or WARN for production/test environments; use DEBUG/TRACE only during active debugging sessions

### Finding 2
- Finding ID: LOG-002
- Observed Issue: No file appenders configured — logs are not persisted, eliminating audit trail capabilities
- Severity: low
- Evidence: Only `Console` appender with `name: STDOUT` is defined; no `RollingFile` or `File` appenders present
- Related Control / Principle: Audit Logging / Log Retention
- Recommendation: Add a RollingFile appender with appropriate retention policy for test execution traceability

### Finding 3
- Finding ID: LOG-003
- Observed Issue: No sensitive data filtering or masking configured
- Severity: medium
- Evidence: No `RegexFilter`, `MarkerFilter`, or custom filter appenders defined; `PatternLayout` uses unfiltered `"[%d] %p %m (%c:%L)%n"`
- Related Control / Principle: Data Loss Prevention / Sensitive Data Handling
- Recommendation: Implement a filter to mask or suppress known sensitive patterns (credentials, secrets, tokens) from log output

## Final Risk Overview

| Risk Category | Level |
|---|---|
| Information Disclosure | medium |
| Audit Trail Gaps | low |
| Sensitive Data Leakage | medium |

Overall risk is **medium**. The primary concerns are the TRACE-level root logger and absence of sensitive data filtering, which together increase the likelihood of credential or secret exposure in console output. The lack of log persistence reduces forensic capability but is partially mitigated by this being a test-resource configuration rather than production.