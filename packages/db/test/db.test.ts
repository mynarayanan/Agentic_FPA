import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { TABLE_NAMES, TABLE_SCHEMAS } from '@fpa/semantic';
import { calcRegistry, pnlVariance, accountVariances } from '@fpa/engine';
import {
  LOAD_ORDER,
  factGl,
  loadTables,
  rowsOf,
  variancePayload,
  varianceReport,
  verifyLoad,
} from '../src';
import type { Db, VarianceReport } from '../src';
import { readExpected, readFixtures } from '../src/node';
import { createTestDb } from '../src/testing';
import { join } from 'node:path';

const dataDir = join(__dirname, '..', '..', '..', 'data');
const CR = 10_000_000;
let db: Db;
let close: () => Promise<void>;
const data = readFixtures(dataDir);
const expected = readExpected(dataDir);
const glRow = data.fact_gl[0] as Record<string, unknown>;

const count = async (t: string): Promise<number> =>
  Number(
    rowsOf<{ n: string }>(await db.execute(sql`select count(*)::text as n from ${sql.raw(t)}`))[0]
      ?.n,
  );

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await loadTables(db, data);
});
afterAll(async () => close());

describe('schema contract', () => {
  it('every table has exactly the columns defined by the shared Zod schema', async () => {
    for (const t of TABLE_NAMES) {
      const cols = rowsOf<{ column_name: string }>(
        await db.execute(
          sql`select column_name from information_schema.columns where table_name = ${t}`,
        ),
      )
        .map((r) => r.column_name)
        .sort();
      expect(cols, t).toEqual(Object.keys(TABLE_SCHEMAS[t].shape).sort());
    }
  });
  it('declares a primary key on every table', async () => {
    const pks = rowsOf<{ table_name: string }>(
      await db.execute(
        sql`select table_name from information_schema.table_constraints where constraint_type = 'PRIMARY KEY'`,
      ),
    ).map((r) => r.table_name);
    for (const t of TABLE_NAMES) expect(pks, t).toContain(t);
  });
  it('load order covers all 19 tables, parents first', () => {
    expect(LOAD_ORDER).toHaveLength(19);
    expect(LOAD_ORDER.indexOf('dim_entity')).toBeLessThan(LOAD_ORDER.indexOf('fact_gl'));
    expect(LOAD_ORDER.indexOf('dim_version')).toBeLessThan(LOAD_ORDER.indexOf('fx_rate'));
  });
});

describe('loader', () => {
  it('loads every row and passes all reconciliation checks', async () => {
    const checks = await verifyLoad(db, expected);
    expect(checks.length).toBeGreaterThan(30);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });
  it('stores every rupee amount as bigint (no 32-bit overflow) and returns JS numbers', async () => {
    const cols = rowsOf<{ table_name: string; column_name: string; data_type: string }>(
      await db.execute(
        sql`select table_name, column_name, data_type from information_schema.columns where column_name <> 'rate_inr' and column_name like '%\\_inr' escape '\\'`,
      ),
    );
    expect(cols.length).toBeGreaterThan(10);
    for (const c of cols) expect(c.data_type, `${c.table_name}.${c.column_name}`).toBe('bigint');
    const [one] = await db.select().from(factGl).limit(1);
    expect(typeof one?.amount_inr).toBe('number');
  });
  it('is idempotent: loading twice gives identical counts, no duplicates', async () => {
    const before = await Promise.all(TABLE_NAMES.map(count));
    await loadTables(db, data);
    expect(await Promise.all(TABLE_NAMES.map(count))).toEqual(before);
  });
  it('rolls back completely when any row violates a constraint', async () => {
    const before = await Promise.all(TABLE_NAMES.map(count));
    const bad = { ...data, fact_gl: [...data.fact_gl, { ...glRow, entity_id: 'E-XX' }] };
    await expect(loadTables(db, bad as never)).rejects.toThrow();
    expect(await Promise.all(TABLE_NAMES.map(count))).toEqual(before);
    expect((await verifyLoad(db, expected)).every((c) => c.ok)).toBe(true);
  });
  it('rejects duplicate primary keys and unknown foreign keys directly', async () => {
    await expect(db.insert(factGl).values({ ...glRow } as never)).rejects.toThrow();
    await expect(
      db.insert(factGl).values({ ...glRow, account_id: '9999' } as never),
    ).rejects.toThrow();
  });
  it('verifyLoad detects tampering', async () => {
    await db.execute(
      sql`update fact_gl set amount_inr = amount_inr + 1 where version_id = 'ACT_FY27' and period = '2026-11' and entity_id = 'E-IN' and bu_id = 'BU-IE' and account_id = '4000'`,
    );
    const failed = (await verifyLoad(db, expected)).filter((c) => !c.ok).map((c) => c.name);
    expect(failed).toContain('Nov-26 revenue actual');
    expect(failed.some((n) => n.startsWith('sales lines net amount'))).toBe(true);
    await loadTables(db, data);
    expect((await verifyLoad(db, expected)).every((c) => c.ok)).toBe(true);
  });
});

