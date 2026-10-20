# Security boundaries

[Português (Brasil)](SECURITY.pt-BR.md)

- No credentials are embedded. Startup requires a 32–256 character printable
  ASCII API key without spaces. Generate it randomly; length alone is not entropy.
- All business routes require `X-API-Key`; comparison is constant-time.
  One key authorizes access to the entire database.
- The server binds to loopback in documented commands. Put TLS, rate limits,
  request timeouts and an appropriate identity gateway in front of shared use.
- Strict CSV schemas reject formula-like identifiers, invalid amounts, unknown
  currencies, duplicate IDs and malformed records. SQL values are parameterized.
- HTTP input is bounded even for chunked or understated-length bodies.
  Compressed request bodies are rejected. Errors do not echo submitted records.
- JSON/CSV responses disable caching. CSV cells contain validated identifiers,
  fixed status strings or numbers. No arbitrary free-text formulas are exported.
- Local CLI access bypasses API authentication by design. Protect the database,
  backups and source exports with operating-system access controls and encryption.
  This project does not modify ACLs or provide encryption at rest.
- Immutability triggers are safeguards, not protection against the database owner.
- Runtime databases, `.env`, private-key files, caches and dependencies are ignored.
  Review Git history as well as the working tree before publishing.

Pending: dependency advisory check, backup/restore exercise, request timeouts at
deployment boundary, rate limiting, key rotation workflow, least-privilege
authorization and an independent security review. Do not submit real card or
customer details; the schema needs only business identifiers and amounts.
