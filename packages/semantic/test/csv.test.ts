import { describe, expect, it } from 'vitest';
import { parseTable, splitCsv } from '../src';

describe('splitCsv', () => {
  it('handles quotes, commas and embedded newlines', () => {
    expect(splitCsv('a,b\n"x,1","he said ""hi"""\n"l1\nl2",z\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'he said "hi"'],
      ['l1\nl2', 'z'],
    ]);
  });
  it('tolerates CRLF and a missing trailing newline', () => {
    expect(splitCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseTable', () => {
  const header = 'version_id,period,entity_id,bu_id,account_id,amount_inr';
  it('coerces numbers and validates rows', () => {
    const rows = parseTable('fact_gl', `${header}\nACT_FY27,2026-11,E-IN,BU-IE,4000,100\n`);
    expect(rows[0]?.amount_inr).toBe(100);
  });
  it('maps empty nullable cells to null and booleans to booleans', () => {
    const csv =
      'supplier_id,name,category,contract_end_period,price_escalation_bps,quality_score,alt_sources,renegotiation_candidate\nS-001,A,B,2027-01,700,90,2,true\n';
    expect(parseTable('dim_supplier', csv)[0]?.renegotiation_candidate).toBe(true);
    const v = 'version_id,name,kind,fiscal_year,as_of_period\nBUD_FY27,Budget,BUDGET,FY27,\n';
    expect(parseTable('dim_version', v)[0]?.as_of_period).toBeNull();
  });
  it('rejects wrong headers, ragged rows and invalid values', () => {
    expect(() => parseTable('fact_gl', 'a,b\n1,2\n')).toThrow(/header mismatch/);
    expect(() => parseTable('fact_gl', `${header}\nACT_FY27,2026-11,E-IN\n`)).toThrow(/cells/);
    expect(() =>
      parseTable('fact_gl', `${header}\nACT_FY27,2026-11,E-IN,BU-IE,4000,1.5\n`),
    ).toThrow();
  });
  it('rejects an empty file', () => expect(() => parseTable('fact_gl', '')).toThrow(/empty/));
});
