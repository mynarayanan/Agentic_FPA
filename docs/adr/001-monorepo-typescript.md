# ADR-001: TypeScript monorepo on Vercel

Status: accepted

Context: The app is hosted on Vercel, which does not run Streamlit or long-lived Python servers.
Decision: pnpm workspace monorepo, Next.js (App Router) for UI and API routes, TypeScript for the engine, one language end to end.
Consequences: Shared Zod contracts between engine, LLM layer and UI. Python is not used. Packages are source-only and transpiled by Next (`transpilePackages`).
