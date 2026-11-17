# ADR-002: The LLM never does financial math

Status: accepted

Decision: `packages/engine` is pure and deterministic. ESLint forbids network, DB, LLM, React and Next imports plus `Date`, `Math.random` and `fetch` there. The LLM receives only calculated outputs and its narrative is checked by a number-guard (Sprint 3).
Consequences: Every figure is reproducible and traceable to a calc ID in `docs/calc-registry.md`.
