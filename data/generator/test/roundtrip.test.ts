import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE_NAMES, parseTable } from '@fpa/semantic';
import { generateDataset } from '../src';

describe('committed fixtures', () => {
  const ds = generateDataset();
  for (const t of TABLE_NAMES) {
    it(`${t}.csv parses back to exactly the generated rows`, () => {
      const text = readFileSync(join(__dirname, '..', '..', 'fixtures', `${t}.csv`), 'utf8');
      expect(parseTable(t, text)).toEqual(ds.tables[t]);
    });
  }
});
