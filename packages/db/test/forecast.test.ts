import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { runScenario } from '@fpa/engine';
import {
  controlsData,
  forecastData,
  forecastPayload,
  loadTables,
  overrunTrend,
  scenarioBase,
  scenarioPayload,
} from '../src';
import type { Db } from '../src';
import { readFixtures } from '../src/node';
import { createTestDb } from '../src/testing';

const CR = 10_000_000;
let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await loadTables(db, readFixtures(join(__dirname, '..', '..', '..', 'data')));
});
afterAll(async () => close());

describe('forecastData', () => {
  it('compares the versions from the database and reconciles the bridge', async () => {
    const f = await forecastData(db);
    expect(f.closed_through).toBe('2026-11');
    expect(f.comparison.full_year).toEqual({
      budget: 1200 * CR,
      previous: 1200 * CR,
      latest: 1150 * CR,
      prior_year: 1115 * CR,
    });
    expect(f.comparison.bridge).toMatchObject({
      reconciles: true,
      by_driver: { DEMAND: -25 * CR, FX: -10 * CR, ORDER_DELAY: -15 * CR },
    });
    expect(f.calc_refs).toEqual([{ id: 'FCS-CMP-001', version: '1.0.0' }]);
  });
  it('returns planner overrides and the demand assumptions that moved from 8% to 3%', async () => {
    const f = await forecastData(db);
    expect(f.planner_overrides).toHaveLength(4);
    expect(f.planner_overrides.every((o) => o.delta_inr < 0 && o.reason.length > 0)).toBe(true);
    const ie = f.demand_assumptions.find((d) => d.bu_id === 'BU-IE');
    expect(ie).toMatchObject({
      bu_name: 'Industrial Equipment',
      previous_bps: 800,
      latest_bps: 300,
    });
    expect(f.demand_assumptions.find((d) => d.bu_id === 'BU-CP')).toMatchObject({
      previous_bps: 600,
      latest_bps: 600,
    });
  });
  it('is served by the API handler', async () => {
    const r = await forecastPayload(db);
    expect(r.status).toBe(200);
    expect(
      (r.body as { comparison: { change_vs_previous: number } }).comparison.change_vs_previous,
    ).toBe(-50 * CR);
  });
});

describe('scenario', () => {
  it('splits the latest forecast into 768 Cr of actuals to date and 382 Cr to come', async () => {
    const b = await scenarioBase(db);
    expect(b.ytd.revenue).toBe(768 * CR);
    expect(b.remaining.revenue).toBe(382 * CR);
    expect(
      b.remaining.materials + b.remaining.labour + b.remaining.overheads + b.remaining.freight,
    ).toBeGreaterThan(0);
  });
  it('the API runs the engine on that base: volume -5% and material cost +3%', async () => {
    const r = await scenarioPayload(db, { volume: '-5', material_cost: '3' });
    expect(r.status).toBe(200);
    const body = r.body as {
      base: Parameters<typeof runScenario>[0];
      result: ReturnType<typeof runScenario>;
      calc_refs: Array<{ id: string }>;
    };
    expect(body.result).toEqual(
      runScenario(body.base, {
        volume_bps: -500,
        price_bps: 0,
        material_cost_bps: 300,
        opex_bps: 0,
      }),
    );
    expect(body.result.remaining_after.revenue).toBe(Math.round(382 * CR * 0.95));
    expect(body.result.delta.operating_profit).toBeLessThan(0);
    expect(body.result.full_year_after.revenue).toBe(
      body.result.full_year_before.revenue - Math.round(382 * CR * 0.05),
    );
    expect(body.calc_refs[0]?.id).toBe('SCN-WHI-001');
  });
  it('no parameters means no change, and decimals are accepted', async () => {
    const none = (await scenarioPayload(db, {})).body as {
      result: { delta: { operating_profit: number } };
    };
    expect(none.result.delta.operating_profit).toBe(0);
    const dec = (await scenarioPayload(db, { price: '1.5' })).body as {
      result: { shocks: { price_bps: number } };
    };
    expect(dec.result.shocks.price_bps).toBe(150);
  });
  it('rejects non-numeric and out-of-range input', async () => {
    expect((await scenarioPayload(db, { volume: 'abc' })).status).toBe(400);
    expect((await scenarioPayload(db, { opex: '51' })).status).toBe(400);
    expect((await scenarioPayload(db, { price: '-50.5' })).status).toBe(400);
    expect((await scenarioPayload(db, { material_cost: 'Infinity' })).status).toBe(400);
  });
});

describe('trend and controls', () => {
  it('shows travel, consulting and contractor overruns widening month on month', async () => {
    const t = await overrunTrend(db);
    expect(t.map((x) => x.account_id)).toEqual(['6200', '6300', '6400']);
    for (const a of t) {
      expect(a.points[0]?.period).toBe('2026-04');
      expect(a.points.at(-1)?.period).toBe('2026-11');
      const bps = a.points.map((p) => p.variance_bps as number);
      expect(bps.at(-1) as number).toBeGreaterThan(bps[1] as number);
    }
    const travel = t[0]?.points.at(-1);
    expect(travel).toMatchObject({ variance_inr: 0.8 * CR, variance_bps: 4000 });
  });
  it('offers the closed periods and the three entities', async () => {
    const c = await controlsData(db);
    expect(c.periods[0]).toBe('2026-04');
    expect(c.periods.at(-1)).toBe('2026-11');
    expect(c.periods).toHaveLength(8);
    expect(c.entities.map((e) => e.entity_id)).toEqual(['E-EU', 'E-IN', 'E-NA']);
  });
});
