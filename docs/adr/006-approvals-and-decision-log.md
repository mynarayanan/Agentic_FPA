# ADR-006: Approvals as a pure state machine over a hash-chained, append-only log

Status: accepted

Decision:

1. Approval rules live in `@fpa/audit` as a pure function `(state, event) -> state | refusal`. No database, no clock, no I/O, so every rule is unit-tested and property-tested.
2. State is never trusted from a column. The authoritative record is the event log; current state is obtained by replaying it through the same rules. The `recommendation.status` column is a cache, and `verify` flags any disagreement.
3. Each event stores the hash of the previous event and a hash of its own content (SHA-256). Editing, deleting, reordering or inserting any event is detected.
4. Postgres triggers block UPDATE, DELETE and TRUNCATE on `approval_event`, so history cannot be silently rewritten even by direct SQL.
5. Audit tables hold plain-text references to reference data (no foreign keys), so reloading reference data can never orphan or cascade-delete history.
6. Writes happen in one transaction with a row lock on the recommendation: replay, validate, append, update.
7. Write endpoints are disabled unless `API_WRITE_TOKEN` is set and require a bearer token.

Consequences: Approvals are tamper-evident, not tamper-proof: someone with full database ownership could rewrite the entire chain consistently (assumption A25). Identity is asserted by the caller, not authenticated (A19), so segregation of duties is only as strong as the identity layer that will replace it.
