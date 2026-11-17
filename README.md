# fpa-ai - AI-powered FP&A proof of concept

Deterministic financial engine + LLM narratives + governed approvals, on a synthetic dataset. See `docs/`.

## Quick start

```bash
pnpm install
pnpm test            # all unit, property and dataset-integrity tests
pnpm data:generate   # regenerate fixtures (only if the generator changed)
pnpm --filter @fpa/web dev
```

## Layout

- `apps/web` Next.js UI and API routes
- `packages/engine` pure calculations (no I/O; enforced by ESLint)
- `packages/semantic` Zod schemas and a typed CSV reader for every table
- `packages/db` Drizzle schema, migrations, transactional loader, reconciliation checks and queries (see `docs/runbook-neon.md`)
- `packages/narrative` fact sheet, prompts, LLM client, number-guard and template fallback (`docs/narrative-rules.md`)
- `packages/audit` approval state machine and decision log (Sprint 5)
- `data/generator` seeded synthetic data generator and tests; `data/fixtures` CSVs; `data/golden` expected values
- `docs/` methodology, ADRs, assumptions, generated calc registry and data dictionary

## Vercel

Import the repo, set **Root Directory** to `apps/web` (keep "Include source files outside of the Root Directory" on). Set `DATABASE_URL` (Neon) and, for model-written narratives, `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`). The homepage fetches `/api/narrative` for the selected period and entity and displays the narrative, supporting facts, and calculation references. The API requires `DATABASE_URL`; without an Anthropic key, it returns the deterministic template narrative.