describe('variance report from the database', () => {
  let r: VarianceReport;
  beforeAll(async () => {
    r = (await varianceReport(db, { period: '2026-11' })) as VarianceReport;
  });
  it('reproduces the CFO scenario through the engine', () => {
    expect(r.pnl.revenue).toMatchObject({ budget: 100 * CR, actual: 92 * CR, variance: -8 * CR });
    expect(r.pnl.opex).toMatchObject({ variance: 4 * CR, variance_bps: 1143 });
    expect(r.pnl.operatingProfit).toMatchObject({
      budget: 15 * CR,
      actual: 8 * CR,
      variance: -7 * CR,
    });
    expect(r.revenue_bridge).toMatchObject({ total: -8 * CR, timing: -1 * CR, price: -2 * CR });
    expect(
      r.accounts
        .filter((a) => a.type === 'OPEX' && !a.favourable)
        .slice(0, 3)
        .map((a) => a.account_id),
    ).toEqual(['6300', '6400', '6200']);
  });
  it('matches the engine run directly on the CSV fixtures (database adds nothing, loses nothing)', () => {
    const rows = (v: string) =>
      data.fact_gl.filter((x) => x.version_id === v && x.period === '2026-11') as never[];
    const accounts = data.dim_account as never[];
    expect(r.pnl).toEqual(pnlVariance(rows('ACT_FY27'), rows('BUD_FY27'), accounts));
    expect(r.accounts).toEqual(accountVariances(rows('ACT_FY27'), rows('BUD_FY27'), accounts));
  });
  it('cites the calculations used, with versions', () => {
    expect(r.calc_refs.map((c) => c.id).sort()).toEqual([
      'VAR-OPX-001',
      'VAR-PNL-001',
      'VAR-REV-002',
    ]);
    for (const c of r.calc_refs)
      expect(calcRegistry.find((x) => x.id === c.id)?.version).toBe(c.version);
  });
  it('entity reports add up to the group report, including volume and mix', async () => {
    const parts = (await Promise.all(
      ['E-IN', 'E-EU', 'E-NA'].map((entity) => varianceReport(db, { period: '2026-11', entity })),
    )) as VarianceReport[];
    const sum = (f: (x: VarianceReport) => number) => parts.reduce((s, x) => s + f(x), 0);
    expect(sum((x) => x.pnl.revenue.variance)).toBe(r.pnl.revenue.variance);
    expect(sum((x) => x.pnl.operatingProfit.variance)).toBe(r.pnl.operatingProfit.variance);
    for (const k of ['budget', 'actual', 'timing', 'price', 'volume', 'mix', 'total'] as const) {
      expect(
        sum((x) => (x.revenue_bridge as NonNullable<typeof x.revenue_bridge>)[k]),
        k,
      ).toBe((r.revenue_bridge as NonNullable<typeof r.revenue_bridge>)[k]);
    }
    for (const x of parts) {
      const b = x.revenue_bridge as NonNullable<typeof x.revenue_bridge>;
      expect(b.total).toBe(b.actual - b.budget);
    }
  });
  it('omits the bridge for periods without sales-line detail', async () => {
    const oct = await varianceReport(db, { period: '2026-10' });
    expect(oct?.revenue_bridge).toBeNull();
    expect(oct?.calc_refs.map((c) => c.id)).not.toContain('VAR-REV-002');
    expect(oct?.pnl.revenue.budget).toBe(102 * CR);
    expect(oct?.pnl.revenue.actual).toBe(100 * CR);
  });
  it('returns null when there is no actual data (future period)', async () => {
    expect(await varianceReport(db, { period: '2027-01' })).toBeNull();
  });
});

describe('variancePayload (API contract)', () => {
  it('200 with the report by default and for a valid entity', async () => {
    expect((await variancePayload(db, {})).status).toBe(200);
    const res = await variancePayload(db, { period: '2026-11', entity: 'E-IN' });
    expect(res.status).toBe(200);
    expect((res.body as VarianceReport).entity_id).toBe('E-IN');
  });
  it('400 for malformed input, 404 when there is no data', async () => {
    expect((await variancePayload(db, { period: '2026-13' })).status).toBe(400);
    expect((await variancePayload(db, { period: "2026-11'; drop table fact_gl;--" })).status).toBe(
      400,
    );
    expect((await variancePayload(db, { entity: 'india' })).status).toBe(400);
    expect((await variancePayload(db, { period: '2027-02' })).status).toBe(404);
    expect((await variancePayload(db, { period: '2026-11', entity: 'E-ZZ' })).status).toBe(404);
  });
  it('the JSON body survives serialisation unchanged', async () => {
    const res = await variancePayload(db, {});
    expect(JSON.parse(JSON.stringify(res.body))).toEqual(res.body);
  });
});
