# Runbook: Neon database

## One-time setup

1. In Vercel: **Storage > Create Database > Neon (Marketplace)**, connect it to this project. Vercel adds `DATABASE_URL` (and related variables) to the project's environment variables.
2. Copy the connection string (Neon console > Connection details, **pooled** or direct, with `sslmode=require`) into a local `.env` as `DATABASE_URL=...` (never commit it).

## Load the synthetic data

```bash
export DATABASE_URL="postgres://...?sslmode=require"
pnpm db:migrate      # create tables (idempotent)
pnpm db:load         # TRUNCATES all 19 tables, reloads in one transaction, then reconciles
pnpm db:verify       # re-run the reconciliation checks any time
```

`db:load` is all-or-nothing: if any row fails, the previous data stays intact. It refuses to run without `--yes` (built into the script). **Point it only at a database dedicated to this POC.**

## Check the API

`GET /api/variance?period=2026-11` returns the engine's P&L variance, account variances and revenue bridge. Add `&entity=E-IN` for an entity slice. A `503` means `DATABASE_URL` is not set for that environment (set it for Preview and Production in Vercel).

## Changing the schema

Edit `packages/db/src/schema.ts` and `packages/semantic/src/tables.ts` together, run `pnpm db:generate`, commit the new migration. CI fails if a schema change has no migration, or if the database columns differ from the Zod contract.

## Notes

- Preview deployments share whatever `DATABASE_URL` is configured for the Preview environment. Use a Neon branch per environment if you want isolation.
- The web app uses the Neon HTTP driver (read-only, per request). Loads use a direct TCP connection from your machine.
