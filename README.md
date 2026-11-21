# fpa-ai - AI-powered FP&A proof of concept

Deterministic financial engine + LLM narratives + governed approvals, on a synthetic dataset. See `docs/`.

## Quick start

```bash
pnpm install
pnpm test            # all unit, property and dataset-integrity tests
pnpm data:generate   # regenerate fixtures (only if the generator changed)
pnpm dev:db            # optional: local in-memory Postgres, no Neon needed (see docs/ui.md)
pnpm --filter @fpa/web dev
```

## Layout

- `apps/web` the five screens and API routes (`docs/ui.md`)
- `packages/engine` pure calculations (no I/O; enforced by ESLint)
- `packages/semantic` Zod schemas and a typed CSV reader for every table
- `packages/db` Drizzle schema, migrations, transactional loader, reconciliation checks and queries (see `docs/runbook-neon.md`)
- `packages/narrative` fact sheet, prompts, LLM client, number-guard and template fallback (`docs/narrative-rules.md`)
- `packages/audit` approval state machine, delegation and segregation-of-duties rules, hash-chained log (`docs/runbook-approvals.md`)
- `data/generator` seeded synthetic data generator and tests; `data/fixtures` CSVs; `data/golden` expected values
- `docs/` methodology, ADRs, assumptions, generated calc registry and data dictionary

## Vercel

Import the repo, set **Root Directory** to `apps/web` (keep "Include source files outside of the Root Directory" on). Set `DATABASE_URL` (Neon) and, for model-written narratives, `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`). Without a key, `/api/narrative` returns the deterministic template narrative. Approval writes stay disabled until `API_WRITE_TOKEN` is set.
