# Delivery record

[Português (Brasil)](COMMITS.pt-BR.md)

The Git log is the authoritative source for hashes and actual timestamps.
Entries describe completed milestones, not a fabricated day-by-day narrative.
Development used AI assistance. No claim of unaided authorship is made.

- `feat(clearledger): reconcile immutable settlement snapshots` — strict CSV
  imports, atomic/idempotent persistence, order and payout exceptions, split
  charges/refunds, provenance and 37 passing domain tests.
- `feat(clearledger): expose authenticated reconciliation API and CLI` —
  protected API, streaming upload limits, safe errors, CLI and exports,
  bilingual WIP documentation; 64 local tests pass. Real-server smoke testing
  and dependency advisory review remain pending at this milestone.
