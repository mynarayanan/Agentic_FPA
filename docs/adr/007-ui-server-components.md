# ADR-007: Server-rendered screens over presentational views

Status: accepted

Decision:

1. Each page is a thin server component: read data with a loader (`lib/loaders.ts`), pass it to a presentational view (`components/*View.tsx`).
2. Views take plain data and render it. They contain no data access, so they are tested by rendering them against the real data layer (an in-process Postgres) and asserting on the text and structure a person would see.
3. Only genuinely interactive parts are client components: the what-if sliders, approval actions, the assistant chat, the AI rewrite button and the token field.
4. Formatting and chart geometry are pure functions in `lib/`, unit-tested with property tests (for example, the UI number formatter must never disagree with the narrative formatter).
5. Charts are hand-written SVG (no chart library): small, accessible, and testable.
6. Client components import only types from `@fpa/narrative` and `@fpa/db`, never runtime code, so Node-only modules stay out of the browser bundle.

Consequences: Most of the UI is covered by fast tests with no browser. Browser behaviour (clicks, slider events) is covered by the Playwright specs, which run in CI against a build and against deployed previews.
