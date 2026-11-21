# The five screens

| Screen                 | Path         | What it answers                                                 | Where the numbers come from                                                                         |
| ---------------------- | ------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Finance cockpit        | `/`          | How are we doing, and what needs attention?                     | Variance report, forecast comparison, recommendations, audit check                                  |
| Variance investigation | `/variance`  | Why is a line off budget, and is it recurring?                  | P&L variance, revenue bridge (timing, price, volume, mix), account variances, monthly overrun trend |
| Forecast intelligence  | `/forecast`  | What changed in the forecast, and what if conditions get worse? | Forecast comparison (FCS-CMP-001), what-if model (SCN-WHI-001)                                      |
| Corrective actions     | `/actions`   | What should we do, what is it worth, who has approved it?       | Impact assessment (ACT-IMP-001), approval log                                                       |
| Finance assistant      | `/assistant` | Plain-language questions about the period                       | The same guarded narrative layer, routed by topic                                                   |

Period and entity selections are plain form fields, so they work without JavaScript and appear in the URL.

## Design rules

1. **The UI never calculates.** Every figure is formatted from an engine result. The only arithmetic in the web app is summing stored per-action assessments and formatting.
2. **Meaning is never colour alone.** Every verdict is also a word (Adverse, Favourable, Reduced), and every chart has a data table beside it.
3. **Charts say when the axis is cut.** Waterfalls and lines that do not start at zero state it under the chart.
4. **AI is optional and visible.** Narratives are rule-based by default; an AI rewrite needs the access token, is validated by the guard, and its status is shown.
5. **Provenance on every screen:** the calculation ids and versions behind the numbers.

## Running locally without Neon

```bash
pnpm install
pnpm dev:db                                   # terminal 1: in-memory Postgres with the fixtures loaded
# terminal 2 (PowerShell: set the variables with $env:NAME = "value")
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres PG_POOL_MAX=1 API_WRITE_TOKEN=local-dev-token pnpm --filter @fpa/web dev
```

The dev database is rebuilt on every start. `PG_POOL_MAX=1` is needed because the dev server accepts one connection at a time.

## The access token

Write actions (generating recommendations, approving) and AI rewrites need `API_WRITE_TOKEN` to be set on the server. Paste the same value into the field at the top right of the app. It is kept in the browser tab's session storage only. This is a proof-of-concept control, not user authentication.
