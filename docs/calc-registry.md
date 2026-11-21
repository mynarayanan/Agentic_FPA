# Calculation registry (generated)

> Generated from `packages/engine/src/registry.ts` by `pnpm docs:generate`. CI fails if this file is stale.

| ID | Name | Formula | Inputs | Version | Methodology |
|---|---|---|---|---|---|
| VAR-REV-001 | Revenue variance | `actual_revenue - budget_revenue` | actual_revenue (INR); budget_revenue (INR) | 1.0.0 | docs/methodology.md#revenue-variance |
| VAR-FAV-001 | Variance favourability | `REVENUE: variance >= 0; COGS/OPEX: variance <= 0` | account_type; variance (INR) | 1.0.0 | docs/methodology.md#favourability |
| VAR-REV-002 | Revenue bridge (timing, price, volume, mix) | `timing + price + volume + mix = actual_revenue - budget_revenue` | budget sales lines; actual sales lines (matched on line_key) | 1.0.0 | docs/methodology.md#revenue-bridge |
| VAR-PNL-001 | Operating profit | `revenue - other_operating_costs - operating_expenses` | GL rows (one version and period selection); account types | 1.0.0 | docs/methodology.md#operating-profit |
| VAR-OPX-001 | Variance by account | `actual - budget per account; bps = round(variance / budget x 10000)` | actual GL rows; budget GL rows; account types | 1.0.0 | docs/methodology.md#variance-by-account |
| ALC-INT-001 | Exact integer allocation | `largest-remainder split of an integer total across weights; parts sum exactly to the total` | total (INR); weights | 1.0.0 | docs/methodology.md#allocation |
| ACT-IMP-001 | Corrective action impact assessment | `profit_gross - overlap_haircut -> x confidence -> x phasing -> - implementation_cost` | actions (kind, potential, timeline, cost, overlap, confidence); operating profit variance; assessment parameters | 1.0.0 | docs/methodology.md#action-impact-assessment |
| FCS-CMP-001 | Forecast version comparison and driver attribution | `latest - previous = sum of drivers, reconciled month by month` | monthly revenue by version; forecast bridge rows; last closed month | 1.0.0 | docs/methodology.md#forecast-change-attribution |
| SCN-WHI-001 | What-if scenario on the latest forecast | `volume, price, material-cost and opex shocks applied to the remaining months` | actuals to date; remaining forecast by cost line; shocks in basis points | 1.0.0 | docs/methodology.md#what-if-scenario |
