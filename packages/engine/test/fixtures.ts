import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTable } from '@fpa/semantic';
import type { TableName } from '@fpa/semantic';

const dataDir = join(__dirname, '..', '..', '..', 'data');
export const loadTable = <T extends TableName>(t: T) =>
  parseTable(t, readFileSync(join(dataDir, 'fixtures', `${t}.csv`), 'utf8'));
export const loadJson = <T = unknown>(rel: string): T =>
  JSON.parse(readFileSync(join(dataDir, rel), 'utf8')) as T;
