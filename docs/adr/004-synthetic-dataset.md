# ADR-004: Seeded synthetic dataset with planted truths

Status: accepted

Decision: `data/generator` produces 19 tables deterministically (seed 20261115). The November 2026 CFO scenario and the forecast bridge are planted exactly; everything else is random but constrained to tie out. Fixtures and golden files are committed; `pnpm data:check` fails CI if they drift from the generator.
Consequences: Tests can assert exact numbers. Synthetic data is cleaner than real data, so real anonymised extracts should replace it for the pilot.
