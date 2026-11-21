# Methodology v0.1 (accepted as drafted for the POC; formal sign-off pending)

> This document is the source of truth. Code implements it; tests cite it. **Nothing here is approved until the Finance owner signs off** (record the date and name at the bottom). The synthetic dataset was built against these definitions.

## Conventions

- Currency INR, stored as integer rupees. 1 crore = 10,000,000.
- FY27 = April 2026 to March 2027. Actuals are closed to November 2026.
- Variance = Actual - Budget (or Actual - Previous forecast). Sign is mathematical, not "good/bad".

## Revenue variance

VAR-REV-001: `actual_revenue - budget_revenue`.

## Favourability

VAR-FAV-001: revenue variance >= 0 is favourable; cost variance <= 0 is favourable.

## Revenue bridge

Computed per sales line (customer x SKU), for lines that were delivered in the period:

- **Timing**: lines whose delivery slipped out of the period: `actual - budget` (actual is zero). Reported separately, never mixed into volume.
- **Price**: `net_actual - quantity_actual x budget_price` (equals minus the invoice discount).
- **Volume + mix** (combined): `(quantity_actual - quantity_budget) x budget_price`.
- **Volume** (pure): per business unit, `(total_qty_actual - total_qty_budget) x average_budget_price` at the budgeted mix, rounded to the nearest rupee.
- **Mix**: volume+mix minus pure volume (residual, so the bridge always sums exactly).
- **Entity and drill-down views are slices of the group bridge.** Pure volume uses an average price, so recomputing it inside each entity would give numbers that do not add up to the group. The bridge is therefore computed once for the whole group and entity views are filtered cells of it. Timing, price and total variance are additive either way; volume and mix are additive only with this rule.
- Entity split of pure volume: the business-unit volume effect is allocated across entities in proportion to each entity's absolute volume+mix effect (largest remainder, entities in alphabetical order). If those are all zero, it is allocated in proportion to budget revenue.
- **FX**: translation effect of rate changes on overseas revenue. In November 2026 the actual rate equals the budget rate by design, so FX is zero.

OPEN QUESTIONS for the Finance owner: is business unit the right grain for the volume/mix split (vs product family)? Should discounts below a threshold count as price?

## Forecast change attribution

Drivers: DEMAND (price, volume, mix, outlook), FX (rate), ORDER_DELAY (timing, slippage). Each forecast change is attributed to a driver at entity x business unit x period grain; drivers must sum to the version difference exactly.

## Variance by account

VAR-OPX-001: per account `actual - budget`; `variance_bps = round_half_up(variance / budget x 10,000)`, null when the budget is zero. Listed by largest absolute variance first.

## Allocation

ALC-INT-001: integer totals are split with the largest-remainder method on weights rounded to 3 decimals; ties go to the lower index. Parts always sum exactly to the total.

## Operating profit

Revenue - other operating costs (accounts 5000-5300) - operating expenses (accounts 6100-6800).

## Action impact assessment

ACT-IMP-001. A proposed action's headline "potential" is not its value. Steps, in order, all in integer rupees (round half up):

1. **Express as profit.** Timing recoveries (recovered revenue) are converted at the standard margin of the product concerned (default 36% = Industrial Equipment 300). Savings and margin actions are already profit. Recovered revenue is flagged _not incremental_: it is pulled from the next year, not new demand.
2. **Overlap.** An action that declares `overlaps_with` another action in the portfolio gives up a share of its profit (default 50%) so the same benefit is not counted twice.
3. **Confidence.** Multiply by the confidence weight (default HIGH 90%, MEDIUM 70%, LOW 40%).
4. **Phasing.** Benefits start `ceil(timeline_days / 30)` months after the decision period. The in-year share is the months from that start to the financial year end, divided by the months remaining after the decision (capped at 100%).
5. **Implementation cost** is deducted in the year.
   `potential_inr` is defined as the benefit over the remaining forecast horizon at full realisation. Recurring actions are flagged as continuing next year but no next-year amount is estimated. Portfolio coverage = net in-year profit / operating-profit shortfall.
   **All parameters above are assumptions, not Finance policy. They need sign-off.**

## Approval workflow

Three levels: (1) AI proposes; (2) a finance business partner or finance manager validates; (3) a controller or CFO authorises. Only AUTHORISED items may flow to the official EPM process, and nothing is written to EPM by this system.

- **Segregation of duties.** The AI agent, the person who requested the recommendation, anyone who modified the current revision, and the validator can never validate or authorise it.
- **Delegation of authority.** Items above the controller limit (default 2 Cr) need the CFO to authorise.
- **Override.** Reject and modify require a justification of at least 10 characters. Modifying changes the amount, starts a new revision and returns the item to level 1.
- **Audit.** Every event is appended to a hash-chained log; events cannot be updated or deleted.

## What-if scenario

SCN-WHI-001 applies shocks (basis points) to the **months still to come** in the latest forecast; actuals to date never change.

- **Volume** scales revenue, direct materials and freight proportionally. Direct labour, manufacturing overheads and operating expenses are fixed.
- **Price** changes revenue only, applied after volume. **Material cost** inflation applies to the volume-adjusted materials cost. **Opex** shock scales operating expenses.
- **Operating profit is used as the EBITDA proxy.** The data has no depreciation or amortisation. **Cash flow is not modelled.**
- Shocks are limited to +/-50%. The variable-versus-fixed split above is an assumption awaiting Finance sign-off.

## Sign-off

Approved by: ____________ Date: ________
