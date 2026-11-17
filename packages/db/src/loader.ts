import { getTableColumns, sql } from 'drizzle-orm';
import type { TableName } from '@fpa/semantic';
import type { Db } from './client';
import { LOAD_ORDER, TABLES } from './schema';

export type Row = Record<string, unknown>;
export type TableData = Record<TableName, Row[]>;

/** Stay well under Postgres' 65,535 bind-parameter limit. */
const MAX_PARAMS = 30_000;

/**
 * Replace the contents of all 19 tables inside ONE transaction: truncate, then insert in dependency
 * order. Any failure (FK, type, duplicate key) rolls everything back, leaving the previous data intact.
 */
export async function loadTables(db: Db, data: TableData): Promise<Record<TableName, number>> {
  const counts = {} as Record<TableName, number>;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`TRUNCATE TABLE ${LOAD_ORDER.join(', ')} RESTART IDENTITY CASCADE`));
    for (const name of LOAD_ORDER) {
      const table = TABLES[name];
      const rows = data[name];
      const chunk = Math.max(
        1,
        Math.floor(MAX_PARAMS / Object.keys(getTableColumns(table)).length),
      );
      for (let i = 0; i < rows.length; i += chunk) {
        await tx.insert(table).values(rows.slice(i, i + chunk) as never);
      }
      counts[name] = rows.length;
    }
  });
  return counts;
}
