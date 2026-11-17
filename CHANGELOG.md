# Changelog

## [Unreleased]

### Sprint 4 - narrative layer

- `@fpa/narrative`: closed fact sheet, placeholder rendering, number-guard, one corrective retry, guarded template fallback, Anthropic client, `eval:live` script.
- Engine 0.3.0: `buildVarianceReport` (pure report assembly); the database layer now uses it.
- `GET /api/narrative?period=&entity=` returns a guarded narrative with facts and calc references; works without an API key (template).
- Property tests found and fixed two bugs: zero-variance template citation, and year-like amounts being ignored by the guard.

### Sprint 3 - database and loader

- `@fpa/db`: Drizzle schema for 19 tables with PK/FK constraints, generated SQL migration, all-or-nothing loader, 30+ post-load reconciliation checks, CLI (`db:migrate`, `db:load`, `db:verify`).
- `GET /api/variance?period=&entity=` serves engine results from the database.
- Engine 0.2.1: `bridgeForEntity` makes entity drill-downs slices of the group bridge so volume and mix add up (assumption A14).
- CI fails on schema changes without a migration.

### Sprint 2 - variance engine

- Engine 0.2.0: VAR-REV-002 revenue bridge, VAR-PNL-001 operating profit, VAR-OPX-001 variance by account, ALC-INT-001 allocation.
- Golden tests recompute the November 2026 scenario from the committed CSVs and match every planted entity x BU x driver row.
- `@fpa/semantic` gains a typed CSV parser; the generator shares the engine's allocation.
- Methodology v0.1 accepted as drafted for the POC.

### Added

- Sprint 0: monorepo (pnpm), CI, engine with VAR-REV-001 and VAR-FAV-001, semantic Zod schemas, web smoke page.
- Synthetic FP&A dataset v1.0.0 (19 tables, FY27) with golden values and integrity tests.
