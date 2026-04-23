## Security Audit Report: Apache Kafka Repository

---

## Executive Summary

This audit examines the Apache Kafka repository (`samples/bench50/kafka`) for security controls and misconfigurations. The codebase provides comprehensive security features (SSL/TLS, SASL authentication, ACLs, OAuth2, Kerberos), but **default configurations and example deployments contain multiple security weaknesses** including plaintext communication defaults, hardcoded test credentials, disabled hostname verification, and exposed JMX endpoints. The repository is suitable as a source code reference but requires hardening before production deployment.

---

## Findings

### Finding 1: Plaintext Communication Enabled by Default
- **Finding ID**: KAFKA-01
- **Observed Issue**: Default `server.properties` and `docker/server.properties` configure listeners as `PLAINTEXT://:9092` with `inter.broker.listener.name=PLAINTEXT`. No encryption or authentication is enabled in default configurations.
- **Severity**: high
- **Evidence**: `config/server.properties:37` — `listeners=PLAINTEXT://:9092,CONTROLLER://:9093` and line 40 — `inter.broker.listener.name=PLAINTEXT`
- **Related Control / Principle**: ISO-12.3 Cryptographic Controls (12.3.1 Policy on the use of cryptographic controls)
- **Recommendation**: Default to SSL or SASL_SSL listeners in production configurations. Document plaintext usage as development-only.

---

### Finding 2: Hardcoded Credentials in Test/Example Files
- **Finding ID**: KAFKA-02
- **Observed Issue**: SSL credential files contain hardcoded passwords that are committed to the repository.
- **Severity**: critical
- **Evidence**: `docker/test/fixtures/secrets/client-ssl.properties:18-21`:
  ```
  ssl.truststore.password=abcdefgh
  ssl.keystore.password=abcdefgh
  ssl.key.password=abcdefgh
  ```
- **Related Control / Principle**: ISO-12.4 Security of System Files (12.4.3 Access control to program source code); ISO-12.3.2 Key management
- **Recommendation**: Remove hardcoded credentials from version control. Use environment variables, secret management systems, or generate credentials at deployment time.

---

### Finding 3: SSL Hostname Verification Disabled
- **Finding ID**: KAFKA-03
- **Observed Issue**: SSL docker-compose examples disable endpoint identification, allowing man-in-the-middle attacks.
- **Severity**: high
- **Evidence**: `docker/examples/docker-compose-files/single-node/ssl/docker-compose.yml:49` — `KAFKA_SSL_ENDPOINT_IDENTIFICATION_ALGORITHM: ""`
- **Related Control / Principle**: ISO-12.3 Cryptographic Controls; ISO-12.2.4 Output data validation
- **Recommendation**: Set `KAFKA_SSL_ENDPOINT_IDENTIFICATION_ALGORITHM` to `HTTPS` or remove the empty override to enable hostname verification.

---

### Finding 4: No Authorization Enabled by Default
- **Finding ID**: KAFKA-04
- **Observed Issue**: Default configurations do not enable any authorizer (`authorizer.class.name` is absent). Any authenticated or unauthenticated client has full access.
- **Severity**: high
- **Evidence**: `config/server.properties` — no `authorizer.class.name` property present. Security documentation exists (`docs/security/authorization-and-acls.md`) but is not enforced by default.
- **Related Control / Principle**: ISO-12.4.3 Access control to program source code; ISO-ISOIEC270012022e-002 (Context of the organization — access management)
- **Recommendation**: Enable `KafkaAuthorizer` by default with least-privilege ACLs. Provide secure baseline configurations.

---

### Finding 5: JMX Exposed Without Authentication
- **Finding ID**: KAFKA-05
- **Observed Issue**: Docker test configurations expose JMX ports without evidence of authentication controls.
- **Severity**: medium
- **Evidence**: `docker/test/fixtures/mode/combined/docker-compose.yml:45-46` — `KAFKA_JMX_PORT: 9101` and `KAFKA_JMX_HOSTNAME: localhost` with no JMX authentication properties configured.
- **Related Control / Principle**: ISO-12.4 Security of System Files (12.4.1 Control of operational software)
- **Recommendation**: Enable JMX authentication and SSL. Restrict JMX access to monitoring networks only.

---

### Finding 6: Secrets Not Excluded from Version Control
- **Finding ID**: KAFKA-06
- **Observed Issue**: `.gitignore` does not exclude credential files, keystore files, or truststore files. Secret files exist in `docker/test/fixtures/secrets/` and `docker/examples/fixtures/secrets/`.
- **Severity**: medium
- **Evidence**: `.gitignore` — no patterns for `*.jks`, `*.p12`, `*_creds`, `keystore`, or `truststore`. Files like `docker/test/fixtures/secrets/kafka_ssl_key_creds` are tracked.
- **Related Control / Principle**: ISO-12.4.3 Access control to program source code; ISO-12.3.2 Key management
- **Recommendation**: Add patterns to `.gitignore` for credential and keystore files. Use git-crypt or similar for necessary test secrets.

---

### Finding 7: Log Directory in World-Readable /tmp
- **Finding ID**: KAFKA-07
- **Observed Issue**: Default log directory is `/tmp/kraft-combined-logs`, which is typically world-readable on Unix systems.
- **Severity**: medium
- **Evidence**: `config/server.properties:73` — `log.dirs=/tmp/kraft-combined-logs`
- **Related Control / Principle**: ISO-12.4 Security of System Files
- **Recommendation**: Use a dedicated directory with restricted permissions (e.g., `/var/lib/kafka-logs` with `700` permissions).

---

### Finding 8: Insufficient Replication for Internal Topics
- **Finding ID**: KAFKA-08
- **Observed Issue**: Internal topics use replication factor of 1, risking data loss and single points of failure for offset, transaction, and share coordinator state.
- **Severity**: medium
- **Evidence**: `config/server.properties:87-91`:
  ```
  offsets.topic.replication.factor=1
  transaction.state.log.replication.factor=1
  transaction.state.log.min.isr=1
  ```
- **Related Control / Principle**: ISO-ISOIEC270012022e-002 (Scope — availability requirements)
- **Recommendation**: Set replication factor to 3 and `min.isr` to 2 for production deployments.

---

## Final Risk Overview

| Risk Category | Severity | Count |
|---|---|---|
| Credential Exposure | Critical | 1 |
| Insecure Defaults (Plaintext, No AuthZ) | High | 3 |
| Operational Security (JMX, /tmp, Replication) | Medium | 3 |
| Version Control Hygiene | Medium | 1 |

**Overall Risk Assessment**: **High**. While Kafka provides robust security mechanisms (SSL/TLS, SASL, OAuth2, Kerberos, ACLs), the default and example configurations prioritize ease-of-use over security. Production deployments require explicit hardening. The presence of hardcoded credentials in committed files is the most critical finding.