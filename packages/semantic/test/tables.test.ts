import { describe, expect, it } from 'vitest';
import { TABLE_NAMES, TABLE_SCHEMAS } from '../src';

describe('semantic table schemas', () => {
  it('covers all 19 dataset tables', () => expect(TABLE_NAMES).toHaveLength(19));
  it('rejects fractional rupees in the GL', () => {
    const bad = {
      version_id: 'ACT_FY27',
      period: '2026-11',
      entity_id: 'E-IN',
      bu_id: 'BU-IE',
      account_id: '4000',
      amount_inr: 1.5,
    };
    expect(TABLE_SCHEMAS.fact_gl.safeParse(bad).success).toBe(false);
  });
  it('accepts a valid GL row', () => {
    const ok = {
      version_id: 'ACT_FY27',
      period: '2026-11',
      entity_id: 'E-IN',
      bu_id: 'BU-IE',
      account_id: '4000',
      amount_inr: 100,
    };
    expect(TABLE_SCHEMAS.fact_gl.safeParse(ok).success).toBe(true);
  });
});
